// src/components/CallPage.jsx
import { useEffect, useRef, useState } from "react";
import { socket, connectSocket } from "../socket";
import api from "../api";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // add TURN server here for production
  ],
};

export default function CallPage({ currentUserId, targetUserId }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [callId, setCallId] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [isCaller, setIsCaller] = useState(false);

  useEffect(() => {
    // Connect socket and register the user
    connectSocket(currentUserId);

    // Listen for incoming call (server emits "incomingCall")
    socket.on("incomingCall", async (data) => {
      // data: { callerId, recipientId, callId, offer }
      console.log("incomingCall socket event", data);
      if (data.recipientId !== currentUserId) return;

      setCallId(data.callId);
      setIsCaller(false);
      await handleIncomingCall(data);
    });

    // Listen for answer (server emits "answer")
    socket.on("answer", async (data) => {
      // data: { callId, answer }
      console.log("answer socket event", data);
      if (data.callId !== callId) {
        // maybe multiple calls; ignore if not current
        console.warn("answer for different call", data.callId);
        return;
      }
      if (!pcRef.current) {
        console.warn("pc missing when answer arrived");
        return;
      }
      const desc = { sdp: data.answer.sdp, type: data.answer.type };
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(desc));
      console.log("Remote description (answer) set on caller");
    });

    // Listen for ICE candidate from server (server emits "iceCandidate")
    socket.on("iceCandidate", async (data) => {
      // data: { callId, candidate }
      // candidate: { candidate, sdpMid, sdpMLineIndex }
      // console.log("iceCandidate event:", data);
      if (data.callId !== callId) return;
      const c = data.candidate;
      if (!c || !pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(
          new RTCIceCandidate({
            candidate: c.candidate,
            sdpMid: c.sdpMid,
            sdpMLineIndex: c.sdpMLineIndex,
          })
        );
        //console.log("Remote ICE candidate added");
      } catch (e) {
        console.warn("Error adding remote ICE candidate:", e);
      }
    });

    // Listen for endCall (server emits "endCall")
    socket.on("endCall", (data) => {
      console.log("endCall event", data);
      if (data.callId !== callId) return;
      endCallLocal();
    });

    return () => {
      socket.off("incomingCall");
      socket.off("answer");
      socket.off("iceCandidate");
      socket.off("endCall");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, currentUserId]);

  // Utility: get local media
  const startLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  // Create RTCPeerConnection and hook events
  const createPeerConnection = async () => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // add local tracks later (after getUserMedia)
    // remote stream handling
    pc.ontrack = (event) => {
      // attach remote stream
      if (event.streams && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      } else {
        // sometimes browsers provide track instead of streams
        const inboundStream = new MediaStream();
        inboundStream.addTrack(event.track);
        remoteVideoRef.current.srcObject = inboundStream;
      }
    };

    // local ICE candidate -> send to server via API
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Local ICE generated:", event.candidate);
        // POST candidate to server which will emit to remote user
        sendIceCandidateApi(callId, targetUserId, event.candidate);
        // Note: API expects targetUserId (server will look up socket)
        // If your API needs both callerId/receiverId adjust accordingly
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("PC connection state:", pc.connectionState);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        // cleanup if needed
        // endCallLocal();
      }
    };

    return pc;
  };

  // ---------- Caller flow ----------
  const startCall = async () => {
    setIsCaller(true);
    // 1) Create DB call record: POST /call -> returns call object (contains id)
    // Note: your createCallSchema probably expects recipientId in body. Adjust keys if different.
    const createRes = await api.post("/", { recipientId: targetUserId });
    const createdCall = createRes.data; // assume API returns created call object
    const cid = createdCall.id || createdCall.callId || createdCall.data?.id;
    if (!cid) {
      console.error("createCall did not return call id", createdCall);
      return;
    }
    setCallId(cid);

    // 2) Prepare local media & pc
    const stream = await startLocalStream();
    const pc = await createPeerConnection();

    // add local tracks
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // 3) create offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    console.log("offer")

    // 4) update call with offer (PUT /call) - your updateCallSchema expects callId and offer
    await api.put("/", {
      callId: cid,
      offer: { type: offer.type, sdp: offer.sdp },
      // optionally pass registrationToken if you have one to notify via push
    });

    setInCall(true);
    console.log("Offer sent via updateCall API, waiting for answer...");
  };

  // ---------- Receiver flow ----------
  const handleIncomingCall = async (data) => {
    // data: { callerId, recipientId, callId, offer }
    // show UI to accept/reject - for simplicity we auto-accept here
    console.log("handleIncomingCall", data);
    const { offer, callerId, callId: incomingCallId } = data;

    // prepare local stream and PC
    const stream = await startLocalStream();
    const pc = await createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // set remote description (offer from caller)
    const remoteDesc = new RTCSessionDescription({
      type: offer.type,
      sdp: offer.sdp,
    });
    await pc.setRemoteDescription(remoteDesc);

    // create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // call accept API - PUT /accept
    await api.put("/accept", {
      callId: incomingCallId,
      answer: { type: answer.type, sdp: answer.sdp },
    });

    setCallId(incomingCallId);
    setInCall(true);
    setIsCaller(false);
    console.log("Answer created and sent to server via acceptCall API");
  };

  // send ICE candidate via API
  const sendIceCandidateApi = async (cid, targetUser, candidate) => {
    if (!cid) return;
    try {
      // POST /sendIceCandidate
      // expected body: { callId, candidate, targetUserId }
      await api.post("/sendIceCandidate", {
        callId: cid,
        // 'targetUserId' helps server route it to the correct socket
        profileId: targetUser,
        candidate: {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        },
      });
    } catch (err) {
      console.warn("sendIceCandidate API failed:", err);
    }
  };

  // End call (user-initiated)
  const endCall = async () => {
    if (!callId) return;
    try {
      await api.put("/end", { callId });
    } catch (err) {
      console.warn("endCall API error", err);
    } finally {
      endCallLocal();
    }
  };

  // local cleanup
  const endCallLocal = () => {
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => {
          if (s.track) s.track.stop();
        });
        pcRef.current.close();
        pcRef.current = null;
      }
    } catch (e) {
      // ignore
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setInCall(false);
    setCallId(null);
    setIsCaller(false);
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Call Page</h2>
      <div style={{ display: "flex", gap: 12 }}>
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          style={{ width: 300, height: 200, background: "#000" }}
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: 300, height: 200, background: "#000" }}
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <button onClick={startCall} disabled={inCall}>
          Start Call (caller)
        </button>
        <button onClick={endCall} disabled={!inCall}>
          End Call
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div>Current user: {currentUserId}</div>
        <div>Target user: {targetUserId}</div>
        <div>CallId: {callId || "-"}</div>
        <div>In call: {String(inCall)}</div>
        <div>Role: {isCaller ? "Caller" : "Receiver"}</div>
      </div>
    </div>
  );
}

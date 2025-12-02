// src/components/CallPage.jsx
import { useEffect, useRef, useState } from "react";
import { socket, connectSocket } from "../socket";
import api from "../api";
import Cookies from "js-cookie";

const ICE_SERVERS = {
  iceServers: [
    {
      urls: "stun:stun.relay.metered.ca:80",
    },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "d0dc73ffd06b193670acdc79",
      credential: "lFvlKr/ArCoGHPzO",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "d0dc73ffd06b193670acdc79",
      credential: "lFvlKr/ArCoGHPzO",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "d0dc73ffd06b193670acdc79",
      credential: "lFvlKr/ArCoGHPzO",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "d0dc73ffd06b193670acdc79",
      credential: "lFvlKr/ArCoGHPzO",
    },
  ],
};

export default function CallPage() {
  const nickName = Cookies.get("nickName");
  const currentUserId = Cookies.get("profileId");
  const [targetedUserId, setTargetedUserId] = useState("8b49e8e4-8639-4cc2-8ebe-21f6c8319fef");
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const [callId, setCallId] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState(null); // store incoming call

  useEffect(() => {
    connectSocket(currentUserId);

    socket.on("incomingCall", (data) => {
      if (data.recipientId !== currentUserId) return;
      console.log("Incoming call:", data);

      setIncomingCallData(data); // show accept button
      setCallId(data.callId);
      setIsCaller(false);
    });

    socket.on("answer", async (data) => {
      if (data.callId !== callId || !pcRef.current) return;
      await pcRef.current.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
    });

    socket.on("iceCandidate", async (data) => {
      // data: { callId, candidate }
      // candidate: { candidate, sdpMid, sdpMLineIndex }
      if (data.callId !== callId) {
        console.warn("ICE candidate for different callId:", data.callId);
        return;
      }
      console.log("Received remote ICE candidate:", data);

      const c = data.iceCandidate;
      if (!c || !pcRef.current) {
        console.warn("No candidate or pcRef in iceCandidate event");
        return;
      }
      try {
        await pcRef.current.addIceCandidate(
          new RTCIceCandidate({
            candidate: c.candidate,
            sdpMid: c.sdpMid,
            sdpMLineIndex: c.sdpMLineIndex,
          })
        );
        console.log("Remote ICE candidate added");
      } catch (e) {
        console.error("Error adding remote ICE candidate:", e);
      }
    });

    socket.on("endCall", (data) => {
      if (data.callId === callId) endCallLocal();
    });

    return () => {
      socket.off("incomingCall");
      socket.off("answer");
      socket.off("iceCandidate");
      socket.off("endCall");
    };
  }, [callId, currentUserId]);

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

  const createPeerConnection = async () => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0])
        remoteVideoRef.current.srcObject = event.streams[0];
      else {
        const inboundStream = new MediaStream();
        inboundStream.addTrack(event.track);
        remoteVideoRef.current.srcObject = inboundStream;
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) sendIceCandidateApi(callId, event.candidate);
    };

    return pc;
  };

  // ---------- Caller flow ----------
  const startCall = async () => {
    setIsCaller(true);
    // 1) Create DB call record: POST /call -> returns call object (contains id)
    // Note: your createCallSchema probably expects recipientId in body. Adjust keys if different.
    const createRes = await api.post("/", { recipientId: targetedUserId });
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

    console.log("offer");

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
  const acceptCall = async () => {
    if (!incomingCallData) return;

    const { offer, callId: incomingCallId } = incomingCallData;

    const stream = await startLocalStream();
    const pc = await createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await api.put("/accept", {
      callId: incomingCallId,
      answer: { type: answer.type, sdp: answer.sdp },
    });

    setInCall(true);
    setIncomingCallData(null);
  };

  const sendIceCandidateApi = async (cid, candidate) => {
    if (!cid) return;
    console.log("Sending ICE candidate via API:", candidate);
    await api.post("/iceCandidate", {
      callId: cid,
      profileId: targetedUserId ? targetedUserId : currentUserId,
      iceCandidate: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      },
    });
  };

  const endCall = async () => {
    if (!callId) return;
    try {
      await api.put("/end", { callId });
    } catch {
    } finally {
      endCallLocal();
    }
  };

  const endCallLocal = () => {
    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => s.track?.stop());
      pcRef.current.close();
      pcRef.current = null;
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
    setIncomingCallData(null);
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

      {incomingCallData && !inCall && (
        <div
          style={{
            marginTop: 16,
            padding: 10,
            background: "#ffc",
            border: "1px solid #cc9",
          }}
        >
          <div>Incoming call from {incomingCallData.callerId}</div>
          <button onClick={acceptCall}>Accept Call</button>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div>Current user: {currentUserId}</div>
        <div>Target user: {targetedUserId}</div>
        <input
          type="text"
          placeholder="Targeted user id"
          className="border border-gray-400 rounded-md p-2"
          onChange={(e) => {
            setTargetedUserId(e.target.value);
          }}
        />
        <button
          onClick={startCall}
          disabled={inCall}
          className="bg-green-500 p-3 rounded-lg cursor-pointer"
        >
          Start Call (Caller)
        </button>

        <button
          onClick={endCall}
          disabled={!inCall}
          className="bg-red-500 text-white p-3 rounded-lg cursor-pointer"
        >
          End Call
        </button>

        <div>CallId: {callId || "-"}</div>
        <div>In call: {String(inCall)}</div>
        <div>Role: {isCaller ? "Caller" : "Receiver"}</div>
      </div>
    </div>
  );
}

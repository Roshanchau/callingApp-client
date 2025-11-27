// src/components/CallPage.jsx
import { useEffect, useRef, useState } from "react";
import { socket, connectSocket } from "../socket";
import api from "../api";

/*
  Audio-only CallPage with:
  - Buffered remote ICE candidates
  - Both sides send ICE candidates via /iceCandidate API
  - Offer/Answer via / (PUT) and /accept (PUT) as per your backend
  - Incoming call UI (Accept / Reject)
*/

const ICE_SERVERS = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

export default function CallPage({ currentUserId, targetUserId }) {
  // audio elements (we keep <video> refs in previous UI names — but using audio-only stream)
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  const pendingRemoteCandidates = useRef([]); // buffer remote ICE candidates until remoteDescription is set

  const [callId, setCallId] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState(null);

  // Connect socket and set up listeners
  useEffect(() => {
    connectSocket(currentUserId);

    socket.on("incomingCall", (data) => {
      // { callerId, recipientId, callId, offer }
      if (data.recipientId !== currentUserId) return;
      console.log("Incoming call:", data);
      setIncomingCallData(data);
      setCallId(data.callId);
      setIsCaller(false);
    });

    // remote answer arrives (caller side)
    socket.on("answer", async (data) => {
      // { callId, answer }
      if (data.callId !== callId) return;
      console.log("Socket answer event:", data);
      if (!pcRef.current) {
        console.warn("No pcRef when answer arrived");
        return;
      }
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        // apply buffered remote candidates after setting remote description
        await applyBufferedCandidates();
      } catch (e) {
        console.error("Failed to apply remote answer:", e);
      }
    });

    // remote ICE candidate arrives
    socket.on("iceCandidate", async (data) => {
      // { callId, candidate OR iceCandidate depending on backend shape }
      if (data.callId !== callId) {
        console.warn("ICE candidate for different callId:", data.callId);
        return;
      }
      const c = data.candidate || data.iceCandidate || data.iceCandidatePayload || null;
      if (!c) {
        console.warn("Received iceCandidate event with no candidate payload", data);
        return;
      }
      // If pc or remoteDescription not ready, buffer it
      if (!pcRef.current || !pcRef.current.remoteDescription || pcRef.current.remoteDescription.type === null) {
        console.log("Buffering remote ICE candidate (remoteDescription not set yet)");
        pendingRemoteCandidates.current.push(c);
        return;
      }

      try {
        // Construct safe candidate (avoid passing null sdpMid / sdpMLineIndex)
        const rtcCandidate = {};
        if (c.candidate) rtcCandidate.candidate = c.candidate;
        if (c.sdpMid) rtcCandidate.sdpMid = c.sdpMid;
        if (c.sdpMLineIndex != null) rtcCandidate.sdpMLineIndex = c.sdpMLineIndex;

        await pcRef.current.addIceCandidate(new RTCIceCandidate(rtcCandidate));
        console.log("Added remote ICE candidate");
      } catch (e) {
        console.error("Error adding remote ICE candidate:", e);
      }
    });

    socket.on("endCall", (data) => {
      if (data.callId === callId) endCallLocal();
    });

    socket.on("callRejected", (data) => {
      if (data.callId === callId) {
        console.log("Call rejected by remote");
        endCallLocal();
      }
    });

    return () => {
      socket.off("incomingCall");
      socket.off("answer");
      socket.off("iceCandidate");
      socket.off("endCall");
      socket.off("callRejected");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, currentUserId]);

  // apply buffered candidates (call after remoteDescription is set)
  const applyBufferedCandidates = async () => {
    if (!pcRef.current) return;
    if (!pendingRemoteCandidates.current.length) return;
    console.log("Applying buffered candidates:", pendingRemoteCandidates.current.length);
    for (const c of pendingRemoteCandidates.current) {
      try {
        const rtcCandidate = {};
        if (c.candidate) rtcCandidate.candidate = c.candidate;
        if (c.sdpMid) rtcCandidate.sdpMid = c.sdpMid;
        if (c.sdpMLineIndex != null) rtcCandidate.sdpMLineIndex = c.sdpMLineIndex;
        await pcRef.current.addIceCandidate(new RTCIceCandidate(rtcCandidate));
      } catch (e) {
        console.warn("Failed to add buffered ICE candidate:", e);
      }
    }
    pendingRemoteCandidates.current = [];
  };

  // get local audio (audio-only)
  const startLocalStream = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;

    if (localAudioRef.current) {
      localAudioRef.current.srcObject = stream;
      localAudioRef.current.muted = true; // mute local preview
    }

    // Outgoing audio meter for debug (console)
    // try {
    //   const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    //   const src = audioCtx.createMediaStreamSource(stream);
    //   const analyser = audioCtx.createAnalyser();
    //   analyser.fftSize = 256;
    //   src.connect(analyser);
    //   const dataArray = new Uint8Array(analyser.frequencyBinCount);
    //   const meter = () => {
    //     analyser.getByteFrequencyData(dataArray);
    //     let sum = 0;
    //     for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    //     const level = Math.round(sum / dataArray.length);
    //     console.log("📤 OUTGOING AUDIO LEVEL:", level);
    //     requestAnimationFrame(meter);
    //   };
    //   meter();
    // } catch (e) {
    //   console.warn("Outgoing audio meter failed:", e);
    // }

    return stream;
  };

  // create PeerConnection and wire events
  const createPeerConnection = () => {
    // if existing pc, close it first
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch (e) {}
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // When remote track arrives
    pc.ontrack = (event) => {
      console.log("ontrack event:", event);
      const remoteStream = event.streams && event.streams[0] ? event.streams[0] : null;
      if (remoteStream && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        // attempt to play
        remoteAudioRef.current.play().catch(() => {
          console.log("Remote audio autoplay may be blocked until user interacts.");
        });

        // Incoming audio meter (console)
        // try {
        //   const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        //   const src = audioCtx.createMediaStreamSource(remoteStream);
        //   const analyser = audioCtx.createAnalyser();
        //   analyser.fftSize = 256;
        //   src.connect(analyser);
        //   const dataArray = new Uint8Array(analyser.frequencyBinCount);
        //   const meter = () => {
        //     analyser.getByteFrequencyData(dataArray);
        //     let sum = 0;
        //     for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        //     const level = Math.round(sum / dataArray.length);
        //     console.log("📥 INCOMING AUDIO LEVEL:", level);
        //     requestAnimationFrame(meter);
        //   };
        //   meter();
        // } catch (e) {
        //   console.warn("Incoming audio meter failed:", e);
        // }
      } else {
        // fallback: attach the single track to a new MediaStream
        if (event.track && remoteAudioRef.current) {
          const inbound = new MediaStream([event.track]);
          remoteAudioRef.current.srcObject = inbound;
          remoteAudioRef.current.play().catch(() => {});
        }
      }
    };

    // local ICE candidate -> send to backend (which forwards to remote via socket)
    pc.onicecandidate = (event) => {
      if (event.candidate) sendIceCandidateApi(callId, targetUserId, event.candidate);
    };

    // connection state change logging
    pc.onconnectionstatechange = () => {
      console.log("pc.connectionState =", pc.connectionState, "iceConnectionState =", pc.iceConnectionState);
      if (pc.connectionState === "failed" || pc.iceConnectionState === "failed") {
        console.warn("PeerConnection failed - you may need TURN or check network");
      }
    };

    return pc;
  };

  // ---------- Caller flow ----------
  const startCall = async () => {
    setIsCaller(true);
    try {
      // create call record on server (POST /)
      const createRes = await api.post("/", { recipientId: targetUserId });
      const createdCall = createRes.data;
      const cid = createdCall.id || createdCall.callId || createdCall.data?.id;
      if (!cid) {
        console.error("createCall did not return call id", createdCall);
        return;
      }
      setCallId(cid);

      // get mic, create pc and add local track(s)
      const stream = await startLocalStream();
      const pc = createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // create offer and set local description
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // send the offer to backend (PUT /) — your updateCall API
      await api.put("/", {
        callId: cid,
        offer: { type: offer.type, sdp: offer.sdp },
        // optionally registrationToken for push notifications
      });

      setInCall(true);
      console.log("Offer sent, waiting for answer...");
    } catch (e) {
      console.error("startCall failed:", e);
    }
  };

  // ---------- Receiver flow ----------
  const acceptCall = async () => {
    if (!incomingCallData) return;
    try {
      const { offer, callId: incomingCallId } = incomingCallData;
      // ensure callId is set
      setCallId(incomingCallId);

      const stream = await startLocalStream();
      const pc = createPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // set remote description (offer)
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // apply any buffered candidates that arrived before remoteDescription
      await applyBufferedCandidates();

      // create and set local answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // send answer to backend (PUT /accept)
      await api.put("/accept", {
        callId: incomingCallId,
        answer: { type: answer.type, sdp: answer.sdp },
      });

      setInCall(true);
      setIncomingCallData(null);
      console.log("Answer created and sent");
    } catch (e) {
      console.error("acceptCall failed:", e);
    }
  };

  const rejectCall = async () => {
    if (!incomingCallData) return;
    try {
      await api.put("/reject", { callId: incomingCallData.callId });
    } catch (e) {
      console.warn("rejectCall failed:", e);
    } finally {
      setIncomingCallData(null);
      setCallId(null);
    }
  };

  // send ICE candidate to backend API
  const sendIceCandidateApi = async (cid, profileId, candidate) => {
    if (!cid || !profileId || !candidate) return;
    try {
      // match your sendIceCandidateSchema: { profileId, callId, candidate } or { iceCandidate } adjust if needed
      await api.post("/iceCandidate", {
        profileId,
        callId: cid,
        iceCandidate: {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        },
      });
      console.log("Sent ICE candidate to next user");
    } catch (e) {
      console.warn("sendIceCandidateApi failed:", e);
      throw e;
    }
  };

  // End call
  const endCall = async () => {
    if (!callId) return;
    try {
      await api.put("/end", { callId });
    } catch (e) {
      console.warn("end call API failed:", e);
    } finally {
      endCallLocal();
    }
  };

  // Local cleanup
  const endCallLocal = () => {
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((s) => s.track?.stop());
        pcRef.current.close();
        pcRef.current = null;
      }
    } catch (e) {
      console.warn("Error closing pc:", e);
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (localAudioRef.current) localAudioRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    setInCall(false);
    setCallId(null);
    setIsCaller(false);
    setIncomingCallData(null);
    pendingRemoteCandidates.current = [];
  };

  // UI
  return (
    <div style={{ padding: 16 }}>
      <h2>Audio Call Page</h2>

      <div style={{ display: "flex", gap: 12 }}>
        <audio ref={localAudioRef} autoPlay muted style={{ display: "none" }} />
        <audio ref={remoteAudioRef} autoPlay />
      </div>

      <div style={{ marginTop: 16 }}>
        {!inCall && incomingCallData && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              background: "#fff4c2",
              border: "1px solid #e0c070",
            }}
          >
            <div style={{ marginBottom: 8 }}>Incoming call from {incomingCallData.callerId}</div>
            <button onClick={acceptCall} style={{ marginRight: 8 }}>
              Accept
            </button>
            <button onClick={rejectCall}>Reject</button>
          </div>
        )}

        <button onClick={startCall} disabled={inCall} style={{ marginRight: 8 }}>
          Start Call (Caller)
        </button>
        <button onClick={endCall} disabled={!inCall}>
          End Call
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <div>Current user: {currentUserId}</div>
        <div>Target user: {targetUserId}</div>
        <div>CallId: {callId || "-"}</div>
        <div>In call: {String(inCall)}</div>
        <div>Role: {isCaller ? "Caller" : "Receiver"}</div>
      </div>
    </div>
  );
}

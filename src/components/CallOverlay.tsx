import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { Profile, Call } from '../types';
import { PhoneOff, Phone, Mic, MicOff, Video, VideoOff, ShieldAlert, Minimize2, Maximize2, RefreshCw, UserPlus, Smile, Circle, Square } from 'lucide-react';
import { saveFileToLocalStorage } from '../utils/indexedDB';

interface CallOverlayProps {
  currentCall: Call;
  currentUser: Profile;
  peerProfile: Profile;
  sendBroadcastEvent?: (event: string, payload: any) => void;
  onClose: (statusMessage?: string) => void;
  onUpdateCallStatus?: (status: Call['status']) => void;
  allProfiles?: Profile[];
}

export default function CallOverlay({ 
  currentCall, 
  currentUser, 
  peerProfile, 
  sendBroadcastEvent, 
  onClose, 
  onUpdateCallStatus,
  allProfiles = []
}: CallOverlayProps) {
  const [callStatus, setCallStatus] = useState<Call['status']>(currentCall.status);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(currentCall.type === 'video');
  const [errorMessage, setErrorMessage] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Multi-party calling states (Requirement 3 & 4)
  const [participants, setParticipants] = useState<Profile[]>([peerProfile]);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);

  // Group call dynamic active participants presence
  const [activeGroupParticipants, setActiveGroupParticipants] = useState<Record<string, { id: string, username: string, display_name: string, avatar_url: string | null, lastSeen: number }>>({});

  useEffect(() => {
    if (callStatus !== 'accepted' || currentCall.receiver_id !== 'general') return;

    // 1. Broadcast our presence immediately, and then every 3 seconds
    const sendHeartbeat = () => {
      if (sendBroadcastEvent) {
        sendBroadcastEvent('vyper_group_call_heartbeat', {
          callId: currentCall.id,
          profile: {
            id: currentUser.id,
            username: currentUser.username,
            display_name: currentUser.display_name,
            avatar_url: currentUser.avatar_url,
          }
        });
      }
    };

    sendHeartbeat();
    const broadcastInterval = setInterval(sendHeartbeat, 3000);

    // 2. Setup event listener for incoming heartbeats
    const handleHeartbeat = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.callId === currentCall.id && detail.profile) {
        const p = detail.profile;
        if (p.id === currentUser.id) return; // skip ourselves
        
        setActiveGroupParticipants((prev) => ({
          ...prev,
          [p.id]: {
            id: p.id,
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            lastSeen: Date.now(),
          }
        }));
      }
    };

    // 3. Setup event listener for when a participant explicitly leaves
    const handleLeave = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.callId === currentCall.id && detail.userId) {
        setActiveGroupParticipants((prev) => {
          if (!prev[detail.userId]) return prev;
          const updated = { ...prev };
          delete updated[detail.userId];
          return updated;
        });
      }
    };

    window.addEventListener('vyper_group_call_heartbeat', handleHeartbeat);
    window.addEventListener('vyper_group_call_leave', handleLeave);

    // 4. Periodically prune participants who haven't sent a heartbeat for 8 seconds
    const pruneInterval = setInterval(() => {
      const now = Date.now();
      setActiveGroupParticipants((prev) => {
        let changed = false;
        const updated = { ...prev };
        Object.keys(updated).forEach((id) => {
          if (now - updated[id].lastSeen > 8000) {
            delete updated[id];
            changed = true;
          }
        });
        return changed ? updated : prev;
      });
    }, 2000);

    return () => {
      clearInterval(broadcastInterval);
      clearInterval(pruneInterval);
      window.removeEventListener('vyper_group_call_heartbeat', handleHeartbeat);
      window.removeEventListener('vyper_group_call_leave', handleLeave);
    };
  }, [callStatus, currentCall.id, currentCall.receiver_id, currentUser, sendBroadcastEvent]);

  // Live interactive reactions (Requirement 3.2)
  interface ActiveReaction {
    id: string;
    emoji: string;
    senderName: string;
    senderId: string;
    x: number;
  }
  const [activeReactions, setActiveReactions] = useState<ActiveReaction[]>([]);
  const [showReactions, setShowReactions] = useState(false);
  const [isEditingReactions, setIsEditingReactions] = useState(false);
  const [listedReactions, setListedReactions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vyper_unified_reaction_emojis_v2');
      return saved ? JSON.parse(saved) : ['❤️', '👍', '🔥', '🎉', '😮', '😂', '👏', '🙏', '😢', '💯'];
    } catch (e) {
      return ['❤️', '👍', '🔥', '🎉', '😮', '😂', '👏', '🙏', '😢', '💯'];
    }
  });

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Call Recording State (Requirement 2 & 3)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<'screen' | 'voice' | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamToRecordRef = useRef<MediaStream | null>(null);

  const startRecording = async (type: 'screen' | 'voice') => {
    try {
      recordedChunksRef.current = [];
      let recordStream: MediaStream;

      if (type === 'screen') {
        try {
          // Attempt display/screen recording with audio
          recordStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        } catch (e) {
          console.warn("Screen capture failed/denied, falling back to active streams:", e);
          // Fallback: combine all tracks from local and remote streams
          const tracks: MediaStreamTrack[] = [];
          if (localVideoRef.current?.srcObject instanceof MediaStream) {
            (localVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => tracks.push(t));
          }
          if (remoteVideoRef.current?.srcObject instanceof MediaStream) {
            (remoteVideoRef.current.srcObject as MediaStream).getTracks().forEach(t => tracks.push(t));
          }
          if (tracks.length === 0 && streamRef.current) {
            streamRef.current.getTracks().forEach(t => tracks.push(t));
          }
          if (tracks.length === 0) {
            // Last resort fallback
            recordStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          } else {
            recordStream = new MediaStream(tracks);
          }
        }
      } else {
        // Voice/Audio only recording
        const tracks: MediaStreamTrack[] = [];
        if (localVideoRef.current?.srcObject instanceof MediaStream) {
          (localVideoRef.current.srcObject as MediaStream).getAudioTracks().forEach(t => tracks.push(t));
        }
        if (remoteVideoRef.current?.srcObject instanceof MediaStream) {
          (remoteVideoRef.current.srcObject as MediaStream).getAudioTracks().forEach(t => tracks.push(t));
        }
        if (tracks.length === 0 && streamRef.current) {
          streamRef.current.getAudioTracks().forEach(t => tracks.push(t));
        }
        if (tracks.length === 0) {
          // Last resort fallback
          recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          recordStream = new MediaStream(tracks);
        }
      }

      streamToRecordRef.current = recordStream;

      let options = {};
      if (type === 'screen') {
        const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
        const chosenType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';
        if (chosenType) options = { mimeType: chosenType };
      } else {
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
        const chosenType = mimeTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';
        if (chosenType) options = { mimeType: chosenType };
      }

      const mediaRecorder = new MediaRecorder(recordStream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blobType = type === 'screen' ? 'video/webm' : 'audio/webm';
        const blob = new Blob(recordedChunksRef.current, { type: blobType });

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const ext = 'webm';
          const fileName = `call_record_${Date.now()}.${ext}`;
          const fileType = type === 'screen' ? 'video/webm' : 'audio/webm';

          // Save to IndexedDB
          await saveFileToLocalStorage(fileName, fileType, base64data);

          // Forward to user's private chat
          const chatRoomId = `me:${currentUser.id}`;
          const textMessage = `🎥 Call Recording [${type === 'screen' ? 'Video/Screen' : 'Voice'}] saved automatically.`;

          const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`;
          const dbPayload = {
            id: msgId,
            chat_id: chatRoomId,
            sender_id: currentUser.id,
            text: textMessage,
            file_name: fileName,
            file_type: fileType,
            file_data: base64data,
            is_voice: type === 'voice',
          };

          try {
            const { error } = await supabase.from('messages').insert(dbPayload);
            if (error) console.error("Failed to forward call record to private chat:", error);

            // Notify local UI
            window.dispatchEvent(new CustomEvent('vyper_new_local_message', { detail: dbPayload }));
          } catch (err) {
            console.error("Error inserting recording:", err);
          }
        };

        // Stop all track media streams
        if (streamToRecordRef.current) {
          streamToRecordRef.current.getTracks().forEach(track => track.stop());
          streamToRecordRef.current = null;
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingType(type);
    } catch (err) {
      console.warn("Failed to start call recording:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("Error stopping recorder:", e);
      }
    }
    setIsRecording(false);
    setRecordingType(null);
  };
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const earlySignalingQueueRef = useRef<any[]>([]);
  const pendingCandidatesRef = useRef<any[]>([]);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const isCaller = currentCall.caller_id === currentUser.id;

  const remotePeerIdRef = useRef<string | null>(
    currentCall.receiver_id === 'general'
      ? (isCaller ? null : currentCall.caller_id)
      : peerProfile.id
  );

  const sendSignal = (type: string, extraData: any = {}) => {
    if (!sendBroadcastEvent) return;
    const targetId = remotePeerIdRef.current || (currentCall.receiver_id === 'general' ? 'general' : peerProfile.id);
    sendBroadcastEvent('webrtc_signaling', {
      type,
      senderId: currentUser.id,
      receiverId: targetId,
      callId: currentCall.id,
      ...extraData
    });
  };

  // Sync callStatus when currentCall.status changes
  useEffect(() => {
    setCallStatus(currentCall.status);
    if (currentCall.status === 'rejected') {
      onClose('Call was declined');
    } else if (currentCall.status === 'ended') {
      onClose('Call ended');
    }
  }, [currentCall.status, onClose]);

  // Synchronize participants and reactions in real-time (Requirements 3.2 & 3.3)
  useEffect(() => {
    const handleParticipantAdded = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.callId === currentCall.id && detail.profile) {
        setParticipants((prev) => {
          if (prev.some((p) => p.id === detail.profile.id)) return prev;
          return [...prev, detail.profile];
        });
      }
    };

    const handleLiveReaction = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.callId === currentCall.id) {
        const id = `react_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const newReact = {
          id,
          emoji: detail.emoji,
          senderName: detail.senderName,
          senderId: detail.senderId,
          x: Math.random() * 80 + 10, // 10% to 90% horizontal range
        };
        setActiveReactions((prev) => [...prev, newReact]);

        // Auto remove reaction after 3 seconds
        setTimeout(() => {
          setActiveReactions((prev) => prev.filter((r) => r.id !== id));
        }, 3000);
      }
    };

    window.addEventListener('vyper_call_participant_added', handleParticipantAdded);
    window.addEventListener('vyper_call_live_reaction', handleLiveReaction);

    return () => {
      window.removeEventListener('vyper_call_participant_added', handleParticipantAdded);
      window.removeEventListener('vyper_call_live_reaction', handleLiveReaction);
    };
  }, [currentCall.id]);

  // 1. Subscribe to updates on this specific call record for real-time status synchronization
  useEffect(() => {
    const callSub = supabase
      .channel(`call_room:${currentCall.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${currentCall.id}` },
        (payload) => {
          const updated = payload.new as Call;
          if (!updated) return;
          setCallStatus(updated.status);

          if (updated.status === 'rejected') {
            onClose('Call was declined');
          } else if (updated.status === 'ended') {
            onClose('Call ended');
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'calls', filter: `id=eq.${currentCall.id}` },
        () => {
          onClose('Call terminated');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(callSub);
    };
  }, [currentCall.id, onClose]);

  // 2. Local call duration counter when status is accepted
  useEffect(() => {
    if (callStatus === 'accepted') {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  // Save active duration to localStorage so call logs have live accurate durations
  useEffect(() => {
    if (duration > 0) {
      try {
        const stored = JSON.parse(localStorage.getItem('vyper_call_durations') || '{}');
        stored[currentCall.id] = duration;
        localStorage.setItem('vyper_call_durations', JSON.stringify(stored));
      } catch (e) {
        console.warn('Failed to persist call duration:', e);
      }
    }
  }, [duration, currentCall.id]);

  // Ringing Auto-timeout: Ends the call automatically if not answered in 30 seconds to prevent hanging
  useEffect(() => {
    if (callStatus !== 'ringing') return;

    const timeoutId = setTimeout(() => {
      console.log('WebRTC: Call ringing timed out after 30 seconds');
      setErrorMessage('Connection timed out. No response from recipient.');
      setTimeout(() => {
        handleEndCall();
      }, 2000);
    }, 30000);

    return () => clearTimeout(timeoutId);
  }, [callStatus]);

  // 3. Ringtone loop: Play standard double-beep ringtones using client-side Web Audio synthesis
  useEffect(() => {
    if (callStatus !== 'ringing') return;

    let audioCtx: AudioContext | null = null;
    let isPlaying = true;

    const playRingCycle = () => {
      if (!isPlaying) return;
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        
        audioCtx = new AudioContextClass();
        
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.value = isCaller ? 400 : 440; // Caller hears ringback, receiver hears ringtone
        
        osc2.type = 'sine';
        osc2.frequency.value = isCaller ? 450 : 480;
        
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime + 1.2);
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.4);
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc1.start();
        osc2.start();
        
        osc1.stop(audioCtx.currentTime + 1.5);
        osc2.stop(audioCtx.currentTime + 1.5);
      } catch (err) {
        console.warn('Ringtone sound error:', err);
      }
    };

    // Loop ringtone every 3 seconds
    const interval = setInterval(playRingCycle, 3000);
    playRingCycle(); // Play instantly first

    return () => {
      isPlaying = false;
      clearInterval(interval);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [callStatus, isCaller]);

  // Switch between available camera devices or toggle facingMode on mobile/tablets
  const handleSwitchCamera = async () => {
    if (!streamRef.current || currentCall.type !== 'video' || callStatus !== 'accepted') return;

    const currentVideoTrack = streamRef.current.getVideoTracks()[0];
    let newConstraints: MediaTrackConstraints = {};

    if (cameras.length > 1) {
      const nextIndex = (currentCameraIndex + 1) % cameras.length;
      setCurrentCameraIndex(nextIndex);
      const nextDevice = cameras[nextIndex];
      newConstraints = { deviceId: { exact: nextDevice.deviceId } };
      console.log('WebRTC: Switching to deviceId:', nextDevice.deviceId, nextDevice.label);
    } else {
      const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
      setFacingMode(nextFacingMode);
      newConstraints = { facingMode: { ideal: nextFacingMode } };
      console.log('WebRTC: Toggling facingMode to ideal:', nextFacingMode);
    }

    try {
      if (currentVideoTrack) {
        currentVideoTrack.stop();
        streamRef.current.removeTrack(currentVideoTrack);
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...newConstraints,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        newVideoTrack.enabled = isVideoOn;
        streamRef.current.addTrack(newVideoTrack);

        if (peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(newVideoTrack);
            console.log('WebRTC: Senders updated with the switched camera track');
          }
        }

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = streamRef.current;
        }

        const isSelfDemo = currentCall.caller_id === currentCall.receiver_id;
        if (isSelfDemo && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = streamRef.current;
        }
      }
    } catch (err) {
      console.error('WebRTC: Failed to switch camera device:', err);
      setErrorMessage('Failed to access the next camera. Swapping back or retrying...');
    }
  };

  // Initialize RTCPeerConnection with free public STUN servers
  const initializePeerConnection = (localStream: MediaStream) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    // Add local tracks to RTCPeerConnection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // Handle remote media track arrival
    pc.ontrack = (event) => {
      console.log('WebRTC: Received remote media track', event.track.kind);
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }
      
      // Safely insert the track into our persistent remote media stream object
      remoteStreamRef.current.addTrack(event.track);
      const remoteStream = remoteStreamRef.current;

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(e => console.warn("Video play error:", e));
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(e => console.warn("Audio play error:", e));
      }
    };

    // Handle ICE Candidate generation and broadcast
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('candidate', { candidate: event.candidate });
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // Handle incoming signaling messages
  const handleSignalingMessage = async (payload: any) => {
    if (payload.callId !== currentCall.id) return;

    // Discover peer ID from incoming signals to ensure precise 1-to-1 WebRTC signaling
    if (payload.senderId && payload.senderId !== currentUser.id) {
      remotePeerIdRef.current = payload.senderId;
    }

    const pc = peerConnectionRef.current;

    // Queue signal if connection or stream is not ready
    if (!streamRef.current || !pc) {
      console.log('WebRTC: Connection or stream not ready yet. Queuing signal:', payload.type);
      earlySignalingQueueRef.current.push(payload);
      return;
    }

    if (pc.signalingState === 'closed') {
      console.warn('WebRTC: Signaling message received but RTCPeerConnection is closed.');
      return;
    }

    try {
      if (payload.type === 'ready') {
        console.log('WebRTC: Receiver signaled ready, sending offer');
        if (isCaller) {
          if (pc.localDescription) {
            console.log('WebRTC: Re-sending existing local offer to receiver');
            sendSignal('offer', { sdp: pc.localDescription });
          } else {
            console.log('WebRTC: Creating fresh offer in response to ready');
            const offer = await pc.createOffer({ iceRestart: true });
            if (pc.signalingState === 'stable') {
              try {
                await pc.setLocalDescription(offer);
                sendSignal('offer', { sdp: pc.localDescription || offer });
              } catch (e) {
                console.warn('WebRTC: Failed to setLocalDescription(offer) in response to ready:', e);
              }
            } else {
              console.log(`WebRTC: Signaling state is ${pc.signalingState} (expected stable), skipping setLocalDescription(offer) to avoid error.`);
            }
          }
        }
      } else if (payload.type === 'offer') {
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
          console.log(`WebRTC: Received offer in state ${pc.signalingState}, ignoring to prevent invalid state transition.`);
          return;
        }
        console.log('WebRTC: Processing offer, creating answer');
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        
        // Flush any pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn('WebRTC: Error adding deferred candidate:', e);
          }
        }
        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        if (pc.signalingState === 'have-remote-offer') {
          try {
            await pc.setLocalDescription(answer);
            sendSignal('answer', { sdp: pc.localDescription || answer });
          } catch (e) {
            console.warn('WebRTC: Failed to setLocalDescription(answer) but caught gracefully:', e);
          }
        } else {
          console.log(`WebRTC: Signaling state is ${pc.signalingState} (expected 'have-remote-offer'), skipping setLocalDescription(answer) to avoid error.`);
        }
      } else if (payload.type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') {
          console.log(`WebRTC: Received answer in state ${pc.signalingState}, ignoring to prevent invalid state transition.`);
          return;
        }
        console.log('WebRTC: Processing answer, setting remote description');
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        
        // Flush any pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn('WebRTC: Error adding deferred candidate:', e);
          }
        }
        pendingCandidatesRef.current = [];
      } else if (payload.type === 'candidate') {
        if (payload.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            console.log('WebRTC: Adding remote ICE candidate');
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (e) {
              console.warn('WebRTC: Error adding candidate:', e);
            }
          } else {
            console.log('WebRTC: Remote description not set yet. Caching candidate.');
            pendingCandidatesRef.current.push(payload.candidate);
          }
        }
      }
    } catch (err) {
      console.error('WebRTC: Signaling handling error:', err);
    }
  };

  // Listen to the App-level WebRTC signaling broadcaster event
  useEffect(() => {
    const onSignal = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        handleSignalingMessage(detail);
      }
    };
    window.addEventListener('vypervic_webrtc_signal', onSignal);
    return () => {
      window.removeEventListener('vypervic_webrtc_signal', onSignal);
    };
  }, [currentCall.id]);

  // 4. Camera/Mic capture and WebRTC setup activation
  useEffect(() => {
    if (callStatus === 'accepted') {
      const wantVideo = currentCall.type === 'video';
      
      // Fallback gracefully from video request to audio only if the camera is blocked or unavailable (e.g. single machine testing)
      const grabStream = (withVideo: boolean) => {
        return navigator.mediaDevices.getUserMedia({ video: withVideo, audio: true })
          .catch((err) => {
            if (withVideo) {
              console.warn('WebRTC: Video capture failed, gracefully falling back to audio only:', err);
              setErrorMessage('Camera blocked or busy. Connecting via audio stream.');
              return navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            }
            throw err;
          });
      };

      grabStream(wantVideo)
        .then(async (stream) => {
          streamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }

          // Enumerate devices once we have permission (stream loaded) to find all video inputs
          if (wantVideo) {
            navigator.mediaDevices.enumerateDevices()
              .then((devices) => {
                const videoDevices = devices.filter((d) => d.kind === 'videoinput');
                setCameras(videoDevices);
                const activeTrack = stream.getVideoTracks()[0];
                if (activeTrack) {
                  const settings = activeTrack.getSettings();
                  if (settings.deviceId) {
                    const idx = videoDevices.findIndex((d) => d.deviceId === settings.deviceId);
                    if (idx !== -1) {
                      setCurrentCameraIndex(idx);
                    }
                  }
                }
              })
              .catch((err) => console.warn('WebRTC: Device enumeration failed:', err));
          }

          // If testing in a self-test call (calling oneself), loop back video for instant visual verification
          const isSelfDemo = currentCall.caller_id === currentCall.receiver_id;
          if (isSelfDemo) {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
            }
          }

          // Initialize Connection
          const pc = initializePeerConnection(stream);

          // Process any early queued signaling messages sequentially to bypass async race conditions
          const queue = [...earlySignalingQueueRef.current];
          earlySignalingQueueRef.current = [];
          for (const msg of queue) {
            await handleSignalingMessage(msg);
          }

          // Caller initiates the SDP offer/handshake
          if (isCaller && !pc.localDescription) {
            pc.createOffer()
              .then((offer) => {
                if (pc.signalingState === 'stable') {
                  return pc.setLocalDescription(offer);
                } else {
                  console.log(`WebRTC: Signaling state is ${pc.signalingState}, skipping setLocalDescription(offer) to avoid error.`);
                }
              })
              .then(() => {
                if (pc.localDescription) {
                  sendSignal('offer', { sdp: pc.localDescription });
                }
              })
              .catch((err) => console.warn('WebRTC: Offer creation or setting local description failed gracefully:', err));
          } else if (!isCaller) {
            // Send ready signal to the caller so they can re-trigger and negotiate successfully
            sendSignal('ready');
          }
        })
        .catch((err) => {
          console.error('Camera/mic media stream permission error:', err);
          setErrorMessage('Camera/Microphone access was denied. Running in simulated fallback mode.');
          
          // Loopback simulation fallback for headless or restricted browser security
          if (currentCall.type === 'video') {
            setErrorMessage('Permissions unavailable. Simulated calling session initiated.');
          }
        });
    } else {
      // Cleanup streams/connections on hangup/rejection
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      remoteStreamRef.current = null;
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      remoteStreamRef.current = null;
    };
  }, [callStatus]);

  // Handle Mute
  useEffect(() => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMuted;
      }
    }
  }, [isMuted]);

  // Handle Camera toggles
  useEffect(() => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoOn;
      }
    }
  }, [isVideoOn]);

  // Handle Caller Cancelling or ending call
  const handleEndCall = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (sendBroadcastEvent) {
        sendBroadcastEvent('vyper_group_call_leave', {
          callId: currentCall.id,
          userId: currentUser.id,
        });
        sendBroadcastEvent('call_status_update', {
          callId: currentCall.id,
          status: 'ended',
        });
      }

      if (onUpdateCallStatus) {
        onUpdateCallStatus('ended');
      }
      onClose('Call ended');

      // Best-effort non-blocking DB update
      supabase
        .from('calls')
        .update({ status: 'ended', updated_at: new Date().toISOString() })
        .eq('id', currentCall.id)
        .then(({ error }) => {
          if (error) console.warn('Non-blocking DB call end update:', error);
        });
    } catch (err) {
      console.error('Error ending call:', err);
      onClose();
    }
  };

  // Handle Receiver Rejecting Call
  const handleRejectCall = async () => {
    try {
      if (sendBroadcastEvent) {
        sendBroadcastEvent('call_status_update', {
          callId: currentCall.id,
          status: 'rejected',
        });
      }

      if (onUpdateCallStatus) {
        onUpdateCallStatus('rejected');
      }
      onClose('Call declined');

      // Best-effort non-blocking DB update
      supabase
        .from('calls')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', currentCall.id)
        .then(({ error }) => {
          if (error) console.warn('Non-blocking DB call reject update:', error);
        });
    } catch (err) {
      console.error('Error rejecting call:', err);
      onClose();
    }
  };

  // Handle Receiver Accepting Call
  const handleAcceptCall = async () => {
    try {
      if (sendBroadcastEvent) {
        sendBroadcastEvent('call_status_update', {
          callId: currentCall.id,
          status: 'accepted',
        });
      }

      setCallStatus('accepted');
      if (onUpdateCallStatus) {
        onUpdateCallStatus('accepted');
      }

      // Best-effort non-blocking DB update
      supabase
        .from('calls')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', currentCall.id)
        .then(({ error }) => {
          if (error) console.warn('Non-blocking DB call accept update:', error);
        });
    } catch (err) {
      console.error('Error accepting call:', err);
      setErrorMessage('Could not accept connection.');
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const getAvatarStyle = (seedNum: number) => {
    const palette = [
      ['#20e3a2', '#0f8f66'],
      ['#7c5cff', '#4a2fd1'],
      ['#ff9f4a', '#c76a1a'],
      ['#4ac2ff', '#1e6fbf'],
      ['#ff5470', '#c22a48'],
      ['#ffd166', '#c99a1f'],
      ['#a78bfa', '#6d4fd4'],
      ['#34d399', '#0f9d6b'],
    ];
    const c = palette[seedNum % palette.length];
    return `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 100%)`;
  };

  const seed = peerProfile.username?.charCodeAt(0) || 0;

  if (isMinimized) {
    return (
      <div 
        onClick={() => setIsMinimized(false)}
        className="absolute bottom-16 left-4 right-4 z-[100] bg-[#10151d]/95 backdrop-blur-md border border-[#212a38] rounded-2xl p-3 flex items-center justify-between shadow-2xl transition-all cursor-pointer hover:bg-[#161d28]/95 animate-fade-in-up"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative flex-shrink-0">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: getAvatarStyle(seed) }}
            >
              {getInitials(currentCall.receiver_id === 'general' ? '#General' : (peerProfile.display_name || peerProfile.username || ''))}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#20e3a2] rounded-full border-2 border-[#10151d] flex items-center justify-center animate-pulse" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[12.5px] font-bold text-white truncate max-w-[130px]">
              {currentCall.receiver_id === 'general' ? '#General Call' : (peerProfile.display_name || peerProfile.username)}
            </span>
            <span className="text-[10px] text-[#20e3a2] font-mono leading-none mt-0.5">
              {callStatus === 'ringing' ? (
                <span className="animate-pulse">Ringing...</span>
              ) : (
                currentCall.receiver_id === 'general'
                  ? `${formatDuration(duration)} • ${Object.keys(activeGroupParticipants).length + 1} Active`
                  : formatDuration(duration)
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`w-8.5 h-8.5 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
              isMuted
                ? 'bg-white text-black border-white'
                : 'bg-[#161d28] text-[#8d97ab] border-[#212a38] hover:bg-[#1d2531]'
            }`}
            title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => setIsMinimized(false)}
            className="w-8.5 h-8.5 rounded-full bg-[#161d28] text-[#8d97ab] border border-[#212a38] hover:bg-[#1d2531] flex items-center justify-center cursor-pointer"
            title="Maximize Call"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleEndCall}
            className="w-8.5 h-8.5 rounded-full bg-[#ff5470] hover:bg-[#ff5470]/90 text-white flex items-center justify-center shadow-md cursor-pointer transition-transform active:scale-90"
            title="End Connection"
          >
            <PhoneOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Render search and add friend dialog overlay (Requirements 3.3)
  const renderAddFriendModal = () => {
    const availableFriends = allProfiles.filter(
      (profile) => 
        profile.id !== currentUser.id && 
        !participants.some((p) => p.id === profile.id)
    );

    return (
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col justify-end animate-fade-in">
        <div className="absolute inset-0" onClick={() => setShowAddParticipant(false)} />
        
        <div className="relative bg-[#10151d] border-t border-[#212a38] rounded-t-3xl p-5 max-h-[80%] flex flex-col z-10 animate-slide-up">
          <div className="w-12 h-1.5 bg-[#212a38] rounded-full mx-auto mb-4" />
          
          <h3 className="text-sm font-bold text-white mb-1 font-display">Add Friend to Connection</h3>
          <p className="text-[10.5px] text-[#8d97ab] mb-4">Select an active user to patch into this call stream.</p>
          
          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[280px] pb-6 scrollbar-none">
            {availableFriends.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-[#5a6478]">No other active connections available</p>
              </div>
            ) : (
              availableFriends.map((friend) => {
                const seedNum = friend.username?.charCodeAt(0) || 0;
                return (
                  <button
                    key={friend.id}
                    onClick={() => {
                      if (participants.some((p) => p.id === friend.id)) return;
                      const updated = [...participants, friend];
                      setParticipants(updated);
                      setShowAddParticipant(false);

                      // Broadcast call invitation/join event to let all connected peers know
                      if (sendBroadcastEvent) {
                        sendBroadcastEvent('vyper_call_participant_added', {
                          callId: currentCall.id,
                          profile: friend
                        });
                      }
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-2xl bg-[#161d28]/50 hover:bg-[#161d28] border border-[#212a38]/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold"
                           style={{ background: getAvatarStyle(seedNum) }}>
                        {friend.avatar_url ? (
                          <img src={friend.avatar_url} alt="" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          getInitials(friend.display_name || friend.username || '')
                        )}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{friend.display_name || friend.username}</h4>
                        <p className="text-[10px] text-[#8d97ab] font-mono mt-0.5">@{friend.username}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-[#20e3a2] bg-[#20e3a2]/10 border border-[#20e3a2]/20 px-2.5 py-1 rounded-lg">Invite</span>
                  </button>
                );
              })
            )}
          </div>
          
          <button
            onClick={() => setShowAddParticipant(false)}
            className="w-full py-3 rounded-xl border border-[#212a38] text-xs text-white hover:bg-white/5 font-bold mt-2"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const renderParticipantsGrid = () => {
    // Current user's video preview, plus other active participant profiles
    const groupParticipantsList = Object.values(activeGroupParticipants).map((p: any) => ({
      id: p.id,
      name: p.display_name || p.username,
      display_name: p.display_name,
      isLocal: false,
      avatar_url: p.avatar_url,
      username: p.username
    }));

    const allInCall = [
      { id: currentUser.id, name: 'You (Admin)', display_name: 'You', isLocal: true, avatar_url: currentUser.avatar_url, username: currentUser.username },
      ...(currentCall.receiver_id === 'general'
        ? groupParticipantsList
        : participants.map((p) => ({ id: p.id, name: p.display_name || p.username, display_name: p.display_name, isLocal: false, avatar_url: p.avatar_url, username: p.username })))
    ];

    const focusedId = focusedParticipantId || (participants[0]?.id);

    // If focused, render the focused participant as the main display
    const mainPeer = allInCall.find(p => p.id === focusedId) || allInCall[0];
    const thumbnails = allInCall.filter(p => p.id !== mainPeer.id);

    return (
      <div className="absolute inset-0 bg-[#080b10] flex flex-col justify-between overflow-hidden">
        {/* Main/Focused view */}
        <div className="absolute inset-0 z-0">
          {currentCall.type === 'video' && (mainPeer.isLocal ? isVideoOn : true) ? (
            <div className="relative w-full h-full">
              <video
                ref={mainPeer.isLocal ? localVideoRef : remoteVideoRef}
                autoPlay
                playsInline
                muted={mainPeer.isLocal || currentCall.caller_id === currentCall.receiver_id}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-28 left-6 bg-black/60 px-3.5 py-1.5 rounded-xl border border-[#212a38]/80 backdrop-blur-md">
                <span className="text-[11px] font-bold text-[#20e3a2] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#20e3a2] animate-pulse" />
                  {mainPeer.name} {mainPeer.isLocal && '(Local Camera)'}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d121c]">
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-extrabold shadow-2xl mb-4"
                   style={{ background: getAvatarStyle(mainPeer.username?.charCodeAt(0) || 0) }}>
                {mainPeer.avatar_url ? (
                  <img src={mainPeer.avatar_url} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  getInitials(mainPeer.name || '')
                )}
              </div>
              <span className="text-sm font-bold text-gray-300">{mainPeer.name}</span>
              <span className="text-[11px] text-[#5a6478] font-mono mt-1">Audio stream established</span>
            </div>
          )}
        </div>

        {/* Floating/Picture-in-Picture Thumbnails (Requirement 3 & 4) */}
        <div className="absolute top-28 left-0 right-0 px-4 flex gap-3 overflow-x-auto z-20 pb-2 scrollbar-none">
          {thumbnails.map((peer) => {
            const isPeerVideoActive = currentCall.type === 'video' && (peer.isLocal ? isVideoOn : true);
            return (
              <button
                key={peer.id}
                onClick={() => setFocusedParticipantId(peer.id)}
                className="relative w-24 h-36 rounded-2xl bg-[#10151d] border border-[#212a38] overflow-hidden flex-shrink-0 shadow-2xl cursor-pointer hover:scale-105 active:scale-95 transition-all text-left"
              >
                {isPeerVideoActive ? (
                  <div className="w-full h-full relative">
                    <video
                      ref={peer.isLocal ? localVideoRef : remoteVideoRef}
                      autoPlay
                      playsInline
                      muted={peer.isLocal || currentCall.caller_id === currentCall.receiver_id}
                      className="w-full h-full object-cover pointer-events-none opacity-90"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#161d28]/95">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md mb-1.5"
                         style={{ background: getAvatarStyle(peer.username?.charCodeAt(0) || 0) }}>
                      {peer.avatar_url ? (
                        <img src={peer.avatar_url} className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        getInitials(peer.name || '')
                      )}
                    </div>
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 right-2 truncate">
                  <span className="text-[9px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                    {peer.name.split(' ')[0]}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const triggerReaction = (emoji: string) => {
    if (sendBroadcastEvent) {
      sendBroadcastEvent('vyper_call_live_reaction', {
        callId: currentCall.id,
        emoji,
        senderId: currentUser.id,
        senderName: currentUser.display_name || currentUser.username
      });
    }

    // Trigger local reaction instantly
    const id = `react_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const newReact = {
      id,
      emoji,
      senderName: currentUser.display_name || currentUser.username || 'You',
      senderId: currentUser.id,
      x: Math.random() * 80 + 10,
    };
    setActiveReactions((prev) => [...prev, newReact]);
    setTimeout(() => {
      setActiveReactions((prev) => prev.filter((r) => r.id !== id));
    }, 3000);
  };

  return (
    <div className="absolute inset-0 z-[100] flex flex-col justify-between bg-[#05070a] text-white p-6 overflow-hidden">
      <style>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes bounceUp {
          0% {
            transform: translateY(0) scale(0.6);
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translateY(-20px) scale(1.1);
          }
          100% {
            transform: translateY(-280px) scale(0.85);
            opacity: 0;
          }
        }
        .animate-slide-up {
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.25s ease-out forwards;
        }
        .animate-bounce-up {
          animation: bounceUp 2.8s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
      `}</style>

      {/* Minimize button */}
      <div className="absolute top-14 left-6 z-20">
        <button
          onClick={() => setIsMinimized(true)}
          className="w-10 h-10 rounded-full bg-[#10151d]/60 border border-[#212a38] flex items-center justify-center hover:bg-[#161d28]/80 transition-colors cursor-pointer"
          title="Minimize Call"
        >
          <Minimize2 className="w-5 h-5 text-[#8d97ab]" />
        </button>
      </div>

      {/* Background Video layout vs equal grid */}
      {callStatus === 'accepted' ? (
        renderParticipantsGrid()
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(124,92,255,0.18),transparent_60%)] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_80%,rgba(32,227,162,0.1),transparent_55%)] pointer-events-none" />
        </>
      )}

      {/* Hidden elements to output and capture remote streams */}
      <audio ref={remoteAudioRef} autoPlay style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }} />

      {/* Floating Reactions Layer (Requirement 3.2) */}
      <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
        {activeReactions.map((react) => (
          <div
            key={react.id}
            className="absolute bottom-32 flex flex-col items-center animate-bounce-up pointer-events-none"
            style={{ left: `${react.x}%` }}
          >
            <span className="text-3xl filter drop-shadow-lg">{react.emoji}</span>
            <span className="text-[8px] bg-black/60 px-1.5 py-0.5 rounded-full text-[#8d97ab] mt-1 whitespace-nowrap border border-[#212a38]/40">
              {react.senderName ? react.senderName.split(' ')[0] : 'Operator'}
            </span>
          </div>
        ))}
      </div>

      {/* Header Profile Details (Only when calling/ringing, hidden once video grid fills) */}
      {callStatus !== 'accepted' && (
        <div className="relative z-10 flex flex-col items-center text-center mt-12">
          {/* Call Security Badge */}
          <span className="bg-[#10151d]/80 border border-[#212a38] text-[10px] font-bold tracking-widest text-[#20e3a2] uppercase px-4 py-1.5 rounded-full mb-6 backdrop-blur-md flex items-center gap-1.5 shadow-md">
            <span className="w-1.5 h-1.5 rounded-full bg-[#20e3a2] animate-pulse" />
            {currentCall.type === 'video' ? 'VIDEO CALL' : 'VOICE CALL'}
          </span>

          <div className="relative w-28 h-28 mb-5">
            {callStatus === 'ringing' && (
              <div className="absolute inset-[-12px] rounded-full bg-[#20e3a2]/20 animate-ping duration-1000" />
            )}
            <div
              className="absolute inset-0 rounded-full flex items-center justify-center text-white text-3xl font-extrabold shadow-2xl border-2 border-white/10"
              style={{ background: getAvatarStyle(seed) }}
            >
              {getInitials(peerProfile.display_name || peerProfile.username || '')}
            </div>
          </div>

          <h2 className="text-xl font-display font-black tracking-wide text-white leading-tight drop-shadow-md">
            {peerProfile.display_name || peerProfile.username}
          </h2>
          <p className="text-[11.5px] text-[#8d97ab] mt-1 font-mono drop-shadow-md">
            @{peerProfile.username}
          </p>

          {/* Live Call state indicator */}
          <p className="text-sm font-bold mt-4 drop-shadow-md">
            {callStatus === 'ringing' ? (
              isCaller ? (
                <span className="text-[#20e3a2] animate-pulse">Ringing portal...</span>
              ) : (
                <span className="text-[#7c5cff] animate-pulse">Incoming request...</span>
              )
            ) : (
              <span className="text-[#ff5470] animate-pulse">Connecting...</span>
            )}
          </p>
        </div>
      )}

      {/* Notice error log box */}
      {errorMessage && (
        <div className="relative z-10 self-center max-w-xs text-center text-xs text-[#ff5470] font-semibold bg-[#ff5470]/10 border border-[#ff5470]/20 rounded-xl p-3">
          {errorMessage}
        </div>
      )}

      {/* Encryption banner */}
      <div className="relative z-10 flex items-center gap-2 self-center bg-black/45 border border-[#212a38]/80 rounded-xl px-4 py-2 text-[10.5px] text-[#8d97ab] shadow-sm backdrop-blur-md">
        <ShieldAlert className="w-3.5 h-3.5 text-[#20e3a2]" />
        <span>Direct connection established</span>
      </div>

      {/* Button Controls Area */}
      <div className="relative z-10 flex flex-col gap-6 items-center mb-10">
        {/* Dynamic call timer for accepted state overlay */}
        {callStatus === 'accepted' && (
          <span className="text-xs text-[#8d97ab] font-mono tracking-wider bg-black/50 border border-[#212a38]/60 px-4 py-1.5 rounded-full backdrop-blur-md">
            Duration: {formatDuration(duration)} • {
              currentCall.receiver_id === 'general'
                ? `${Object.keys(activeGroupParticipants).length + 1} Active Participants`
                : `${participants.length + 1} Callers`
            }
          </span>
        )}

        <div className="flex items-center gap-4">
          {callStatus === 'ringing' && !isCaller ? (
            /* Incoming state triggers Accept / Decline options */
            <>
              <button
                onClick={handleRejectCall}
                className="w-14 h-14 rounded-full bg-[#ff5470] hover:bg-[#ff5470]/90 text-white flex items-center justify-center shadow-lg cursor-pointer active:scale-95 transition-transform"
                title="Decline Call"
              >
                <PhoneOff className="w-5.5 h-5.5" />
              </button>
              <button
                onClick={handleAcceptCall}
                className="w-14 h-14 rounded-full bg-[#20e3a2] hover:bg-[#20e3a2]/90 text-black flex items-center justify-center shadow-lg cursor-pointer active:scale-95 transition-transform"
                title="Accept Call"
              >
                <Phone className="w-5.5 h-5.5 fill-current" />
              </button>
            </>
          ) : (
            /* Active call or ringing state controls */
            <>
              {/* Mic mute trigger */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-white text-black border-white'
                    : 'bg-[#10151d]/75 text-white border-[#212a38] hover:bg-[#161d28]'
                }`}
                title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Add Friends Button (Requirement 3.3) */}
              {callStatus === 'accepted' && (
                <button
                  onClick={() => setShowAddParticipant(true)}
                  className="w-12 h-12 rounded-full bg-[#10151d]/75 text-[#eef1f6] border border-[#212a38] hover:bg-[#161d28] flex items-center justify-center cursor-pointer transition-all"
                  title="Invite Peer to Call"
                >
                  <UserPlus className="w-5 h-5" />
                </button>
              )}

              {/* Live reactions picker trigger (Requirement 3.2) */}
              {callStatus === 'accepted' && (
                <div className="relative">
                  <button
                    onClick={() => setShowReactions(!showReactions)}
                    className={`w-12 h-12 rounded-full border flex items-center justify-center cursor-pointer transition-all ${
                      showReactions 
                        ? 'bg-[#7c5cff] text-white border-[#7c5cff]' 
                        : 'bg-[#10151d]/75 text-[#eef1f6] border-[#212a38] hover:bg-[#161d28]'
                    }`}
                    title="Send Reaction"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                  {/* Floating tooltip/picker on toggle */}
                  {showReactions && (
                    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-[#161d28]/95 border border-[#212a38] p-2 rounded-2xl flex items-center gap-2 shadow-2xl transition-all duration-200 z-50 animate-fade-in whitespace-nowrap min-w-[200px] backdrop-blur-md">
                      <div className="flex items-center gap-1.5 overflow-x-auto max-w-[240px] scrollbar-none">
                        {listedReactions.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              if (isEditingReactions) {
                                // Remove this reaction
                                setListedReactions((prev) => {
                                  const next = prev.filter((e) => e !== emoji);
                                  localStorage.setItem('vyper_call_custom_reactions_v1', JSON.stringify(next));
                                  return next;
                                });
                              } else {
                                triggerReaction(emoji);
                              }
                            }}
                            className={`text-xl transition-transform cursor-pointer shrink-0 ${
                              isEditingReactions 
                                ? 'hover:scale-95 border border-red-500/40 p-0.5 rounded-lg bg-red-500/10' 
                                : 'hover:scale-125 active:scale-110'
                            }`}
                            title={isEditingReactions ? "Click to remove" : "Send Reaction"}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>

                      <div className="w-[1px] h-4 bg-[#212a38] shrink-0" />

                      {/* Add Button */}
                      <button
                        onClick={() => {
                          const newEmoji = prompt("Enter an emoji to add:");
                          if (newEmoji) {
                            const emojiClean = newEmoji.trim();
                            if (emojiClean) {
                              setListedReactions((prev) => {
                                // Slice the first 9, append the new one
                                const next = [...prev.slice(0, 9), emojiClean];
                                localStorage.setItem('vyper_unified_reaction_emojis_v2', JSON.stringify(next));
                                return next;
                              });
                            }
                          }
                        }}
                        className="text-xs text-[#20e3a2] hover:scale-110 font-black cursor-pointer shrink-0"
                        title="Add custom reaction"
                      >
                        ＋
                      </button>

                      {/* Edit Toggle Button */}
                      <button
                        onClick={() => setIsEditingReactions(!isEditingReactions)}
                        className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-lg cursor-pointer shrink-0 transition-colors ${
                          isEditingReactions 
                            ? 'bg-[#ff5470] text-white' 
                            : 'bg-[#212a38] text-[#8d97ab] hover:text-white'
                        }`}
                        title="Toggle edit mode to remove reactions"
                      >
                        {isEditingReactions ? 'Done' : 'Edit'}
                      </button>

                      <div className="w-[1px] h-4 bg-[#212a38] shrink-0" />

                      <button
                        onClick={() => setShowReactions(false)}
                        className="text-[#64748b] hover:text-white transition-colors text-sm px-1 cursor-pointer font-bold shrink-0"
                        title="Collapse"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Camera toggler inside active video call */}
              {currentCall.type === 'video' && callStatus === 'accepted' && (
                <>
                  <button
                    onClick={() => setIsVideoOn(!isVideoOn)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                      isVideoOn
                        ? 'bg-[#10151d]/75 text-white border-[#212a38] hover:bg-[#161d28]'
                        : 'bg-white text-black border-white'
                    }`}
                    title={isVideoOn ? 'Disable Video' : 'Enable Video'}
                  >
                    {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                  </button>

                  {isVideoOn && (
                    <button
                      onClick={handleSwitchCamera}
                      className="w-12 h-12 rounded-full bg-[#10151d]/75 border border-[#212a38] text-[#8d97ab] hover:text-[#20e3a2] flex items-center justify-center hover:bg-[#161d28] active:scale-90 cursor-pointer transition-all"
                      title="Switch Camera Device"
                    >
                      <RefreshCw className="w-5 h-5" />
                    </button>
                  )}
                </>
              )}

              {/* End/Cancel call trigger */}
              <button
                onClick={handleEndCall}
                className="w-12 h-12 rounded-full bg-[#ff5470] hover:bg-[#ff5470]/90 text-white flex items-center justify-center shadow-lg cursor-pointer active:scale-95 transition-transform"
                title="End connection"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Render Add Friend Overlay Panel */}
      {showAddParticipant && renderAddFriendModal()}
    </div>
  );
}

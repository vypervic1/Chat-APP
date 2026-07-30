import React, { useState, memo } from 'react';
import { Profile, Call } from '../types';
import { Phone, Video, PhoneIncoming, PhoneOutgoing, PhoneMissed, Plus, Search, User, Shield, Circle, ArrowUpRight, X, Clock, Lock, Info } from 'lucide-react';
import { isUserOnline, getContactDisplayName } from '../utils/customNames';

interface CallsScreenProps {
  currentUser: Profile;
  allProfiles: Profile[];
  callHistory: Call[];
  onInitiateCall: (receiverId: string, type: 'voice' | 'video') => void;
  onViewProfileDetail?: (type: 'user' | 'group' | 'general', data?: any) => void;
}

function CallsScreen({
  currentUser,
  allProfiles,
  callHistory,
  onInitiateCall,
  onViewProfileDetail,
}: CallsScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCallPicker, setShowCallPicker] = useState(false);
  const [pickerType, setPickerType] = useState<'voice' | 'video'>('voice');
  const [selectedCallDetails, setSelectedCallDetails] = useState<Call | null>(null);


  // Filter peers
  const contacts = allProfiles.filter((p) => p.id !== currentUser.id);
  const filteredContacts = contacts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      (p.display_name && p.display_name.toLowerCase().includes(q)) ||
      (p.username && p.username.toLowerCase().includes(q))
    );
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const getAvatarStyle = (seed: number) => {
    const palette = [
      ['#20e3a2', '#0f8f66'],
      ['#7c5cff', '#4a2fd1'],
      ['#ff9f4a', '#c76a1a'],
      ['#4ac2ff', '#1e6fbf'],
      ['#ff5470', '#c22a48'],
    ];
    const c = palette[seed % palette.length];
    return `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 100%)`;
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return 'Recent';
    const date = new Date(isoString);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-transparent text-[#eef1f6] z-10 select-none overflow-hidden screen-gpu">
      {/* Floating Header */}
      <div className="pt-[calc(var(--safe-top)+4px)] px-5 pb-3 flex items-center justify-between border-b border-white/10 bg-slate-900/60 backdrop-blur-2xl sticky top-0 z-20 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.4)] text-[#38bdf8]">
            <Phone className="w-4.5 h-4.5" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-xl text-white tracking-tight leading-none">Calls</h1>
            <p className="text-[11px] text-white/50 font-medium mt-0.5">End-to-End Encrypted Voice & Video</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPickerType('voice');
              setShowCallPicker(true);
            }}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md flex items-center justify-center text-white transition-all cursor-pointer active:scale-95 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]"
            title="New Voice Call"
          >
            <Phone className="w-4 h-4 text-[#20e3a2]" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerType('video');
              setShowCallPicker(true);
            }}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md flex items-center justify-center text-white transition-all cursor-pointer active:scale-95 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]"
            title="New Video Call"
          >
            <Video className="w-4 h-4 text-[#38bdf8]" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 space-y-4">
        {/* Quick Start Card */}
        <div className="p-4 rounded-3xl bg-white/[0.06] backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)] flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#007aff]/30 to-[#38bdf8]/30 border border-white/20 flex items-center justify-center text-[#38bdf8] shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]">
              <PhoneOutgoing className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-white">Start New Call</h3>
              <p className="text-[12px] text-white/60">Connect instantly with contacts</p>
            </div>
          </div>
          <button
            onClick={() => setShowCallPicker(true)}
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#007aff] to-[#38bdf8] text-white text-xs font-bold shadow-[0_4px_16px_rgba(56,189,248,0.35),inset_0_1px_1px_rgba(255,255,255,0.4)] hover:brightness-110 active:scale-95 transition-all"
          >
            New Call
          </button>
        </div>

        {/* Section Title */}
        <div className="pt-2 px-1 flex items-center justify-between">
          <h2 className="text-[11px] font-extrabold tracking-[1.5px] text-white/50 uppercase">Recent Call Activity</h2>
          <span className="text-[11px] text-[#38bdf8] font-semibold">{callHistory.length} Total</span>
        </div>

        {/* Call Logs List */}
        {callHistory.length === 0 ? (
          <div className="p-8 rounded-3xl bg-white/[0.04] backdrop-blur-xl border border-white/10 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/30">
              <Phone className="w-6 h-6" />
            </div>
            <p className="text-xs font-semibold text-white/70">No recent calls</p>
            <p className="text-[11px] text-white/40">Your voice and video calls will appear here in high-fidelity glass cards.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {callHistory.map((call) => {
              const isOutgoing = call.caller_id === currentUser.id;
              const peerId = isOutgoing ? call.receiver_id : call.caller_id;
              const peer = allProfiles.find((p) => p.id === peerId);
              const seed = peer?.username?.charCodeAt(0) || 0;
              const displayName = peer ? getContactDisplayName(peer) : (call.receiver_id === 'general' ? 'General Channel Call' : 'Unknown Contact');

              return (
                <div
                  key={call.id}
                  onClick={() => setSelectedCallDetails(call)}
                  className="p-3.5 rounded-3xl bg-white/[0.06] backdrop-blur-xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.25),inset_0_1px_1px_rgba(255,255,255,0.2)] hover:bg-white/[0.12] transition-all flex items-center justify-between group cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (peer) onViewProfileDetail?.('user', peer);
                      }}
                      className="relative w-12 h-12 rounded-full border-2 border-white/20 shadow-md overflow-hidden shrink-0 cursor-pointer hover:border-[#38bdf8] transition-colors"
                    >
                      {peer?.avatar_url ? (
                        <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div 
                          className="w-full h-full flex items-center justify-center text-white font-bold text-xs"
                          style={{ background: getAvatarStyle(seed) }}
                        >
                          {getInitials(displayName)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-[14px] text-white truncate">{displayName}</h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-white/60 mt-0.5">
                        {isOutgoing ? (
                          <PhoneOutgoing className="w-3.5 h-3.5 text-[#38bdf8]" />
                        ) : call.status === 'rejected' ? (
                          <PhoneMissed className="w-3.5 h-3.5 text-[#ff5470]" />
                        ) : (
                          <PhoneIncoming className="w-3.5 h-3.5 text-[#20e3a2]" />
                        )}
                        <span>{call.type === 'video' ? 'Video' : 'Voice'} Call</span>
                        <span>•</span>
                        <span className="font-mono text-[10px] text-white/40">{formatTime(call.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (peer) onInitiateCall(peer.id, call.type || 'voice');
                      }}
                      className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 flex items-center justify-center text-white active:scale-95 transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.3)]"
                      title="Redial"
                    >
                      {call.type === 'video' ? <Video className="w-4 h-4 text-[#38bdf8]" /> : <Phone className="w-4 h-4 text-[#20e3a2]" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Call Details Modal */}
      {selectedCallDetails && (() => {
        const isOutgoing = selectedCallDetails.caller_id === currentUser.id;
        const peerId = isOutgoing ? selectedCallDetails.receiver_id : selectedCallDetails.caller_id;
        const peer = allProfiles.find((p) => p.id === peerId);
        const displayName = peer ? getContactDisplayName(peer) : (selectedCallDetails.receiver_id === 'general' ? 'General Channel' : 'Unknown Contact');
        const seed = peer?.username?.charCodeAt(0) || 0;

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[120] flex items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-sm bg-slate-900/95 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-2xl space-y-5 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#38bdf8] via-[#7c5cff] to-[#20e3a2]" />
              
              <button
                type="button"
                onClick={() => setSelectedCallDetails(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="pt-2 flex flex-col items-center">
                <div 
                  onClick={() => {
                    if (peer) {
                      setSelectedCallDetails(null);
                      onViewProfileDetail?.('user', peer);
                    }
                  }}
                  className="w-20 h-20 rounded-full border-2 border-white/20 shadow-xl overflow-hidden mb-3 cursor-pointer hover:scale-105 transition-transform"
                >
                  {peer?.avatar_url ? (
                    <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center text-white font-bold text-lg"
                      style={{ background: getAvatarStyle(seed) }}
                    >
                      {getInitials(displayName)}
                    </div>
                  )}
                </div>

                <h3 className="font-display font-bold text-lg text-white">{displayName}</h3>
                {peer?.username && <p className="text-xs text-white/50 font-mono">@{peer.username}</p>}
              </div>

              {/* Call Details Card */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3 text-left">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#38bdf8]" />
                    Call Type
                  </span>
                  <span className="font-bold text-white capitalize">{selectedCallDetails.type || 'Voice'} Call</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50 flex items-center gap-1.5">
                    {isOutgoing ? (
                      <PhoneOutgoing className="w-3.5 h-3.5 text-[#38bdf8]" />
                    ) : selectedCallDetails.status === 'rejected' ? (
                      <PhoneMissed className="w-3.5 h-3.5 text-[#ff5470]" />
                    ) : (
                      <PhoneIncoming className="w-3.5 h-3.5 text-[#20e3a2]" />
                    )}
                    Direction / Status
                  </span>
                  <span className={`font-bold capitalize ${
                    selectedCallDetails.status === 'rejected' ? 'text-[#ff5470]' : 'text-[#20e3a2]'
                  }`}>
                    {isOutgoing ? 'Outgoing' : 'Incoming'} ({selectedCallDetails.status || 'Completed'})
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#7c5cff]" />
                    Timestamp
                  </span>
                  <span className="font-mono text-[11px] text-white/80">
                    {selectedCallDetails.created_at ? new Date(selectedCallDetails.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Recent'}
                  </span>
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                  <span className="text-white/40 flex items-center gap-1 font-mono">
                    <Lock className="w-3 h-3 text-[#20e3a2]" />
                    Encrypted
                  </span>
                  <span className="text-white/30 font-mono text-[10px]">
                    ID: {selectedCallDetails.id.substring(0, 12)}...
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (peer) {
                      setSelectedCallDetails(null);
                      onInitiateCall(peer.id, 'voice');
                    }
                  }}
                  className="py-2.5 px-3 rounded-2xl bg-[#20e3a2]/20 hover:bg-[#20e3a2]/30 border border-[#20e3a2]/40 text-[#20e3a2] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <Phone className="w-4 h-4" />
                  Voice Call
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (peer) {
                      setSelectedCallDetails(null);
                      onInitiateCall(peer.id, 'video');
                    }
                  }}
                  className="py-2.5 px-3 rounded-2xl bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 border border-[#38bdf8]/40 text-[#38bdf8] text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                >
                  <Video className="w-4 h-4" />
                  Video Call
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Select Call Partner Modal */}
      {showCallPicker && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-2xl border border-white/20 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base text-white">Select Contact for {pickerType === 'video' ? 'Video' : 'Voice'} Call</h3>
              <button
                onClick={() => setShowCallPicker(false)}
                className="w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-xs text-white placeholder-white/40 outline-none focus:border-[#38bdf8] transition-colors"
              />
            </div>

            {/* Contacts list */}
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {filteredContacts.length === 0 ? (
                <p className="text-xs text-white/50 text-center py-4">No contacts found</p>
              ) : (
                filteredContacts.map((peer) => (
                  <div
                    key={peer.id}
                    onClick={() => {
                      setShowCallPicker(false);
                      onInitiateCall(peer.id, pickerType);
                    }}
                    className="p-3 rounded-2xl bg-white/5 hover:bg-white/15 border border-white/10 transition-all cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                        {peer.avatar_url ? (
                          <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          getInitials(getContactDisplayName(peer))
                        )}
                      </div>
                      <span className="text-xs font-bold text-white">{getContactDisplayName(peer)}</span>
                    </div>
                    <div className="p-2 rounded-full bg-[#007aff]/20 border border-[#007aff]/40 text-[#38bdf8]">
                      {pickerType === 'video' ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CallsScreen);


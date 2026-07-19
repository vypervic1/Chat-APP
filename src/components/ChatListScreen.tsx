import React, { useMemo, useState, useEffect } from 'react';
import { Profile, Message, Group } from '../types';
import { Search, Settings, MessageSquare, Shield, Circle, User, Bell, Users, WifiOff } from 'lucide-react';
import { getContactDisplayName } from '../utils/customNames';

interface ChatListScreenProps {
  currentUser: Profile;
  onSelectChat: (chatId: string, peer?: Profile) => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onOpenNotifications: () => void;
  allProfiles: Profile[];
  messagesList: Message[];
  readReceipts: Record<string, { readerId: string; lastReadMessageId: string; timestamp: string }>;
  getUnreadCount: (chatId: string) => number;
  unreadNotificationsCount: number;
  groups?: Group[];
  groupCallStatuses?: Record<string, string>;
  isOffline?: boolean;
  onViewProfileDetail?: (type: 'user' | 'group' | 'general', data?: any) => void;
}

export default function ChatListScreen({
  currentUser,
  onSelectChat,
  onOpenSettings,
  onOpenSearch,
  onOpenNotifications,
  allProfiles,
  messagesList,
  readReceipts,
  getUnreadCount,
  unreadNotificationsCount,
  groups = [],
  groupCallStatuses = {},
  isOffline = false,
  onViewProfileDetail,
}: ChatListScreenProps) {
  const [customNamesTick, setCustomNamesTick] = useState(0);
  useEffect(() => {
    const handleUpdate = () => setCustomNamesTick((t) => t + 1);
    window.addEventListener('vyper_custom_names_updated', handleUpdate);
    return () => window.removeEventListener('vyper_custom_names_updated', handleUpdate);
  }, []);

  // 1. Compute initials from display name or username
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // 2. Compute dynamic avatar gradient background based on character seed
  const getAvatarStyle = (seed: number) => {
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
    const c = palette[seed % palette.length];
    return `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 100%)`;
  };

  // 3. Format message relative time nicely
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // 4. Find the last message and calculate unread info for a specific chat ID
  const getChatPreview = (chatId: string) => {
    const draftKey = `vyper_draft_${currentUser.id}_${chatId}`;
    const draftText = localStorage.getItem(draftKey);
    const hasDraft = draftText && draftText.trim() !== '';

    const chatMsgs = messagesList.filter((m) => m.chat_id === chatId);
    if (chatMsgs.length === 0 && !hasDraft) return null;

    if (hasDraft) {
      return {
        id: `draft:${chatId}`,
        text: draftText!.trim(),
        time: 'Draft',
        senderId: currentUser.id,
        timestamp: Date.now() + 100000, // Put drafts at the very top!
        created_at: new Date().toISOString(),
        isDraft: true,
      };
    }

    const lastMsg = chatMsgs[chatMsgs.length - 1];
    
    let textPreview = lastMsg.text || '';
    if (lastMsg.is_voice) {
      textPreview = '🎤 Voice note';
    } else if (lastMsg.file_name) {
      textPreview = `📎 ${lastMsg.file_name}`;
    } else if (textPreview.startsWith('_vyper_call_::')) {
      try {
        const jsonStr = textPreview.substring('_vyper_call_::'.length);
        const callMeta = JSON.parse(jsonStr);
        const { callId, type } = callMeta;
        const currentStatus = (groupCallStatuses && callId && groupCallStatuses[callId]) || callMeta.status;
        const isVoice = type === 'voice';
        const isEnded = currentStatus === 'ended' || currentStatus === 'rejected';
        textPreview = isVoice 
          ? (isEnded ? '📞 Voice Call (Ended)' : '📞 Active Voice Call') 
          : (isEnded ? '📹 Video Call (Ended)' : '📹 Active Video Call');
      } catch (err) {
        textPreview = '📞 Call message';
      }
    }

    return {
      id: lastMsg.id,
      text: textPreview,
      time: formatTime(lastMsg.created_at),
      senderId: lastMsg.sender_id,
      timestamp: new Date(lastMsg.created_at).getTime(),
      created_at: lastMsg.created_at,
      isDraft: false,
    };
  };

  // 5. Build dynamic mixed list of DM and Group chats
  const mixedChats = useMemo(() => {
    const sessions: Array<{
      chatId: string;
      isGroup: boolean;
      name?: string;
      icon?: string;
      peer?: Profile;
      lastMsg: { id: string; text: string; time: string; senderId: string; timestamp: number; created_at: string; isDraft?: boolean } | null;
      unreadCount: number;
    }> = [];

    // Filter out our own profile for DM checks
    const peerProfiles = allProfiles.filter((p) => p.id !== currentUser.id);

    peerProfiles.forEach((peer) => {
      // Direct message standard naming
      const sortedIds = [currentUser.id, peer.id].sort();
      const chatId = `dm:${sortedIds[0]}:${sortedIds[1]}`;
      
      const lastMsg = getChatPreview(chatId);
      const unreadCount = getUnreadCount(chatId);
      
      // If there's a chat history or the peer is online, show in session list
      if (lastMsg || peer.is_online) {
        sessions.push({
          chatId,
          isGroup: false,
          peer,
          lastMsg,
          unreadCount,
        });
      }
    });

    // Merge group secure chats
    const activeGroups = groups.filter(g => g.members?.includes(currentUser.id));
    activeGroups.forEach((grp) => {
      const lastMsg = getChatPreview(grp.id);
      const unreadCount = getUnreadCount(grp.id);
      sessions.push({
        chatId: grp.id,
        isGroup: true,
        name: grp.name,
        icon: grp.icon,
        lastMsg,
        unreadCount,
      });
    });

    // Sort conversations by latest message timestamp or fallback to 0
    return sessions.sort((a, b) => {
      const timeA = a.lastMsg?.timestamp || 0;
      const timeB = b.lastMsg?.timestamp || 0;
      return timeB - timeA;
    });
  }, [allProfiles, messagesList, currentUser, groups, customNamesTick]);

  // General chat preview details
  const generalPreview = useMemo(() => getChatPreview('general'), [messagesList, customNamesTick]);

  return (
    <div className="absolute inset-0 flex flex-col bg-[#080b10] text-[#eef1f6] z-10 select-none">
      {/* Header Container */}
      <div className="pt-[calc(var(--safe-top)+10px)] px-5 pb-4 flex items-center justify-between border-b border-[#212a38] bg-[#080b10]/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          {isOffline && (
            <div 
              className="w-8 h-8 rounded-full bg-[#ff5470]/10 border border-[#ff5470]/30 flex items-center justify-center text-[#ff5470] animate-pulse shadow-[0_0_8px_rgba(255,84,112,0.25)] shrink-0"
              title="Internet connection lost"
            >
              <WifiOff className="w-4 h-4" />
            </div>
          )}

          {/* Glowing icon */}
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute inset-[-4px] rounded-full bg-[radial-gradient(circle,rgba(32,227,162,0.2),transparent_70%)] blur-[2px]" />
            <svg width="24" height="24" viewBox="0 0 150 150" fill="none">
              <defs>
                <linearGradient id="headerLogoGrad" x1="0" y1="0" x2="150" y2="150" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#20e3a2" />
                  <stop offset="1" stopColor="#7c5cff" />
                </linearGradient>
              </defs>
              <path
                d="M30 40 C30 20, 60 15, 75 35 C95 60, 60 65, 55 80 C50 95, 85 100, 90 75 C93 60, 75 55, 70 65 C65 75, 80 85, 100 78 C118 71, 118 45, 100 35 C85 27, 75 45, 85 55"
                stroke="url(#headerLogoGrad)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="font-display text-[19px] font-black tracking-wide">
            Vyper<span className="bg-gradient-to-r from-[#20e3a2] to-[#7c5cff] bg-clip-text text-transparent">Vic</span>
          </span>
        </div>

        {/* Action icons */}
        <div className="flex flex-col items-center gap-2 z-30">
          {/* Notification Bell Icon - Mapped ABOVE settings */}
          <button
            onClick={onOpenNotifications}
            className="relative w-9 h-9 rounded-full bg-[#161d28] border border-[#20e3a2]/40 flex items-center justify-center cursor-pointer hover:bg-[#1d2531] transition-colors group shadow-md"
            title="Notifications & Messages"
          >
            <Bell className="w-4.5 h-4.5 text-[#20e3a2] group-hover:scale-110 transition-transform" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 bg-[#ff5470] text-black text-[9px] font-black rounded-full flex items-center justify-center animate-pulse shadow-[0_0_6px_rgba(255,84,112,0.6)]">
                {unreadNotificationsCount}
              </span>
            )}
          </button>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="w-9 h-9 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center cursor-pointer hover:bg-[#1d2531] transition-colors"
              title="Open Settings"
            >
              <Settings className="w-4.5 h-4.5 text-[#8d97ab]" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Conversation List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-12 space-y-5">
        {/* Channels/Global Chat section */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold tracking-[1.5px] text-[#5a6478] uppercase px-1">Channels & Private Spaces</h3>
          
          {(() => {
            const meChatId = 'me:' + currentUser.id;
            const mePreview = getChatPreview(meChatId);
            const meUnreadCount = getUnreadCount(meChatId);
            
            const initials = (currentUser.display_name || currentUser.username || 'Me')
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase();
              
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
            
            const seed = currentUser.username?.charCodeAt(0) || 0;

            return (
              <button
                onClick={() => onSelectChat(meChatId, currentUser)}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#161d28]/60 hover:bg-[#161d28] border border-[#212a38]/40 transition-colors cursor-pointer text-left group"
              >
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewProfileDetail?.('user', currentUser);
                  }}
                  className="w-12 h-12 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center shadow-lg relative overflow-hidden hover:border-[#20e3a2] hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer"
                  title="View Profile Details"
                >
                  <div 
                    className="absolute inset-0 flex items-center justify-center text-white text-xs font-black"
                    style={{
                      background: currentUser.avatar_url ? 'none' : getAvatarStyle(seed),
                    }}
                  >
                    {currentUser.avatar_url ? (
                      <img 
                        src={currentUser.avatar_url} 
                        alt="Me" 
                        className="w-full h-full rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  {/* Lock symbol indicator to show it is a private personal space */}
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#080b10] border-2 border-[#161d28] rounded-full flex items-center justify-center text-[#20e3a2] z-20">
                    <Shield className="w-2.5 h-2.5" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-[14.5px] text-white group-hover:text-[#20e3a2] transition-colors">
                      Me <span className="text-[10px] text-[#5a6478] font-mono font-medium ml-1.5 px-1.5 py-0.5 rounded bg-[#1d2531]">Personal Vault</span>
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {meUnreadCount > 0 && (
                        <span className="bg-[#20e3a2] text-black font-mono font-extrabold text-[10px] px-2 py-0.5 rounded-full min-w-[18px] text-center animate-pulse shadow-[0_0_12px_rgba(32,227,162,0.45)]">
                          {meUnreadCount}
                        </span>
                      )}
                      {mePreview && (
                        <span className="text-[11px] text-[#5a6478] font-mono font-semibold">
                          {mePreview.time}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[12.5px] text-[#8d97ab] font-medium truncate mt-0.5">
                    {mePreview ? (
                      <span>{mePreview.text}</span>
                    ) : (
                      'Write private drafts, notes, or files here...'
                    )}
                  </p>
                </div>
              </button>
            );
          })()}

          {(() => {
            const generalUnreadCount = getUnreadCount('general');
            return (
              <button
                onClick={() => onSelectChat('general')}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#161d28]/60 hover:bg-[#161d28] border border-[#212a38]/40 transition-colors cursor-pointer text-left group"
              >
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewProfileDetail?.('general');
                  }}
                  className="w-12 h-12 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center shadow-lg relative overflow-hidden hover:border-[#20e3a2] hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer"
                  title="View Portal Details"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-[#20e3a2]/10 to-[#7c5cff]/10 opacity-60 group-hover:opacity-100 transition-opacity" />
                  <svg width="28" height="28" viewBox="0 0 150 150" fill="none" className="relative z-10">
                    <defs>
                      <linearGradient id="generalLogoGrad" x1="0" y1="0" x2="150" y2="150" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#20e3a2" />
                        <stop offset="1" stopColor="#7c5cff" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M30 40 C30 20, 60 15, 75 35 C95 60, 60 65, 55 80 C50 95, 85 100, 90 75 C93 60, 75 55, 70 65 C65 75, 80 85, 100 78 C118 71, 118 45, 100 35 C85 27, 75 45, 85 55"
                      stroke="url(#generalLogoGrad)"
                      strokeWidth="11"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-bold text-[14.5px] text-white group-hover:text-[#20e3a2] transition-colors">
                      VyperVic General
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {generalUnreadCount > 0 && (
                        <span className="bg-[#20e3a2] text-black font-mono font-extrabold text-[10px] px-2 py-0.5 rounded-full min-w-[18px] text-center animate-pulse shadow-[0_0_12px_rgba(32,227,162,0.45)]">
                          {generalUnreadCount}
                        </span>
                      )}
                      {generalPreview && (
                        <span className="text-[11px] text-[#5a6478] font-mono font-semibold">
                          {generalPreview.time}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[12.5px] text-[#8d97ab] font-medium truncate mt-0.5">
                    {generalPreview ? (
                      <span>
                        <span className="text-[#eef1f6] font-semibold">
                          {generalPreview.senderId === currentUser.id
                            ? 'You'
                            : (allProfiles.find((p) => p.id === generalPreview.senderId)?.display_name || 'User')}:{' '}
                        </span>
                        {generalPreview.text}
                      </span>
                    ) : (
                      'No messages yet. Jump in!'
                    )}
                  </p>
                </div>
              </button>
            );
          })()}
        </div>

        {/* Mixed Normal Chats (Groups & Direct Messages combined chronological) */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-bold tracking-[1.5px] text-[#5a6478] uppercase px-1">Conversations</h3>
          
          {mixedChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-[#212a38] rounded-2xl bg-[#161d28]/10">
              <MessageSquare className="w-8 h-8 text-[#5a6478] mb-2.5 opacity-60" />
              <p className="text-xs text-[#8d97ab] font-medium leading-relaxed">
                No conversation portals open yet.<br />
                Tap the floating search button below to start a chat.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {mixedChats.map((session) => {
                const unreadCount = session.unreadCount;
                
                if (session.isGroup) {
                  // Render Group item
                  const groupData = (groups || []).find(g => g.id === session.chatId);
                  return (
                    <button
                      key={session.chatId}
                      onClick={() => onSelectChat(session.chatId)}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#161d28]/20 hover:bg-[#161d28]/70 border border-[#212a38]/20 hover:border-[#212a38]/70 transition-all cursor-pointer text-left group"
                    >
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewProfileDetail?.('group', groupData || session);
                        }}
                        className="w-12 h-12 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center shadow-lg relative overflow-hidden hover:border-[#20e3a2] hover:scale-105 active:scale-95 transition-all shrink-0 cursor-pointer"
                        title="View Group Details"
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-[#7c5cff]/20 to-[#20e3a2]/20 opacity-75" />
                        {session.icon && (session.icon.startsWith('data:image/') || session.icon.startsWith('http')) ? (
                          <img 
                            src={session.icon} 
                            alt="" 
                            className="w-full h-full object-cover rounded-full relative z-10" 
                          />
                        ) : (
                          <span className="relative z-10 text-lg font-black">{session.icon || '👥'}</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-[14.5px] text-white group-hover:text-[#20e3a2] transition-colors truncate">
                            {session.name}
                            <span className="text-[9px] text-[#20e3a2] font-mono font-bold ml-2 px-1 rounded bg-[#20e3a2]/10 border border-[#20e3a2]/15 font-sans">GROUP</span>
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {unreadCount > 0 && (
                              <span className="bg-[#20e3a2] text-black font-mono font-extrabold text-[10px] px-2 py-0.5 rounded-full min-w-[18px] text-center animate-pulse shadow-[0_0_12px_rgba(32,227,162,0.45)]">
                                {unreadCount}
                              </span>
                            )}
                            {session.lastMsg && (
                              <span className={`text-[11px] font-mono font-semibold ${session.lastMsg.isDraft ? 'text-[#ff9233] animate-pulse' : 'text-[#5a6478]'}`}>
                                {session.lastMsg.time}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <p className="text-[12.5px] text-[#8d97ab] font-medium truncate mt-0.5">
                          {session.lastMsg ? (
                            <span>
                              {session.lastMsg.isDraft ? (
                                <span className="text-[#ff9233] font-bold mr-1.5">[Draft]</span>
                              ) : (
                                <span className="text-[#eef1f6] font-semibold">
                                  {session.lastMsg.senderId === currentUser.id
                                    ? 'You'
                                    : getContactDisplayName(allProfiles.find((p) => p.id === session.lastMsg!.senderId))}:{' '}
                                </span>
                              )}
                              {session.lastMsg.text}
                            </span>
                          ) : (
                            <span className="italic text-[#5a6478]">No messages yet</span>
                          )}
                        </p>
                      </div>
                    </button>
                  );
                } else {
                  // Render Direct Message item
                  const peer = session.peer!;
                  const seed = peer.username?.charCodeAt(0) || 0;
                  return (
                    <button
                      key={session.chatId}
                      onClick={() => onSelectChat(session.chatId, peer)}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#161d28]/30 hover:bg-[#161d28]/80 border border-[#212a38]/20 hover:border-[#212a38] transition-all cursor-pointer text-left group"
                    >
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewProfileDetail?.('user', peer);
                        }}
                        className="relative w-12 h-12 flex-shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform"
                        title="View Profile Details"
                      >
                        <div
                          className="w-full h-full rounded-full flex items-center justify-center text-white text-lg font-bold shadow-md select-none"
                          style={{
                            background: peer.avatar_url ? 'none' : getAvatarStyle(seed),
                          }}
                        >
                          {peer.avatar_url ? (
                            <img
                              src={peer.avatar_url}
                              alt=""
                              className="w-full h-full rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            getInitials(peer.display_name || peer.username || 'V')
                          )}
                        </div>
                        
                        <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2.5 border-[#080b10] flex items-center justify-center">
                          <Circle
                            className={`w-full h-full rounded-full fill-current ${
                              peer.is_online ? 'text-[#20e3a2]' : 'text-[#5a6478]'
                            }`}
                          />
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-[14.5px] text-white group-hover:text-[#7c5cff] transition-colors truncate">
                            {getContactDisplayName(peer)}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {unreadCount > 0 && (
                              <span className="bg-[#7c5cff] text-white font-mono font-extrabold text-[10px] px-2 py-0.5 rounded-full min-w-[18px] text-center animate-pulse shadow-[0_0_12px_rgba(124,92,255,0.45)]">
                                {unreadCount}
                              </span>
                            )}
                            {session.lastMsg && (
                              <span className={`text-[11px] font-mono font-semibold ${session.lastMsg.isDraft ? 'text-[#ff9233] animate-pulse' : 'text-[#5a6478]'}`}>
                                {session.lastMsg.time}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-[12.5px] text-[#8d97ab] font-medium truncate mt-0.5 flex items-center gap-1">
                          {session.lastMsg ? (
                            <>
                              {session.lastMsg.isDraft ? (
                                <span className="text-[#ff9233] font-bold mr-1">[Draft]</span>
                              ) : session.lastMsg.senderId === currentUser.id ? (
                                <span className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-[#5a6478]">You:</span>
                                </span>
                              ) : null}
                              <span className="truncate">{session.lastMsg.text}</span>
                            </>
                          ) : (
                            <span className="italic text-[#5a6478]">Chat open</span>
                          )}
                        </p>
                      </div>
                    </button>
                  );
                }
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Search Button */}
      <button
        onClick={onOpenSearch}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-[#20e3a2] to-[#7c5cff] text-black shadow-[0_8px_24px_rgba(32,227,162,0.35)] flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all z-40 hover:shadow-[0_8px_32px_rgba(124,92,255,0.45)] group border border-white/10"
        title="Search & Establish Channel"
      >
        <Search className="w-5.5 h-5.5 text-black group-hover:rotate-12 transition-transform" />
      </button>
    </div>
  );
}

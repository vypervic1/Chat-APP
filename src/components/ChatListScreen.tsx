import React, { useMemo, useState, useEffect, memo, useRef } from 'react';
import { Profile, Message, Group } from '../types';
import { Search, Settings, MessageSquare, Shield, Circle, User, Bell, Users, WifiOff, MoreHorizontal, Archive, Lock, X, Star, ArrowLeft, Paperclip, Pin, Trash2, Mail, CheckCircle, Unlock, Image } from 'lucide-react';
import { getContactDisplayName, isUserOnline } from '../utils/customNames';

interface ChatListScreenProps {
  currentUser: Profile;
  onSelectChat: (chatId: string, peer?: Profile, targetMessageId?: string) => void;
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

function ChatListScreen({
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
  const [showMenu, setShowMenu] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [showLockedModal, setShowLockedModal] = useState(false);
  const [showStarredModal, setShowStarredModal] = useState(false);
  const [showSearchMessagesModal, setShowSearchMessagesModal] = useState(false);
  const [searchMessageQuery, setSearchMessageQuery] = useState('');
  const [searchSenderId, setSearchSenderId] = useState('all');

  // Persistent chat management states stored in localStorage
  const [pinnedChats, setPinnedChats] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vyper_pinned_chats');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [archivedChats, setArchivedChats] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vyper_archived_chats');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [lockedChats, setLockedChats] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vyper_locked_chats');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [unreadMarkedChats, setUnreadMarkedChats] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vyper_unread_marked_chats');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [deletedChats, setDeletedChats] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vyper_deleted_chats');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Long press active menu context state
  const [activeLongPressChat, setActiveLongPressChat] = useState<{
    chatId: string;
    isGroup: boolean;
    peer?: Profile;
    name?: string;
    icon?: string;
    lastMsg?: any;
    unreadCount: number;
  } | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const togglePinChat = (chatId: string) => {
    setPinnedChats((prev) => {
      const updated = prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId];
      try { localStorage.setItem('vyper_pinned_chats', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveLongPressChat(null);
  };

  const toggleArchiveChat = (chatId: string) => {
    setArchivedChats((prev) => {
      const updated = prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId];
      try { localStorage.setItem('vyper_archived_chats', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveLongPressChat(null);
  };

  const toggleLockChat = (chatId: string) => {
    setLockedChats((prev) => {
      const updated = prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId];
      try { localStorage.setItem('vyper_locked_chats', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveLongPressChat(null);
  };

  const toggleUnreadChat = (chatId: string) => {
    setUnreadMarkedChats((prev) => {
      const updated = prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId];
      try { localStorage.setItem('vyper_unread_marked_chats', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveLongPressChat(null);
  };

  const handleDeleteConversation = (chatId: string) => {
    setDeletedChats((prev) => {
      const updated = prev.includes(chatId) ? prev : [...prev, chatId];
      try { localStorage.setItem('vyper_deleted_chats', JSON.stringify(updated)); } catch {}
      return updated;
    });
    setActiveLongPressChat(null);
  };

  const handleTouchStart = (sessionItem: any, e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if ('clientX' in e) {
      touchStartPosRef.current = { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
    }
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(50);
      }
      setActiveLongPressChat(sessionItem);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartPosRef.current) return;
    const currentX = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const currentY = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const diffX = Math.abs(currentX - touchStartPosRef.current.x);
    const diffY = Math.abs(currentY - touchStartPosRef.current.y);
    if (diffX > 10 || diffY > 10) {
      handleTouchEnd();
    }
  };

  // Compute unique senders list for Global Message Search filters
  const chatParticipants = useMemo(() => {
    const ids = Array.from(new Set(messagesList.map((m) => m.sender_id)));
    if (currentUser?.id && !ids.includes(currentUser.id)) ids.push(currentUser.id);

    return ids.map((id) => {
      const isMe = id === currentUser.id;
      const prof = allProfiles.find((p) => p.id === id);
      const name = isMe ? 'You' : (prof?.display_name || prof?.username || 'Operator');
      return {
        id,
        name,
        username: prof?.username,
        avatar: prof?.avatar_url,
      };
    });
  }, [messagesList, currentUser.id, allProfiles]);
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

    const chatMsgs = messagesList
      .filter((m) => m.chat_id === chatId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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
    } else if (textPreview.startsWith('_vyper_reply_::')) {
      try {
        const jsonStr = textPreview.substring('_vyper_reply_::'.length);
        const meta = JSON.parse(jsonStr);
        textPreview = meta.text || meta.reply_to_text || 'Reply';
      } catch (err) {
        textPreview = 'Reply';
      }
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

    if (textPreview.startsWith('[Forwarded]: ')) {
      textPreview = textPreview.substring('[Forwarded]: '.length);
    } else if (textPreview.startsWith('[Forwarded File]')) {
      textPreview = '📎 Forwarded File';
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
      if (lastMsg || isUserOnline(peer)) {
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

    // Filter out deleted chats, archived chats, or locked chats from main stream
    const visibleSessions = sessions.filter(
      (s) => !deletedChats.includes(s.chatId) && !archivedChats.includes(s.chatId) && !lockedChats.includes(s.chatId)
    );

    // Sort conversations: Pinned chats first! Then by latest message timestamp or fallback to 0
    return visibleSessions.sort((a, b) => {
      const isPinnedA = pinnedChats.includes(a.chatId);
      const isPinnedB = pinnedChats.includes(b.chatId);
      if (isPinnedA && !isPinnedB) return -1;
      if (!isPinnedA && isPinnedB) return 1;

      const timeA = a.lastMsg?.timestamp || 0;
      const timeB = b.lastMsg?.timestamp || 0;
      return timeB - timeA;
    });
  }, [allProfiles, messagesList, currentUser, groups, customNamesTick, pinnedChats, archivedChats, lockedChats, deletedChats, unreadMarkedChats]);

  // General chat preview details
  const generalPreview = useMemo(() => getChatPreview('general'), [messagesList, customNamesTick]);

  return (
    <div className="absolute inset-0 flex flex-col bg-[#080b10] text-[#eef1f6] z-10 select-none screen-gpu" style={{ willChange: 'transform', transform: 'translateZ(0)' }}>
      {/* Header Container */}
      <div className="pt-[calc(var(--safe-top)+3px)] px-5 pb-2.5 flex items-center justify-between border-b border-[#212a38] bg-[#080b10]/95 backdrop-blur-md sticky top-0 z-20">
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

        {/* Right side icons row: Notification left of Three-Dot Button */}
        <div className="flex items-center gap-2.5 z-30 relative">
          {/* Notification Bell Icon */}
          <button
            type="button"
            onClick={onOpenNotifications}
            className="relative w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 flex items-center justify-center cursor-pointer transition-all group shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.35),0_4px_16px_rgba(0,0,0,0.2)]"
            title="Notifications & Messages"
          >
            <Bell className="w-4.5 h-4.5 text-white/80 group-hover:text-white transition-colors" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-[#ff5470] text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse shadow-[0_0_8px_rgba(255,84,112,0.8)]">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Three-dot horizontal settings button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/20 flex items-center justify-center cursor-pointer transition-all shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.35),0_4px_16px_rgba(0,0,0,0.2)]"
              title="More Options"
            >
              <MoreHorizontal className="w-4.5 h-4.5 text-white/80" />
            </button>

            {/* Dropdown Menu */}
            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowMenu(false)} 
                />
                <div className="absolute right-0 mt-2 w-48 bg-[#161d28] border border-[#212a38] rounded-2xl shadow-2xl py-1 z-50 animate-fade-in divide-y divide-[#212a38]/60">
                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setShowArchivedModal(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-[#eef1f6] hover:bg-white/5 transition-colors cursor-pointer text-left"
                    >
                      <Archive className="w-4 h-4 text-[#7c5cff]" />
                      <span>Archived Chats</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setShowLockedModal(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-[#eef1f6] hover:bg-white/5 transition-colors cursor-pointer text-left"
                    >
                      <Lock className="w-4 h-4 text-[#20e3a2]" />
                      <span>Locked Chats</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setShowStarredModal(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-[#eef1f6] hover:bg-white/5 transition-colors cursor-pointer text-left"
                    >
                      <Star className="w-4 h-4 text-amber-400" />
                      <span>Starred</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setShowSearchMessagesModal(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-[#eef1f6] hover:bg-white/5 transition-colors cursor-pointer text-left"
                    >
                      <Search className="w-4 h-4 text-[#20e3a2]" />
                      <span>Message Search</span>
                    </button>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onOpenSettings();
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-[#eef1f6] hover:bg-white/5 transition-colors cursor-pointer text-left"
                    >
                      <Settings className="w-4 h-4 text-[#8d97ab]" />
                      <span>Settings</span>
                    </button>
                  </div>
                </div>
              </>
            )}
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

            const meSessionItem = {
              chatId: meChatId,
              isGroup: false,
              name: 'Me (Personal Vault)',
              lastMsg: mePreview,
              unreadCount: meUnreadCount,
            };

            return (
              <button
                onClick={() => onSelectChat(meChatId, currentUser)}
                onMouseDown={(e) => handleTouchStart(meSessionItem, e)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                onTouchStart={(e) => handleTouchStart(meSessionItem, e)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  setActiveLongPressChat(meSessionItem);
                }}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#161d28]/60 hover:bg-[#161d28] border border-[#212a38]/40 transition-colors cursor-pointer text-left group relative select-none"
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
                    <span className="font-display font-bold text-[14.5px] text-white group-hover:text-[#20e3a2] transition-colors flex items-center gap-1.5">
                      {pinnedChats.includes(meChatId) && <Pin className="w-3.5 h-3.5 text-[#20e3a2] fill-current shrink-0" />}
                      <span>Me</span>
                      <span className="text-[10px] text-[#5a6478] font-mono font-medium ml-1 px-1.5 py-0.5 rounded bg-[#1d2531]">Personal Vault</span>
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(meUnreadCount > 0 || unreadMarkedChats.includes(meChatId)) && (
                        <span className="bg-[#20e3a2] text-black font-mono font-extrabold text-[10px] px-2 py-0.5 rounded-full min-w-[18px] text-center animate-pulse shadow-[0_0_12px_rgba(32,227,162,0.45)]">
                          {meUnreadCount || 1}
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
            const generalSessionItem = {
              chatId: 'general',
              isGroup: false,
              name: 'VyperVic General',
              lastMsg: generalPreview,
              unreadCount: generalUnreadCount,
            };

            return (
              <button
                onClick={() => onSelectChat('general')}
                onMouseDown={(e) => handleTouchStart(generalSessionItem, e)}
                onMouseUp={handleTouchEnd}
                onMouseLeave={handleTouchEnd}
                onTouchStart={(e) => handleTouchStart(generalSessionItem, e)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                  setActiveLongPressChat(generalSessionItem);
                }}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#161d28]/60 hover:bg-[#161d28] border border-[#212a38]/40 transition-colors cursor-pointer text-left group relative select-none"
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
                    <span className="font-display font-bold text-[14.5px] text-white group-hover:text-[#20e3a2] transition-colors flex items-center gap-1.5">
                      {pinnedChats.includes('general') && <Pin className="w-3.5 h-3.5 text-[#20e3a2] fill-current shrink-0" />}
                      <span>VyperVic General</span>
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(generalUnreadCount > 0 || unreadMarkedChats.includes('general')) && (
                        <span className="bg-[#20e3a2] text-black font-mono font-extrabold text-[10px] px-2 py-0.5 rounded-full min-w-[18px] text-center animate-pulse shadow-[0_0_12px_rgba(32,227,162,0.45)]">
                          {generalUnreadCount || 1}
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
                const isMarkedUnread = unreadMarkedChats.includes(session.chatId);
                const isPinned = pinnedChats.includes(session.chatId);
                const unreadCount = isMarkedUnread ? (session.unreadCount || 1) : session.unreadCount;
                
                if (session.isGroup) {
                  // Render Group item
                  const groupData = (groups || []).find(g => g.id === session.chatId);
                  return (
                    <button
                      key={session.chatId}
                      onClick={() => onSelectChat(session.chatId)}
                      onMouseDown={(e) => handleTouchStart(session, e)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                      onTouchStart={(e) => handleTouchStart(session, e)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchMove}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                        setActiveLongPressChat(session);
                      }}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#161d28]/20 hover:bg-[#161d28]/70 border border-[#212a38]/20 hover:border-[#212a38]/70 transition-all cursor-pointer text-left group relative select-none"
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
                          <span className="font-display font-bold text-[14.5px] text-white group-hover:text-[#20e3a2] transition-colors truncate flex items-center gap-1.5">
                            {isPinned && <Pin className="w-3.5 h-3.5 text-[#20e3a2] fill-current shrink-0" />}
                            <span className="truncate">{session.name}</span>
                            <span className="text-[9px] text-[#20e3a2] font-mono font-bold ml-1 px-1 rounded bg-[#20e3a2]/10 border border-[#20e3a2]/15 font-sans shrink-0">GROUP</span>
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
                      onMouseDown={(e) => handleTouchStart(session, e)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                      onTouchStart={(e) => handleTouchStart(session, e)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchMove}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                        setActiveLongPressChat(session);
                      }}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#161d28]/30 hover:bg-[#161d28]/80 border border-[#212a38]/20 hover:border-[#212a38] transition-all cursor-pointer text-left group relative select-none"
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
                              isUserOnline(peer) ? 'text-[#20e3a2]' : 'text-[#5a6478]'
                            }`}
                          />
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-[14.5px] text-white group-hover:text-[#7c5cff] transition-colors truncate flex items-center gap-1.5">
                            {isPinned && <Pin className="w-3.5 h-3.5 text-[#20e3a2] fill-current shrink-0" />}
                            <span className="truncate">{getContactDisplayName(peer)}</span>
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

      {/* Floating Action Search Glass Orb */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="fixed bottom-20 right-5 w-13 h-13 rounded-full bg-white/20 backdrop-blur-2xl border border-white/40 text-white shadow-[0_12px_36px_rgba(0,0,0,0.4),inset_0_1.5px_2px_rgba(255,255,255,0.7)] flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all z-30 group"
        title="Search & Establish Channel"
      >
        <Search className="w-5.5 h-5.5 text-white group-hover:rotate-12 transition-transform drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
      </button>

      {/* Long Press Sucked Up Chat Card Context Menu Overlay */}
      {activeLongPressChat && (
        <div 
          className="fixed inset-0 bg-black/75 backdrop-blur-md z-[150] flex flex-col items-center justify-center p-4 animate-fade-in"
          onClick={() => setActiveLongPressChat(null)}
        >
          <div 
            className="w-full max-w-sm flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Highlighted Sucked Up Chat Card */}
            <div className="w-full bg-[#1a2332]/95 border-2 border-[#20e3a2]/80 rounded-2xl p-4 mb-4 shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_20px_rgba(32,227,162,0.3)] transform scale-105 transition-all duration-300 flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center shadow-lg shrink-0 overflow-hidden relative">
                {activeLongPressChat.peer ? (
                  activeLongPressChat.peer.avatar_url ? (
                    <img src={activeLongPressChat.peer.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold text-lg">{getInitials(activeLongPressChat.peer.display_name || activeLongPressChat.peer.username || 'V')}</span>
                  )
                ) : (
                  <span className="text-lg font-black">{activeLongPressChat.icon || '👥'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-base text-white truncate">
                    {activeLongPressChat.name || (activeLongPressChat.peer ? getContactDisplayName(activeLongPressChat.peer) : 'Chat Portal')}
                  </h4>
                  {pinnedChats.includes(activeLongPressChat.chatId) && (
                    <Pin className="w-4 h-4 text-[#20e3a2] fill-current shrink-0 ml-2" />
                  )}
                </div>
                <p className="text-xs text-[#8d97ab] truncate mt-0.5">
                  {activeLongPressChat.lastMsg?.text || 'Conversation active'}
                </p>
              </div>
            </div>

            {/* Apple Liquid Glass Context Menu */}
            <div className="w-full bg-[#161d28]/90 backdrop-blur-2xl border border-white/15 rounded-2xl overflow-hidden shadow-2xl divide-y divide-white/10 animate-scale-up">
              {/* View Chat Media */}
              <button
                type="button"
                onClick={() => {
                  const item = activeLongPressChat;
                  setActiveLongPressChat(null);
                  if (item) {
                    onSelectChat(item.chatId, item.peer);
                  }
                }}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  <Image className="w-4 h-4 text-[#7c5cff]" />
                  <span>Chat Media</span>
                </span>
                <span className="text-xs text-white/40 font-mono">⌘M</span>
              </button>

              {/* Pin Chat */}
              <button
                type="button"
                onClick={() => togglePinChat(activeLongPressChat.chatId)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  <Pin className={`w-4 h-4 ${pinnedChats.includes(activeLongPressChat.chatId) ? 'text-[#20e3a2] fill-current' : 'text-white/70'}`} />
                  <span>{pinnedChats.includes(activeLongPressChat.chatId) ? 'Unpin Chat' : 'Pin Chat'}</span>
                </span>
                <span className="text-xs text-white/40 font-mono">⌘P</span>
              </button>

              {/* Archive Chat */}
              <button
                type="button"
                onClick={() => toggleArchiveChat(activeLongPressChat.chatId)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  <Archive className={`w-4 h-4 ${archivedChats.includes(activeLongPressChat.chatId) ? 'text-[#7c5cff]' : 'text-white/70'}`} />
                  <span>{archivedChats.includes(activeLongPressChat.chatId) ? 'Unarchive Chat' : 'Archive Chat'}</span>
                </span>
                <span className="text-xs text-white/40 font-mono">⌘A</span>
              </button>

              {/* Mark as unread */}
              <button
                type="button"
                onClick={() => toggleUnreadChat(activeLongPressChat.chatId)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  {unreadMarkedChats.includes(activeLongPressChat.chatId) ? (
                    <CheckCircle className="w-4 h-4 text-[#20e3a2]" />
                  ) : (
                    <Mail className="w-4 h-4 text-white/70" />
                  )}
                  <span>{unreadMarkedChats.includes(activeLongPressChat.chatId) ? 'Mark as read' : 'Mark as unread'}</span>
                </span>
                <span className="text-xs text-white/40 font-mono">⌘U</span>
              </button>

              {/* Lock Chat */}
              <button
                type="button"
                onClick={() => toggleLockChat(activeLongPressChat.chatId)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left text-sm font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  {lockedChats.includes(activeLongPressChat.chatId) ? (
                    <Unlock className="w-4 h-4 text-[#20e3a2]" />
                  ) : (
                    <Lock className="w-4 h-4 text-white/70" />
                  )}
                  <span>{lockedChats.includes(activeLongPressChat.chatId) ? 'Unlock Chat' : 'Lock Chat'}</span>
                </span>
                <span className="text-xs text-white/40 font-mono">⌘L</span>
              </button>

              {/* Delete Conversation */}
              <button
                type="button"
                onClick={() => handleDeleteConversation(activeLongPressChat.chatId)}
                className="w-full px-4 py-3.5 flex items-center justify-between text-left text-sm font-bold text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>Delete Conversation</span>
                </span>
                <span className="text-xs text-rose-400/50 font-mono">⌘D</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archived Chats Modal */}
      {showArchivedModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#161d28] border border-[#212a38] rounded-3xl w-full max-w-md p-5 relative shadow-2xl max-h-[80vh] flex flex-col">
            <button
              type="button"
              onClick={() => setShowArchivedModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4 shrink-0">
              <div className="p-2.5 rounded-2xl bg-[#7c5cff]/15 text-[#7c5cff]">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-white leading-tight">Archived Chats</h3>
                <p className="text-[11px] text-[#8d97ab] mt-0.5">Hidden conversations saved locally</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 space-y-2">
              {archivedChats.length === 0 ? (
                <div className="p-8 bg-[#080b10]/60 border border-dashed border-[#212a38] rounded-2xl text-center space-y-2 my-auto">
                  <Archive className="w-8 h-8 text-[#5a6478] mx-auto opacity-40" />
                  <p className="text-xs font-semibold text-[#8d97ab]">No archived conversations</p>
                  <p className="text-[11px] text-[#5a6478]">Long-press any chat to archive it here.</p>
                </div>
              ) : (
                archivedChats.map((archivedId) => {
                  const peer = allProfiles.find((p) => `dm:${[currentUser.id, p.id].sort().join(':')}` === archivedId);
                  const grp = groups.find((g) => g.id === archivedId);
                  const isGeneral = archivedId === 'general';
                  const isMe = archivedId === `dm:${currentUser.id}:${currentUser.id}`;

                  const name = isGeneral ? 'VyperVic General' : isMe ? 'Me (Personal Vault)' : grp ? grp.name : peer ? getContactDisplayName(peer) : archivedId;

                  return (
                    <div 
                      key={archivedId} 
                      onClick={() => {
                        setShowArchivedModal(false);
                        if (isMe) {
                          onSelectChat(archivedId, currentUser);
                        } else {
                          onSelectChat(archivedId, peer);
                        }
                      }}
                      className="flex items-center justify-between p-3 rounded-2xl bg-[#080b10] border border-[#212a38] hover:border-[#7c5cff]/60 hover:bg-[#161d28] transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8.5 h-8.5 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">
                          {peer ? (
                            peer.avatar_url ? (
                              <img src={peer.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              getInitials(peer.display_name || peer.username || 'V')
                            )
                          ) : isGeneral ? (
                            '💬'
                          ) : isMe ? (
                            '👤'
                          ) : (
                            '👥'
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-white group-hover:text-[#20e3a2] transition-colors truncate block max-w-[150px] sm:max-w-[190px]">
                            {name}
                          </span>
                          <span className="text-[10px] text-[#20e3a2] font-semibold block">
                            Tap to open conversation
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setShowArchivedModal(false);
                            if (isMe) {
                              onSelectChat(archivedId, currentUser);
                            } else {
                              onSelectChat(archivedId, peer);
                            }
                          }}
                          className="px-2.5 py-1.5 text-xs font-bold rounded-xl bg-[#20e3a2]/20 text-[#20e3a2] hover:bg-[#20e3a2]/30 border border-[#20e3a2]/30 transition-colors cursor-pointer"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleArchiveChat(archivedId);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-[#7c5cff]/20 text-[#7c5cff] hover:bg-[#7c5cff]/30 border border-[#7c5cff]/30 transition-colors cursor-pointer"
                          title="Unarchive and return to chat list"
                        >
                          Unarchive
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Locked Chats Modal */}
      {showLockedModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#161d28] border border-[#212a38] rounded-3xl w-full max-w-md p-5 relative shadow-2xl max-h-[80vh] flex flex-col">
            <button
              type="button"
              onClick={() => setShowLockedModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4 shrink-0">
              <div className="p-2.5 rounded-2xl bg-[#20e3a2]/15 text-[#20e3a2]">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-white leading-tight">Locked Chats</h3>
                <p className="text-[11px] text-[#8d97ab] mt-0.5">Protected private conversations</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 space-y-2">
              {lockedChats.length === 0 ? (
                <div className="p-8 bg-[#080b10]/60 border border-dashed border-[#212a38] rounded-2xl text-center space-y-2 my-auto">
                  <Lock className="w-8 h-8 text-[#20e3a2] mx-auto opacity-40" />
                  <p className="text-xs font-semibold text-[#8d97ab]">No locked chats configured</p>
                  <p className="text-[11px] text-[#5a6478]">Long-press any chat in your list to lock or secure it.</p>
                </div>
              ) : (
                lockedChats.map((lockedId) => {
                  const peer = allProfiles.find((p) => `dm:${[currentUser.id, p.id].sort().join(':')}` === lockedId);
                  const grp = groups.find((g) => g.id === lockedId);
                  const isGeneral = lockedId === 'general';
                  const isMe = lockedId === `dm:${currentUser.id}:${currentUser.id}`;

                  const name = isGeneral ? 'VyperVic General' : isMe ? 'Me (Personal Vault)' : grp ? grp.name : peer ? getContactDisplayName(peer) : lockedId;

                  return (
                    <div key={lockedId} className="flex items-center justify-between p-3 rounded-2xl bg-[#080b10] border border-[#212a38]">
                      <span className="text-sm font-bold text-white truncate max-w-[200px]">{name}</span>
                      <button
                        type="button"
                        onClick={() => toggleLockChat(lockedId)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#20e3a2]/20 text-[#20e3a2] hover:bg-[#20e3a2]/30 border border-[#20e3a2]/30 transition-colors cursor-pointer"
                      >
                        Unlock
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Starred Messages Modal */}
      {showStarredModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#161d28] border border-[#212a38] rounded-3xl w-full max-w-md p-5 relative shadow-2xl flex flex-col max-h-[80vh]">
            <button
              type="button"
              onClick={() => setShowStarredModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4 shrink-0">
              <div className="p-2.5 rounded-2xl bg-amber-500/15 text-amber-400">
                <Star className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h3 className="font-display font-bold text-base text-white leading-tight">Starred Messages</h3>
                <p className="text-[11px] text-[#8d97ab] mt-0.5">Bookmarked messages and links</p>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 pr-1 space-y-2.5">
              {(() => {
                let starredIds: string[] = [];
                try {
                  const cached = localStorage.getItem(`vyper_starred_msg_ids_${currentUser.id}`);
                  starredIds = cached ? JSON.parse(cached) : [];
                } catch {}

                const starredMsgs = messagesList.filter(m => starredIds.includes(m.id));

                if (starredMsgs.length === 0) {
                  return (
                    <div className="p-8 bg-[#080b10]/60 border border-dashed border-[#212a38] rounded-2xl text-center space-y-2 my-auto">
                      <Star className="w-8 h-8 text-amber-400 mx-auto opacity-40" />
                      <p className="text-xs font-semibold text-[#8d97ab]">No starred messages</p>
                      <p className="text-[11px] text-[#5a6478]">Long-press any message in a chat and tap "Star" to bookmark it here.</p>
                    </div>
                  );
                }

                return starredMsgs.map((msg) => {
                  const sender = allProfiles.find(p => p.id === msg.sender_id);
                  const senderName = sender?.display_name || sender?.username || 'Operator';
                  const dateStr = new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                  return (
                    <div
                      key={msg.id}
                      onClick={() => {
                        setShowStarredModal(false);
                        onSelectChat(msg.chat_id, undefined, msg.id);
                      }}
                      className="p-3.5 rounded-2xl bg-[#080b10]/60 hover:bg-[#080b10] border border-[#212a38] transition-all cursor-pointer text-left group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-bold text-[#20e3a2] truncate">{senderName}</span>
                        <span className="text-[10px] text-[#5a6478] font-mono shrink-0">{dateStr}</span>
                      </div>
                      <p className="text-xs text-[#eef1f6] line-clamp-2 leading-relaxed">
                        {msg.text || (msg.is_voice ? '🎤 Voice Note' : '📎 Attachment')}
                      </p>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Global Message Search Full Screen Overlay */}
      {showSearchMessagesModal && (
        <div className="fixed inset-0 bg-[#080b10]/85 backdrop-blur-3xl z-[100] flex flex-col p-4 md:p-6 animate-fade-in overflow-hidden shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]">
          {/* Header Bar */}
          <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-4 shrink-0">
            <button
              onClick={() => {
                setShowSearchMessagesModal(false);
                setSearchMessageQuery('');
                setSearchSenderId('all');
              }}
              className="w-10 h-10 rounded-full bg-white/5 backdrop-blur-md border border-white/10 flex items-center justify-center text-white hover:text-[#20e3a2] cursor-pointer hover:bg-white/15 transition-all shrink-0"
              title="Close search"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-[#20e3a2]" />
                <span>Message Search</span>
              </h3>
              <p className="text-[10px] text-[#8d97ab] truncate mt-0.5">
                Search keywords and filter senders across all chat sessions
              </p>
            </div>
          </div>

          {/* Search Inputs (Keyword & Sender Filter) */}
          <div className="space-y-3 shrink-0 mb-4">
            {/* Keyword Input */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-[#8d97ab] absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchMessageQuery}
                onChange={(e) => setSearchMessageQuery(e.target.value)}
                placeholder="Search keywords across all chats..."
                className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl pl-10 pr-10 py-2.5 text-xs font-semibold text-white placeholder-[#5a6478] outline-none focus:border-[#20e3a2]/70 focus:bg-white/10 transition-all shadow-inner"
                autoFocus
              />
              {searchMessageQuery && (
                <button
                  type="button"
                  onClick={() => setSearchMessageQuery('')}
                  className="absolute right-3 p-1 rounded-full text-[#8d97ab] hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sender Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[10px] font-bold text-[#8d97ab] uppercase font-mono shrink-0 mr-1">
                Sender:
              </span>
              <button
                type="button"
                onClick={() => setSearchSenderId('all')}
                className={`px-3 py-1.5 rounded-xl text-[10.5px] font-bold transition-all shrink-0 cursor-pointer backdrop-blur-lg ${
                  searchSenderId === 'all'
                    ? 'bg-[#20e3a2] text-black shadow-md shadow-[#20e3a2]/20'
                    : 'bg-white/5 border border-white/10 text-[#8d97ab] hover:text-white hover:bg-white/10'
                }`}
              >
                All Senders
              </button>

              {chatParticipants.map((sender) => {
                const isSelected = searchSenderId === sender.id;
                return (
                  <button
                    key={sender.id}
                    type="button"
                    onClick={() => setSearchSenderId(sender.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10.5px] font-bold transition-all shrink-0 cursor-pointer backdrop-blur-lg ${
                      isSelected
                        ? 'bg-[#7c5cff] text-white shadow-md shadow-[#7c5cff]/20'
                        : 'bg-white/5 border border-white/10 text-[#8d97ab] hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-[8px] bg-black/30 font-bold">
                      {sender.avatar ? (
                        <img src={sender.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        sender.name.substring(0, 1).toUpperCase()
                      )}
                    </span>
                    <span className="truncate max-w-[110px]">{sender.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results Summary Count */}
          {(() => {
            const query = searchMessageQuery.trim().toLowerCase();
            const matchingMsgs = messagesList
              .filter((m) => {
                if (m.text?.startsWith('_vyper_deleted_::')) return false;

                if (searchSenderId !== 'all' && m.sender_id !== searchSenderId) {
                  return false;
                }

                if (!query) return true;

                let content = m.text || m.file_name || '';
                if (content.startsWith('_vyper_reply_::')) {
                  try {
                    const meta = JSON.parse(content.substring('_vyper_reply_::'.length));
                    content = meta.text || '';
                  } catch (e) {}
                } else if (content.startsWith('_vyper_call_::')) {
                  content = 'Call';
                } else if (content.startsWith('[Forwarded]: ')) {
                  content = content.substring('[Forwarded]: '.length);
                }

                const matchesText = content.toLowerCase().includes(query);
                const matchesFile = m.file_name ? m.file_name.toLowerCase().includes(query) : false;
                const sender = allProfiles.find((p) => p.id === m.sender_id);
                const senderName = m.sender_id === currentUser.id ? 'you' : (sender?.display_name || sender?.username || '').toLowerCase();
                const matchesSender = senderName.includes(query);

                return matchesText || matchesFile || matchesSender;
              })
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            return (
              <>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#8d97ab] border-b border-white/10 pb-2.5 mb-3 shrink-0">
                  <span>
                    {matchingMsgs.length} message{matchingMsgs.length === 1 ? '' : 's'} found
                  </span>
                  {(searchMessageQuery || searchSenderId !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchMessageQuery('');
                        setSearchSenderId('all');
                      }}
                      className="text-[10px] text-[#20e3a2] hover:underline cursor-pointer font-bold"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {matchingMsgs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
                      <Search className="w-10 h-10 text-[#5a6478] mb-3 opacity-40" />
                      <p className="text-xs font-bold text-white mb-1">No matching messages</p>
                      <p className="text-[10px] text-[#8d97ab] max-w-xs">
                        Try adjusting your search keyword or selecting a different sender filter.
                      </p>
                    </div>
                  ) : (
                    matchingMsgs.map((msg) => {
                      const sender = allProfiles.find((p) => p.id === msg.sender_id);
                      const senderName = msg.sender_id === currentUser.id ? 'You' : (sender?.display_name || sender?.username || 'Operator');
                      const senderSeed = sender?.username?.charCodeAt(0) || 0;

                      // Find chat room title
                      let roomTitle = 'Direct Message';
                      if (msg.chat_id === 'general') {
                        roomTitle = 'General Channel';
                      } else if (msg.chat_id.startsWith('dm:')) {
                        const peerId = msg.chat_id.split(':').find((id) => id !== currentUser.id && id !== 'dm');
                        const peer = allProfiles.find((p) => p.id === peerId);
                        if (peer) roomTitle = peer.display_name || peer.username;
                        else if (msg.chat_id === `me:${currentUser.id}`) roomTitle = 'Me (Personal Vault)';
                      } else if (groups) {
                        const grp = groups.find((g) => g.id === msg.chat_id);
                        if (grp) roomTitle = grp.name;
                      }

                      let displayContent = msg.text || '';
                      if (displayContent.startsWith('_vyper_reply_::')) {
                        try {
                          const meta = JSON.parse(displayContent.substring('_vyper_reply_::'.length));
                          displayContent = meta.text || '';
                        } catch (e) {}
                      } else if (displayContent.startsWith('_vyper_call_::')) {
                        displayContent = '📞 Call Message';
                      } else if (displayContent.startsWith('[Forwarded]: ')) {
                        displayContent = displayContent.substring('[Forwarded]: '.length);
                      }

                      const dateStr = new Date(msg.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={msg.id}
                          onClick={() => {
                            setShowSearchMessagesModal(false);
                            setSearchMessageQuery('');
                            setSearchSenderId('all');
                            let targetPeer: Profile | undefined;
                            if (msg.chat_id.startsWith('dm:')) {
                              const peerId = msg.chat_id.split(':').find((id) => id !== currentUser.id && id !== 'dm');
                              targetPeer = allProfiles.find((p) => p.id === peerId);
                            }
                            onSelectChat(msg.chat_id, targetPeer, msg.id);
                          }}
                          className="p-3.5 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 hover:border-[#20e3a2]/50 hover:bg-white/10 transition-all cursor-pointer flex items-start gap-3 group animate-fade-in shadow-sm"
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm shrink-0 mt-0.5"
                            style={{
                              background: sender?.avatar_url ? 'none' : getAvatarStyle(senderSeed),
                            }}
                          >
                            {sender?.avatar_url ? (
                              <img
                                src={sender.avatar_url}
                                alt="Sender"
                                className="w-full h-full rounded-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              getInitials(senderName)
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-white group-hover:text-[#20e3a2] transition-colors truncate">
                                  {roomTitle}
                                </span>
                                <span className="text-[10px] text-[#20e3a2] font-semibold shrink-0">
                                  • {senderName}
                                </span>
                              </div>
                              <span className="text-[9.5px] font-mono text-[#8d97ab] shrink-0">
                                {dateStr}
                              </span>
                            </div>

                            <p className="text-xs text-[#eef1f6] leading-relaxed break-words font-medium line-clamp-3">
                              {displayContent || (msg.is_voice ? '🎤 Voice Note' : msg.file_name ? `📎 ${msg.file_name}` : '')}
                            </p>

                            {msg.file_name && (
                              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#20e3a2] font-mono">
                                <Paperclip className="w-3 h-3" />
                                <span className="truncate">{msg.file_name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default memo(ChatListScreen);


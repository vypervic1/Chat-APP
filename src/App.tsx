import { useState, useEffect, useRef, useMemo } from 'react';
import NotificationCard from './components/NotificationCard';
import { PushNotification, Profile, Message, Call, Group, ThemeConfig } from './types';
import { Bell, AtSign, Smartphone, MessageSquare, X, Send, Loader2, Sparkles, AlertTriangle, Phone, Users, Settings } from 'lucide-react';
import { supabase } from './supabase';
import { motion, AnimatePresence } from 'motion/react';
import { displayLocalPushNotification, requestNotificationPermission } from './notifications';

// Import sub-components
import Splash from './components/Splash';
import AuthScreen from './components/AuthScreen';
import ChatListScreen from './components/ChatListScreen';
import ChatScreen from './components/ChatScreen';
import SearchScreen from './components/SearchScreen';
import SettingsScreen from './components/SettingsScreen';
import CallsScreen from './components/CallsScreen';
import CallOverlay from './components/CallOverlay';
import FullscreenProfile from './components/FullscreenProfile';
import { GlobalAudioBanner } from './components/GlobalAudioBanner';
import { saveFileToLocalStorage } from './utils/indexedDB';
import { flushOfflineQueue } from './utils/offlineSync';

// Helper to gracefully merge/append optimistic and database messages, preventing duplicate rendering
export function addOrUpdateMessage(prev: Message[], newMsg: Message): Message[] {
  const isTemp = typeof newMsg.id === 'string' && newMsg.id.startsWith('temp_');
  
  const matchIndex = prev.findIndex((m) => {
    if (m.id === newMsg.id) return true;
    
    // Check if the message in the list is an optimistic copy matching this database message
    if (!isTemp && typeof m.id === 'string' && m.id.startsWith('temp_')) {
      return (
        m.sender_id === newMsg.sender_id &&
        m.chat_id === newMsg.chat_id &&
        m.text === newMsg.text &&
        m.file_name === newMsg.file_name &&
        m.is_voice === newMsg.is_voice
      );
    }
    
    // Check if we are inserting an optimistic message that is already in the list
    if (isTemp && typeof m.id === 'string' && m.id.startsWith('temp_')) {
      return m.id === newMsg.id;
    }
    
    return false;
  });

  if (matchIndex >= 0) {
    const updated = [...prev];
    updated[matchIndex] = { ...updated[matchIndex], ...newMsg };
    return updated;
  } else {
    return [...prev, newMsg];
  }
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    try {
      const saved = localStorage.getItem('vypervic_current_user_cache');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Real-time synchronization state
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [messagesList, setMessagesList] = useState<Message[]>([]);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [groupCallStatuses, setGroupCallStatuses] = useState<Record<string, string>>({});
  const [callHistory, setCallHistory] = useState<Call[]>([]);

  // Track contacts that the user has chatted or interacted with
  const existingContactIds = useMemo(() => {
    if (!currentUser) return [];
    const set = new Set<string>();

    messagesList.forEach((m) => {
      if (m.sender_id && m.sender_id !== currentUser.id) set.add(m.sender_id);
      if (m.receiver_id && m.receiver_id !== currentUser.id) set.add(m.receiver_id);
      if (m.chat_id && m.chat_id.startsWith('dm:')) {
        const parts = m.chat_id.replace('dm:', '').split(':');
        parts.forEach((id) => {
          if (id && id !== currentUser.id) set.add(id);
        });
      }
    });

    try {
      const saved = localStorage.getItem('vyper_custom_display_names');
      if (saved) {
        const map = JSON.parse(saved);
        Object.keys(map).forEach((id) => set.add(id));
      }
    } catch (e) {}

    return Array.from(set);
  }, [currentUser, messagesList]);

  const [appTheme, setAppTheme] = useState<string>(() => {
    return localStorage.getItem('vypervic_app_theme') || 'liquid-glass';
  });

  const applyAppTheme = (theme: string) => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'light-liquid-glass') {
      root.style.setProperty('--bg', '#f1f5f9');
      root.style.setProperty('--surface', 'rgba(255, 255, 255, 0.75)');
      root.style.setProperty('--surface-2', 'rgba(241, 245, 249, 0.85)');
      root.style.setProperty('--surface-3', 'rgba(226, 232, 240, 0.9)');
      root.style.setProperty('--hairline', 'rgba(203, 213, 225, 0.6)');
      root.style.setProperty('--accent-a', '#007aff');
      root.style.setProperty('--accent-b', '#0284c7');
      root.style.setProperty('--text-1', '#0f172a');
      root.style.setProperty('--text-2', '#334155');
      root.style.setProperty('--text-3', '#64748b');
      root.style.setProperty('--bubble-recv', 'rgba(255, 255, 255, 0.85)');
    } else if (theme === 'light-solar') {
      root.style.setProperty('--bg', '#fffbf5');
      root.style.setProperty('--surface', '#ffffff');
      root.style.setProperty('--surface-2', '#fef3c7');
      root.style.setProperty('--surface-3', '#fde68a');
      root.style.setProperty('--hairline', '#fcd34d');
      root.style.setProperty('--accent-a', '#0284c7');
      root.style.setProperty('--accent-b', '#8b5cf6');
      root.style.setProperty('--text-1', '#1e1b4b');
      root.style.setProperty('--text-2', '#3730a3');
      root.style.setProperty('--text-3', '#4338ca');
      root.style.setProperty('--bubble-recv', '#fef9c3');
    } else if (theme === 'light-emerald') {
      root.style.setProperty('--bg', '#f0fdf4');
      root.style.setProperty('--surface', '#ffffff');
      root.style.setProperty('--surface-2', '#dcfce7');
      root.style.setProperty('--surface-3', '#bbf7d0');
      root.style.setProperty('--hairline', '#86efac');
      root.style.setProperty('--accent-a', '#059669');
      root.style.setProperty('--accent-b', '#10b981');
      root.style.setProperty('--text-1', '#064e3b');
      root.style.setProperty('--text-2', '#047857');
      root.style.setProperty('--text-3', '#059669');
      root.style.setProperty('--bubble-recv', '#e6f4ea');
    } else if (theme === 'light' || theme === 'light-cosmic') {
      root.style.setProperty('--bg', '#f8fafc');
      root.style.setProperty('--surface', '#ffffff');
      root.style.setProperty('--surface-2', '#f1f5f9');
      root.style.setProperty('--surface-3', '#e2e8f0');
      root.style.setProperty('--hairline', '#cbd5e1');
      root.style.setProperty('--accent-a', '#059669');
      root.style.setProperty('--accent-b', '#6366f1');
      root.style.setProperty('--text-1', '#0f172a');
      root.style.setProperty('--text-2', '#475569');
      root.style.setProperty('--text-3', '#64748b');
      root.style.setProperty('--bubble-recv', '#f1f5f9');
    } else if (theme === 'emerald') {
      root.style.setProperty('--bg', '#040706');
      root.style.setProperty('--surface', '#0a0e0c');
      root.style.setProperty('--surface-2', '#0f1512');
      root.style.setProperty('--surface-3', '#151c19');
      root.style.setProperty('--hairline', '#1a2621');
      root.style.setProperty('--accent-a', '#00ff88');
      root.style.setProperty('--accent-b', '#20e3a2');
      root.style.setProperty('--text-1', '#eef1f6');
      root.style.setProperty('--text-2', '#8d97ab');
      root.style.setProperty('--text-3', '#5a6478');
      root.style.setProperty('--bubble-recv', '#182130');
    } else if (theme === 'solar') {
      root.style.setProperty('--bg', '#0b0914');
      root.style.setProperty('--surface', '#131024');
      root.style.setProperty('--surface-2', '#1b1730');
      root.style.setProperty('--surface-3', '#231f3d');
      root.style.setProperty('--hairline', '#302a54');
      root.style.setProperty('--accent-a', '#00e5ff');
      root.style.setProperty('--accent-b', '#7c5cff');
      root.style.setProperty('--text-1', '#eef1f6');
      root.style.setProperty('--text-2', '#8d97ab');
      root.style.setProperty('--text-3', '#5a6478');
      root.style.setProperty('--bubble-recv', '#182130');
    } else if (theme === 'liquid-glass') {
      root.style.setProperty('--bg', '#030712');
      root.style.setProperty('--surface', 'rgba(17, 24, 39, 0.45)');
      root.style.setProperty('--surface-2', 'rgba(31, 41, 55, 0.55)');
      root.style.setProperty('--surface-3', 'rgba(55, 65, 81, 0.65)');
      root.style.setProperty('--hairline', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--accent-a', '#007aff');
      root.style.setProperty('--accent-b', '#38bdf8');
      root.style.setProperty('--text-1', '#f8fafc');
      root.style.setProperty('--text-2', '#94a3b8');
      root.style.setProperty('--text-3', '#64748b');
      root.style.setProperty('--bubble-recv', 'rgba(31, 41, 55, 0.5)');
    } else {
      root.style.setProperty('--bg', '#080b10');
      root.style.setProperty('--surface', '#10151d');
      root.style.setProperty('--surface-2', '#161d28');
      root.style.setProperty('--surface-3', '#1d2531');
      root.style.setProperty('--hairline', '#212a38');
      root.style.setProperty('--accent-a', '#20e3a2');
      root.style.setProperty('--accent-b', '#7c5cff');
      root.style.setProperty('--text-1', '#eef1f6');
      root.style.setProperty('--text-2', '#8d97ab');
      root.style.setProperty('--text-3', '#5a6478');
      root.style.setProperty('--bubble-recv', '#182130');
    }
  };

  useEffect(() => {
    applyAppTheme(appTheme);
    localStorage.setItem('vypervic_app_theme', appTheme);
  }, [appTheme]);

  // Auto-flush queued offline messages when network connection is restored
  useEffect(() => {
    const handleOnline = () => {
      flushOfflineQueue();
    };
    window.addEventListener('online', handleOnline);
    // Flush on initial mount if online
    if (navigator.onLine) {
      flushOfflineQueue();
    }
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Request notification permissions on first open (PWA-to-Android conversion/Capacitor compatibility)
  useEffect(() => {
    if (currentUser) {
      const askPermission = async () => {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
          try {
            const perm = await requestNotificationPermission();
            setNotifPermission(perm);
          } catch (err) {
            console.warn('Failed to automatically request notification permission:', err);
          }
        }
      };
      // Delay slightly on first load so interface is visible and polished
      const timer = setTimeout(askPermission, 1200);
      return () => clearTimeout(timer);
    }
  }, [currentUser]);

  // Active Push Notification states
  const [notifications, setNotifications] = useState<PushNotification[]>(() => {
    const saved = localStorage.getItem('vypervic_unread_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const [headsUpNotification, setHeadsUpNotification] = useState<PushNotification | null>(null);
  const [showHeadsUpReply, setShowHeadsUpReply] = useState(false);
  const [headsUpReplyText, setHeadsUpReplyText] = useState('');
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
  };

  const [currentSimulatedTime, setCurrentSimulatedTime] = useState('');

  // Clock effect
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      let hours = d.getHours();
      let minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // 12 instead of 0
      const minutesStr = minutes < 10 ? '0' + minutes : minutes;
      setCurrentSimulatedTime(`${hours}:${minutesStr} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Save notifications to local storage
  useEffect(() => {
    try {
      localStorage.setItem('vypervic_unread_notifications', JSON.stringify(notifications));
    } catch (e) {
      console.warn('Failed to save unread notifications to localStorage:', e);
    }
  }, [notifications]);

  // Track dismissed notification and message IDs for the Notifications page
  const [dismissedFeedItemIds, setDismissedFeedItemIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vypervic_dismissed_feed_items');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vypervic_dismissed_feed_items', JSON.stringify(dismissedFeedItemIds));
    } catch (e) {
      console.warn('Failed to save dismissed feed items:', e);
    }
  }, [dismissedFeedItemIds]);

  // Helper to compile the dynamic feed of messages and notifications
  const getUnifiedFeed = (): PushNotification[] => {
    // 1. Map system/push notifications
    const mappedNotifs = notifications
      .map((n) => ({
        id: n.id,
        chatId: n.chatId,
        senderId: n.senderId,
        senderName: n.senderName,
        title: n.title,
        body: n.body,
        isMention: n.isMention,
        timestamp: n.timestamp,
      }));

    // 2. Map all chat messages
    const mappedMessages = messagesList
      .filter((m) => {
        // Only include messages from other users
        if (m.sender_id === currentUser?.id) return false;
        
        // It's unread if there's no receipt for this chat room yet
        const receipt = myReadReceipts[m.chat_id];
        if (!receipt) return true;
        
        const msgTime = new Date(m.created_at).getTime();
        const receiptTime = new Date(receipt.timestamp).getTime();
        
        // Unread if message timestamp is newer than our last read timestamp, and is not the lastReadMessageId
        return msgTime > receiptTime && m.id !== receipt.lastReadMessageId;
      })
      .map((m) => {
        const sender = allProfiles.find((p) => p.id === m.sender_id);
        const senderName = sender?.display_name || sender?.username || 'User';
        const isGeneral = m.chat_id === 'general';
        const title = isGeneral ? 'Message in #General' : 'Direct Message';
        const body = m.is_voice 
          ? '🎤 Sent a voice note' 
          : m.file_name 
            ? `📎 Sent attachment: ${m.file_name}` 
            : (m.text || '');

        return {
          id: m.id,
          chatId: m.chat_id,
          senderId: m.sender_id,
          senderName,
          title,
          body,
          isMention: false,
          timestamp: m.created_at,
        };
      });

    // 3. Merge, filter out manually dismissed items, and sort descending
    const combined = [...mappedNotifs, ...mappedMessages]
      .filter((item) => !dismissedFeedItemIds.includes(item.id));

    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Deduplicate
    const unique: typeof combined = [];
    const seen = new Set<string>();
    for (const item of combined) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        unique.push(item);
      }
    }

    return unique;
  };

  // App navigation state
  const [activeScreen, setActiveScreen] = useState<'chatList' | 'chat' | 'search' | 'settings' | 'calls'>('chatList');
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedPeerProfile, setSelectedPeerProfile] = useState<Profile | undefined>(undefined);
  const [selectedTargetMsgId, setSelectedTargetMsgId] = useState<string | null>(null);
  const [activeProfileView, setActiveProfileView] = useState<{ type: 'user' | 'group' | 'general'; data?: any } | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Register custom listeners for local UI/recording events
  useEffect(() => {
    const handleDeleteMessageEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.messageId) {
        setMessagesList((prev) => prev.map((m) => m.id === detail.messageId ? { ...m, text: '_vyper_deleted_::', is_voice: false, file_name: undefined, file_url: undefined, file_data: undefined, file_type: undefined } : m));
      }
    };
    
    const handleNewLocalMessage = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setMessagesList((prev) => addOrUpdateMessage(prev, detail));
      }
    };

    window.addEventListener('vyper_delete_message', handleDeleteMessageEvent);
    window.addEventListener('vyper_new_local_message', handleNewLocalMessage);

    return () => {
      window.removeEventListener('vyper_delete_message', handleDeleteMessageEvent);
      window.removeEventListener('vyper_new_local_message', handleNewLocalMessage);
    };
  }, []);

  // Groups state
  const [groups, setGroups] = useState<Group[]>(() => {
    try {
      const local = localStorage.getItem('vypervic_secure_groups_v1');
      return local ? JSON.parse(local) : [];
    } catch (e) {
      return [];
    }
  });

  // Automatically save all media, documents & files and voice records (sent or received) to device local storage
  const processedFileMsgIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    messagesList.forEach((msg) => {
      if (msg.file_data && msg.file_name && !processedFileMsgIdsRef.current.has(msg.id)) {
        processedFileMsgIdsRef.current.add(msg.id);
        
        const isSentByMe = currentUser && msg.sender_id === currentUser.id;
        const direction: 'to' | 'from' = isSentByMe ? 'to' : 'from';
        
        let targetName = 'Recipient';
        if (isSentByMe) {
          if (msg.chat_id.startsWith('dm:')) {
            const parts = msg.chat_id.split(':');
            const otherId = parts.find(id => id !== currentUser.id);
            const peer = allProfiles.find(p => p.id === otherId);
            targetName = peer?.display_name || peer?.username || 'Recipient';
          } else {
            const grp = groups.find(g => g.id === msg.chat_id);
            targetName = grp?.name || (msg.chat_id === 'general' ? 'VyperVic General' : 'Group Chat');
          }
        } else {
          const sender = allProfiles.find(p => p.id === msg.sender_id) || msg.profiles;
          targetName = sender?.display_name || sender?.username || 'Contact';
        }

        const effectiveFileType = msg.is_voice 
          ? 'audio/voice-note' 
          : (msg.file_type || 'application/octet-stream');

        // Save to IndexedDB
        saveFileToLocalStorage(
          msg.file_name, 
          effectiveFileType, 
          msg.file_data, 
          msg.id,
          direction,
          targetName
        )
          .then(() => {
            console.log(`Automatically cached/saved ${msg.file_name} to local storage`);
          })
          .catch((e) => {
            console.warn(`Failed to auto-cache ${msg.file_name}:`, e);
          });
      }

      // Automatically parse and save links to local storage
      if (msg.text && !msg.file_data && !processedFileMsgIdsRef.current.has(msg.id + '_link')) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = msg.text.match(urlRegex);
        if (urls && urls.length > 0) {
          processedFileMsgIdsRef.current.add(msg.id + '_link');

          const isSentByMe = currentUser && msg.sender_id === currentUser.id;
          const direction: 'to' | 'from' = isSentByMe ? 'to' : 'from';
          
          let targetName = 'Operator';
          if (isSentByMe) {
            if (msg.chat_id.startsWith('dm:')) {
              const parts = msg.chat_id.split(':');
              const otherId = parts.find(id => id !== currentUser.id);
              const peer = allProfiles.find(p => p.id === otherId);
              targetName = peer?.display_name || peer?.username || 'User';
            } else {
              const grp = groups.find(g => g.id === msg.chat_id);
              targetName = grp?.name || (msg.chat_id === 'general' ? 'VyperVic General' : 'Group Chat');
            }
          } else {
            const sender = allProfiles.find(p => p.id === msg.sender_id) || msg.profiles;
            targetName = sender?.display_name || sender?.username || 'Operator';
          }

          urls.forEach((url, index) => {
            saveFileToLocalStorage(
              url, 
              'link', 
              url, 
              `${msg.id}_link_${index}`,
              direction,
              targetName
            )
              .then(() => {
                console.log(`Automatically cached link ${url} to local storage`);
              })
              .catch((e) => {
                console.warn(`Failed to auto-cache link ${url}:`, e);
              });
          });
        }
      }
    });
  }, [messagesList, currentUser, allProfiles, groups]);

  // Global roast toast event listener
  useEffect(() => {
    const handleRoastToast = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        showToast(detail);
      }
    };
    window.addEventListener('vyper_show_roast_toast', handleRoastToast);
    return () => window.removeEventListener('vyper_show_roast_toast', handleRoastToast);
  }, []);
  const [typingState, setTypingState] = useState<Record<string, Record<string, { username: string; timestamp: number }>>>({});
  
  // Load and persist read receipts
  const [readReceipts, setReadReceipts] = useState<Record<string, { readerId: string; lastReadMessageId: string; timestamp: string }>>(() => {
    const local = localStorage.getItem('vypervic_read_receipts_v2');
    return local ? JSON.parse(local) : {};
  });

  // Load and persist our own read receipts for unread badge counts
  const [myReadReceipts, setMyReadReceipts] = useState<Record<string, { lastReadMessageId: string; timestamp: string }>>(() => {
    const local = localStorage.getItem('vypervic_my_read_receipts_v1');
    return local ? JSON.parse(local) : {};
  });

  const wasNotificationCenterOpenRef = useRef(false);

  useEffect(() => {
    if (showNotificationCenter) {
      wasNotificationCenterOpenRef.current = true;
    } else if (wasNotificationCenterOpenRef.current) {
      wasNotificationCenterOpenRef.current = false;
      
      // 1. Clear custom sliding push notifications
      setNotifications([]);
      
      // 2. Mark all other users' messages in our chats as read (by setting our read receipts to the latest message)
      setMyReadReceipts((prev) => {
        const next = { ...prev };
        const roomsWithUnread = new Set<string>();
        
        messagesList.forEach((m) => {
          if (m.sender_id !== currentUser?.id) {
            roomsWithUnread.add(m.chat_id);
          }
        });
        
        roomsWithUnread.forEach((chatId) => {
          const roomMsgs = messagesList.filter((m) => m.chat_id === chatId);
          if (roomMsgs.length > 0) {
            const lastMsg = roomMsgs[roomMsgs.length - 1];
            next[chatId] = {
              lastReadMessageId: lastMsg.id,
              timestamp: new Date().toISOString(),
            };
            
            // Broadcast read receipt
            const lastPeerMsg = [...roomMsgs].reverse().find((m) => m.sender_id !== (currentUser?.id || ''));
            if (lastPeerMsg && currentUser) {
              sendBroadcastEvent('read_receipt', {
                chatId,
                readerId: currentUser.id,
                lastReadMessageId: lastPeerMsg.id,
                timestamp: new Date().toISOString(),
              });
            }
          }
        });
        
        return next;
      });
      
      showToast('Read');
    }
  }, [showNotificationCenter, currentUser, messagesList]);

  // Load and persist message reactions
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>(() => {
    const local = localStorage.getItem('vypervic_reactions_v2');
    return local ? JSON.parse(local) : {};
  });

  // Load and persist pinned messages per chat room
  const [pinnedState, setPinnedState] = useState<Record<string, string[]>>(() => {
    try {
      const local = localStorage.getItem('vypervic_pinned_messages_v3');
      return local ? JSON.parse(local) : {};
    } catch (e) {
      return {};
    }
  });

  // Custom Themes (Requirement 3.1 & 3.2)

  const [chatThemes, setChatThemes] = useState<Record<string, ThemeConfig>>(() => {
    try {
      const local = localStorage.getItem('vypervic_chat_themes_v1');
      return local ? JSON.parse(local) : {};
    } catch (e) {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vypervic_secure_groups_v1', JSON.stringify(groups));
    } catch (e) {
      // Ignore
    }
  }, [groups]);

  useEffect(() => {
    try {
      localStorage.setItem('vypervic_chat_themes_v1', JSON.stringify(chatThemes));
    } catch (e) {
      // Ignore
    }
  }, [chatThemes]);

  // Redirect to active chat when notification is clicked
  const selectChatFromNotification = (chatId: string) => {
    setSelectedChatId(chatId);
    if (chatId === 'general') {
      setSelectedPeerProfile(undefined);
    } else {
      const peerId = chatId.split(':').find((id) => id !== currentUser?.id);
      const peer = allProfiles.find((p) => p.id === peerId);
      setSelectedPeerProfile(peer);
    }
    setActiveScreen('chat');
    setShowNotificationCenter(false);
    setHeadsUpNotification(null);
  };

  // Quick reply directly from the notification center
  const handleReplyFromNotification = async (notifId: string, text: string) => {
    const unified = getUnifiedFeed();
    const item = unified.find((u) => u.id === notifId) || (headsUpNotification?.id === notifId ? headsUpNotification : null);
    if (!item) return;

    const replyMsg = {
      id: 'temp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      chat_id: item.chatId,
      sender_id: currentUser?.id || '',
      text: text,
      file_name: null,
      file_type: null,
      file_data: null,
      is_voice: false,
      created_at: new Date().toISOString(),
    };

    // Insert to local optimistic list
    setMessagesList((prev) => addOrUpdateMessage(prev, replyMsg));

    // Try sending to Supabase
    try {
      const { data, error } = await supabase.from('messages').insert({
        chat_id: item.chatId,
        sender_id: currentUser?.id,
        text: text,
        is_voice: false,
      }).select();
      
      if (!error && data && data[0]) {
        // Swap out our temp message with real db message
        setMessagesList((prev) => addOrUpdateMessage(prev, data[0]));
      }
    } catch (dbErr) {
      console.warn('Realtime db insert failed, message will persist locally:', dbErr);
    }

    // Broadcast reply event so peers see it immediately
    sendBroadcastEvent('message', {
      id: 'msg_reply_' + Date.now(),
      chat_id: item.chatId,
      sender_id: currentUser?.id,
      text: text,
      is_voice: false,
      created_at: new Date().toISOString(),
    });

    // Remove notification from tray
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    if (headsUpNotification?.id === notifId) {
      setHeadsUpNotification(null);
    }
    showToast('Sent');
  };

  const chatUpdatesChannelRef = useRef<any>(null);

  const currentUserRef = useRef<Profile | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);
  const allProfilesRef = useRef<Profile[]>([]);
  const groupsRef = useRef<Group[]>([]);
  const activeCallRef = useRef<Call | null>(null);
  const isInitiatingCallRef = useRef<boolean>(false);
  const activeScreenRef = useRef<'chatList' | 'chat' | 'search' | 'settings' | 'calls'>('chatList');
  const sessionStartRef = useRef<number>(Date.now());
  const processedPushNotifIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    allProfilesRef.current = allProfiles;
  }, [allProfiles]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    activeScreenRef.current = activeScreen;
  }, [activeScreen]);

  // Trigger beautiful heads-up notification drawer and sound for background messages or mentions
  const triggerPushNotification = (newMsg: Message) => {
    if (!currentUserRef.current) return;
    if (!newMsg || !newMsg.id) return;

    // Avoid duplicate notification triggers for the same message ID
    if (processedPushNotifIdsRef.current.has(newMsg.id)) return;

    // Ignore messages sent by current user or in current active chat room
    if (newMsg.sender_id === currentUserRef.current.id) return;
    if (newMsg.chat_id === selectedChatIdRef.current) return;

    // Ignore messages created prior to current session boot (e.g. historical messages or initial sync batch)
    const msgTime = new Date(newMsg.created_at || Date.now()).getTime();
    if (!isNaN(msgTime) && msgTime < sessionStartRef.current - 5000) {
      return;
    }

    // Privacy & Relevance Filters
    const isDM = newMsg.chat_id.startsWith('dm:');
    let isRecipientOfDM = false;
    if (isDM && newMsg.chat_id !== 'dm:system:test') {
      const parts = newMsg.chat_id.split(':');
      const u1 = parts[1];
      const u2 = parts[2];
      if (currentUserRef.current.id === u1 || currentUserRef.current.id === u2) {
        isRecipientOfDM = true;
      } else {
        return; // Ignore other users' private DMs completely
      }
    }

    const isGroup = newMsg.chat_id.startsWith('group:');
    if (isGroup) {
      const targetGroup = groupsRef.current.find((g) => g.id === newMsg.chat_id);
      if (!targetGroup || !targetGroup.members || !targetGroup.members.includes(currentUserRef.current.id)) {
        return; // Ignore groups user is not a member of
      }
    }

    const isMention = !!(
      newMsg.text && 
      currentUserRef.current?.username && 
      newMsg.text.toLowerCase().includes(`@${currentUserRef.current.username.toLowerCase()}`)
    );

    // CRITICAL: Only notify if it is a DM sent to user or an explicit @mention in a group/general chat!
    const shouldNotify = isRecipientOfDM || isMention;

    if (!shouldNotify) {
      return;
    }

    processedPushNotifIdsRef.current.add(newMsg.id);

    const sender = allProfilesRef.current.find((p) => p.id === newMsg.sender_id);
    const senderName = sender?.display_name || sender?.username || 'Somebody';
    const avatarUrl = sender?.avatar_url;

    // Vibrate if supported
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([100, 50, 100]);
      } catch (e) {}
    }

    // Play sound
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const ctx = new AudioContext();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.15);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(698.46, ctx.currentTime + 0.05);
        osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.35);
        osc2.stop(ctx.currentTime + 0.35);
      }
    } catch (audioErr) {}

    const notificationTitle = isDM 
      ? `New message from ${senderName}` 
      : isMention 
        ? `${senderName} mentioned you`
        : `New message`;
    const notificationBody = newMsg.is_voice 
      ? '🎤 Sent a voice note' 
      : newMsg.text || 'Sent an attachment 📎';

    const newNotif: PushNotification = {
      id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      chatId: newMsg.chat_id,
      senderId: newMsg.sender_id,
      senderName,
      title: notificationTitle,
      body: notificationBody,
      isMention: !!isMention,
      timestamp: new Date().toISOString(),
    };

    setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
    setHeadsUpNotification(newNotif);
    setShowHeadsUpReply(false);
    setHeadsUpReplyText('');

    // Auto-dismiss heads-up banner after 6 seconds
    setTimeout(() => {
      setHeadsUpNotification((current) => current?.id === newNotif.id ? null : current);
    }, 6000);

    // System notification
    displayLocalPushNotification(notificationTitle, notificationBody, avatarUrl);
  };

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    activeScreenRef.current = activeScreen;
  }, [activeScreen]);

  // Sync state to local storage
  useEffect(() => {
    try {
      localStorage.setItem('vypervic_read_receipts_v2', JSON.stringify(readReceipts));
    } catch (e) {
      console.warn('Failed to save read receipts to localStorage:', e);
    }
  }, [readReceipts]);

  useEffect(() => {
    try {
      localStorage.setItem('vypervic_my_read_receipts_v1', JSON.stringify(myReadReceipts));
    } catch (e) {
      console.warn('Failed to save my read receipts to localStorage:', e);
    }
  }, [myReadReceipts]);

  useEffect(() => {
    try {
      localStorage.setItem('vypervic_reactions_v2', JSON.stringify(reactions));
    } catch (e) {
      console.warn('Failed to save reactions to localStorage:', e);
    }
  }, [reactions]);

  // Global toast notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Show a visual toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    const timer = setTimeout(() => setToastMessage(null), 1500);
    return () => clearTimeout(timer);
  };

  // 1. Check Auth state on mount and subscribe to changes
  useEffect(() => {
    const getOrCreateProfile = async (userId: string, email: string) => {
      // First try to select existing profile by ID
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      if (prof) {
        // Update online status in background non-blockingly for instant login
        supabase
          .from('profiles')
          .update({ is_online: true, last_seen: new Date().toISOString() })
          .eq('id', userId)
          .then(() => {})
          .catch((e) => console.warn('Non-blocking online status update error:', e));

        return { ...prof, is_online: true };
      }

      // If we got here, profile with id = userId does not exist.
      // Check if a profile with the same email already exists (which belongs to a different userId, e.g. from a prior database state or auth reset)
      if (email) {
        try {
          const { data: existingEmailProf } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();

          if (existingEmailProf) {
            console.log('Found profile with matching email but different ID. Resolving association...');
            // Try to update the existing profile's ID to the new userId!
            const { data: updatedIdProf, error: updateIdError } = await supabase
              .from('profiles')
              .update({ id: userId, is_online: true, last_seen: new Date().toISOString() })
              .eq('email', email)
              .select('*')
              .single();

            if (!updateIdError && updatedIdProf) {
              console.log('Successfully reassociated profile ID via email match.');
              return updatedIdProf;
            }

            // If updating the ID directly fails (e.g., due to PK constraint update restrictions or RLS),
            // try to delete the stale profile with that email, so we can insert a fresh one without constraint violations.
            console.warn('Could not update profile ID directly, deleting stale profile to recreate:', updateIdError);
            await supabase.from('profiles').delete().eq('email', email);
          }
        } catch (emailCheckErr) {
          console.warn('Error checking/resolving email profile match:', emailCheckErr);
        }
      }

      // Profile does not exist, let's create it!
      // Check if there is a pending profile saved in localStorage
      let username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
      let displayName = email.split('@')[0];
      
      try {
        const pendingStr = localStorage.getItem('vypervic_pending_profile');
        if (pendingStr) {
          const pending = JSON.parse(pendingStr);
          if (pending.id === userId) {
            if (pending.username) username = pending.username;
            if (pending.display_name) displayName = pending.display_name;
          }
        }
      } catch (e) {
        console.warn('Error reading pending profile:', e);
      }

      // Handle username collision: check if the username is already taken by another user
      let isUsernameTaken = true;
      let checkUsername = username || 'user_' + Math.random().toString(36).substring(2, 7);
      let attempts = 0;

      while (isUsernameTaken && attempts < 5) {
        try {
          const { data: existingUser } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', checkUsername)
            .maybeSingle();

          if (existingUser && existingUser.id !== userId) {
            // Username is taken, append random characters to make it unique
            checkUsername = (username || 'user') + '_' + Math.random().toString(36).substring(2, 6);
            attempts++;
          } else {
            isUsernameTaken = false;
          }
        } catch (err) {
          isUsernameTaken = false; // Stop loop on database error to avoid infinite loop
        }
      }

      const newProfile = {
        id: userId,
        email,
        username: checkUsername,
        display_name: displayName,
        about: 'Hey there! I am using VyperVic.',
        is_online: true,
        last_seen: new Date().toISOString(),
      };

      const { data: createdProf, error: createError } = await supabase
        .from('profiles')
        .upsert(newProfile)
        .select('*')
        .single();

      if (createError) {
        console.warn('Error creating fallback/pending profile on remote database:', createError);
        // Try to just insert without upsert if that was the issue
        const { data: insertedProf, error: insertError } = await supabase
          .from('profiles')
          .insert(newProfile)
          .select('*')
          .single();
        if (insertError) {
          console.warn('Error inserting profile on remote database, using memory fallback:', insertError);
          localStorage.removeItem('vypervic_pending_profile');
          return newProfile;
        }
        localStorage.removeItem('vypervic_pending_profile');
        return insertedProf;
      }

      localStorage.removeItem('vypervic_pending_profile');
      return createdProf;
    };

    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          if (currentUserRef.current && currentUserRef.current.id === session.user.id) {
            setLoading(false);
            return;
          }
          const prof = await getOrCreateProfile(session.user.id, session.user.email || '');
          if (prof) {
            setCurrentUser(prof);
            try {
              localStorage.setItem('vypervic_current_user_cache', JSON.stringify(prof));
            } catch (e) {}
          }
        } else {
          setCurrentUser(null);
          localStorage.removeItem('vypervic_current_user_cache');
        }
      } catch (err) {
        console.error('Error checking authentication:', err);
        // Fallback to cached profile if offline or network connection fails
        const cache = localStorage.getItem('vypervic_current_user_cache');
        if (cache) {
          try {
            setCurrentUser(JSON.parse(cache));
          } catch (e) {}
        }
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    // Setup listener for auth state updates
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
          if (currentUserRef.current && currentUserRef.current.id === session.user.id) {
            return;
          }
          const prof = await getOrCreateProfile(session.user.id, session.user.email || '');
          if (prof) {
            setCurrentUser(prof);
            try {
              localStorage.setItem('vypervic_current_user_cache', JSON.stringify(prof));
            } catch (e) {}
          }
        } else if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
          localStorage.removeItem('vypervic_current_user_cache');
        }
      } catch (err) {
        console.error('Error in onAuthStateChange:', event, err);
        if (event === 'SIGNED_IN') {
          const cache = localStorage.getItem('vypervic_current_user_cache');
          if (cache) {
            try {
              setCurrentUser(JSON.parse(cache));
            } catch (e) {}
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 2. Fetch profiles, messages, and setup real-time Postgres changes listeners
  useEffect(() => {
    if (!currentUser) return;

    // Fetch initial profiles list
    const fetchProfiles = async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('*');
        if (!error && data) {
          setAllProfiles(data);
          try {
            localStorage.setItem('vypervic_profiles_cache', JSON.stringify(data));
          } catch (e) {
            console.warn('Failed to save profiles cache to localStorage:', e);
          }
        } else {
          // Fallback to cache
          const cache = localStorage.getItem('vypervic_profiles_cache');
          if (cache) {
            setAllProfiles(JSON.parse(cache));
          }
        }
      } catch (err) {
        console.error('Error fetching profiles:', err);
        // Fallback to cache on network exceptions
        const cache = localStorage.getItem('vypervic_profiles_cache');
        if (cache) {
          try {
            setAllProfiles(JSON.parse(cache));
          } catch (e) {}
        }
      }
    };

    // Fetch message history
    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .order('created_at', { ascending: true });

        if (!error && data) {
          const filteredData = data.filter((m) => {
            if (!m.chat_id) return true;
            if (m.chat_id.startsWith('dm:')) {
              if (m.chat_id === 'dm:system:test') return true;
              const parts = m.chat_id.split(':');
              const u1 = parts[1];
              const u2 = parts[2];
              return currentUserRef.current && (currentUserRef.current.id === u1 || currentUserRef.current.id === u2);
            }
            return true;
          });
          setMessagesList(filteredData);
          try {
            // Keep only the most recent 100 messages in the offline cache to avoid exceeding localStorage quota
            const recentMessages = filteredData.slice(-100);
            localStorage.setItem('vypervic_messages_cache', JSON.stringify(recentMessages));
          } catch (cacheErr) {
            console.warn('Could not save messages to local storage cache due to quota limits:', cacheErr);
            try {
              // Try caching only the last 30 messages as a fallback
              const miniMessages = filteredData.slice(-30);
              localStorage.setItem('vypervic_messages_cache', JSON.stringify(miniMessages));
            } catch (secondErr) {
              console.error('Fallback cache attempt also failed:', secondErr);
            }
          }
        } else {
          // Fallback to cache
          const cache = localStorage.getItem('vypervic_messages_cache');
          if (cache) {
            try {
              const cachedData = JSON.parse(cache) as Message[];
              const filteredData = cachedData.filter((m) => {
                if (!m.chat_id) return true;
                if (m.chat_id.startsWith('dm:')) {
                  if (m.chat_id === 'dm:system:test') return true;
                  const parts = m.chat_id.split(':');
                  const u1 = parts[1];
                  const u2 = parts[2];
                  return currentUserRef.current && (currentUserRef.current.id === u1 || currentUserRef.current.id === u2);
                }
                return true;
              });
              setMessagesList(filteredData);
            } catch (parseErr) {}
          }
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
        // Fallback to cache on network exceptions
        const cache = localStorage.getItem('vypervic_messages_cache');
        if (cache) {
          try {
            setMessagesList(JSON.parse(cache));
          } catch (e) {}
        }
      }
    };

    const fetchCallStatuses = async () => {
      try {
        const { data, error } = await supabase
          .from('calls')
          .select('id, status');
        if (!error && data) {
          const statuses: Record<string, string> = {};
          data.forEach((c) => {
            statuses[c.id] = c.status;
          });
          setGroupCallStatuses(statuses);
        }
      } catch (err) {
        console.error('Error fetching call statuses:', err);
      }
    };

    const fetchCallHistory = async () => {
      try {
        let combined: any[] = [];
        
        // 1. Fetch direct calls involving the current user as caller or receiver
        const { data: directData, error: directError } = await supabase
          .from('calls')
          .select('*')
          .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
          .order('created_at', { ascending: false })
          .limit(40);
          
        if (!directError && directData) {
          combined = [...directData];
        } else if (directError) {
          console.warn('Direct calls fetch error:', directError);
        }

        // 2. Fetch group calls (where receiver_id is 'general') inside a separate try-catch block
        // to gracefully recover if receiver_id is of type UUID in PostgreSQL.
        try {
          const { data: groupData, error: groupError } = await supabase
            .from('calls')
            .select('*')
            .eq('receiver_id', 'general')
            .order('created_at', { ascending: false })
            .limit(25);
            
          if (!groupError && groupData) {
            combined = [...combined, ...groupData];
          }
        } catch (gErr) {
          console.warn('Group call fetch bypassed (receiver_id is likely UUID type):', gErr);
        }

        // Sort combined array in descending order by created_at
        combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setCallHistory(combined.slice(0, 40));
      } catch (err) {
        console.warn('Failed to fetch initial call history:', err);
      }
    };

    fetchProfiles();
    fetchMessages();
    fetchCallStatuses();
    fetchCallHistory();

    const checkAndTriggerIncomingCall = (messageText: string) => {
      if (!messageText || !messageText.startsWith('_vyper_call_::')) return;
      try {
        const jsonStr = messageText.substring('_vyper_call_::'.length);
        const callMeta = JSON.parse(jsonStr);
        if (callMeta && callMeta.status === 'ringing') {
          const isTarget = callMeta.receiverId === currentUserRef.current?.id || 
                         (callMeta.receiverId === 'general' && callMeta.callerId !== currentUserRef.current?.id);
          
          if (isTarget && callMeta.callerId !== currentUserRef.current?.id) {
            const incomingCall: Call = {
              id: callMeta.callId,
              caller_id: callMeta.callerId,
              receiver_id: callMeta.receiverId || 'general',
              type: callMeta.type,
              status: 'ringing',
              signal_data: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            if (!activeCallRef.current) {
              console.log('WebRTC: Automatically setting active call from system message trigger:', incomingCall);
              setActiveCall(incomingCall);
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse incoming call metadata from message:', e);
      }
    };

    // A. Listen to profiles table updates (status, display name edits, avatar changes)
    const profilesChannel = supabase
      .channel('realtime_profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newProfile = payload.new as Profile;
            setAllProfiles((prev) => {
              if (prev.some((p) => p.id === newProfile.id)) return prev;
              return [...prev, newProfile];
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedProfile = payload.new as Profile;
            setAllProfiles((prev) =>
              prev.map((p) => (p.id === updatedProfile.id ? updatedProfile : p))
            );
            if (updatedProfile.id === currentUserRef.current?.id) {
              setCurrentUser(updatedProfile);
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setAllProfiles((prev) => prev.filter((p) => p.id !== deletedId));
          }
        }
      )
      .subscribe();

    // B. Listen to messages table updates (real-time chat messaging)
    const messagesChannel = supabase
      .channel('realtime_messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = (payload.new || payload.old) as Message;
          if (msg && msg.chat_id) {
            if (msg.chat_id.startsWith('dm:')) {
              if (msg.chat_id !== 'dm:system:test') {
                const parts = msg.chat_id.split(':');
                const u1 = parts[1];
                const u2 = parts[2];
                if (currentUserRef.current && currentUserRef.current.id !== u1 && currentUserRef.current.id !== u2) {
                  return; // Ignore other users' private DMs completely
                }
              }
            } else if (msg.chat_id.startsWith('me:')) {
              const targetUserId = msg.chat_id.substring(3);
              if (currentUserRef.current && currentUserRef.current.id !== targetUserId) {
                return; // Ignore other users' private self-chats completely
              }
            }
          }

          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as Message;
            setMessagesList((prev) => addOrUpdateMessage(prev, newMsg));

            if (newMsg.text) {
              checkAndTriggerIncomingCall(newMsg.text);
            }

            // Trigger background push notification checks and sliding banners
            // Explicitly filter message inserts by chat_id before triggering push notification
            if (newMsg && newMsg.chat_id) {
              const currentUserId = currentUserRef.current?.id;
              let isTargetedToUser = false;

              if (currentUserId) {
                if (newMsg.chat_id.startsWith('dm:')) {
                  const parts = newMsg.chat_id.split(':');
                  isTargetedToUser = (parts[1] === currentUserId || parts[2] === currentUserId);
                } else if (newMsg.chat_id.startsWith('me:')) {
                  isTargetedToUser = newMsg.chat_id === `me:${currentUserId}`;
                } else if (newMsg.chat_id.startsWith('group:')) {
                  const targetGroup = groupsRef.current.find((g) => g.id === newMsg.chat_id);
                  isTargetedToUser = !!(targetGroup?.members?.includes(currentUserId));
                } else if (newMsg.chat_id === 'general') {
                  const isMention = !!(
                    newMsg.text && 
                    currentUserRef.current?.username && 
                    newMsg.text.toLowerCase().includes(`@${currentUserRef.current.username.toLowerCase()}`)
                  );
                  isTargetedToUser = isMention;
                }
              }

              if (isTargetedToUser) {
                triggerPushNotification(newMsg);
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new as Message;
            setMessagesList((prev) => prev.map((m) => (m.id === updatedMsg.id ? updatedMsg : m)));
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old.id;
            setMessagesList((prev) => prev.map((m) => m.id === deletedId ? { ...m, text: '_vyper_deleted_::', is_voice: false, file_name: undefined, file_url: undefined, file_data: undefined, file_type: undefined } : m));
          }
        }
      )
      .subscribe();

    // C. Listen to calls table updates (real-time voice/video call request alerts)
    const callsChannel = supabase
      .channel('realtime_calls')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        (payload) => {
          const newCall = payload.new as Call;
          setGroupCallStatuses((prev) => ({ ...prev, [newCall.id]: newCall.status }));
          if (newCall.receiver_id === currentUserRef.current?.id && newCall.status === 'ringing') {
            setActiveCall(newCall);
          }
          setCallHistory((prev) => {
            if (prev.some((c) => c.id === newCall.id)) return prev;
            return [newCall, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls' },
        (payload) => {
          const updatedCall = payload.new as Call;
          setGroupCallStatuses((prev) => ({ ...prev, [updatedCall.id]: updatedCall.status }));
          if (updatedCall.id === activeCallRef.current?.id) {
            if (updatedCall.status === 'rejected' || updatedCall.status === 'ended') {
              setActiveCall(null);
            } else if (updatedCall.status === 'accepted') {
              setActiveCall(updatedCall);
            }
          }
          setCallHistory((prev) => {
            return prev.map((c) => c.id === updatedCall.id ? updatedCall : c);
          });
        }
      )
      .subscribe();

    // D. Global Real-time Broadcast updates (typing indicators, read receipts, message reactions, real-time calling signaling)
    const chatUpdatesChannel = supabase
      .channel('chat_updates_global')
      .on('broadcast', { event: 'typing' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        const { chatId, userId, username, isTyping } = payload;
        setTypingState((prev) => {
          const chatState = { ...(prev[chatId] || {}) };
          if (isTyping) {
            chatState[userId] = { username, timestamp: Date.now() };
          } else {
            delete chatState[userId];
          }
          return { ...prev, [chatId]: chatState };
        });
      })
      .on('broadcast', { event: 'read_receipt' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        const { chatId, readerId, lastReadMessageId, timestamp } = payload;
        if (readerId !== currentUserRef.current?.id) {
          setReadReceipts((prev) => ({
            ...prev,
            [chatId]: { readerId, lastReadMessageId, timestamp },
          }));
        }
      })
      .on('broadcast', { event: 'reaction' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        const { messageId, userId, emoji } = payload;
        setReactions((prev) => {
          const msgReactions = { ...(prev[messageId] || {}) } as Record<string, string[]>;
          
          let existingEmoji: string | null = null;
          for (const [key, users] of Object.entries(msgReactions)) {
            if (users.includes(userId)) {
              existingEmoji = key;
              break;
            }
          }

          const updatedMsgReactions = { ...msgReactions };

          if (existingEmoji === emoji) {
            const users = [...(updatedMsgReactions[emoji] || [])];
            const idx = users.indexOf(userId);
            if (idx >= 0) {
              users.splice(idx, 1);
            }
            if (users.length === 0) {
              delete updatedMsgReactions[emoji];
            } else {
              updatedMsgReactions[emoji] = users;
            }
          } else {
            if (existingEmoji) {
              const users = [...(updatedMsgReactions[existingEmoji] || [])];
              const idx = users.indexOf(userId);
              if (idx >= 0) {
                users.splice(idx, 1);
              }
              if (users.length === 0) {
                delete updatedMsgReactions[existingEmoji];
              } else {
                updatedMsgReactions[existingEmoji] = users;
              }
            }

            const users = [...(updatedMsgReactions[emoji] || [])];
            if (!users.includes(userId)) {
              users.push(userId);
            }
            updatedMsgReactions[emoji] = users;
          }
          return { ...prev, [messageId]: updatedMsgReactions };
        });
      })
      .on('broadcast', { event: 'pin_change' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        const { chatId, pinnedMessageIds } = payload;
        setPinnedState((prev) => {
          const updated = { ...prev, [chatId]: pinnedMessageIds };
          try {
            localStorage.setItem('vypervic_pinned_messages_v3', JSON.stringify(updated));
          } catch (e) {
            console.warn('Failed to save pinned messages to localStorage:', e);
          }
          return updated;
        });
      })
      .on('broadcast', { event: 'webrtc_signaling' }, (response: any) => {
        const payload = response.payload;
        if (!payload || !currentUserRef.current) return;
        // Check if message is for us, from us, or in a general/shared room
        if (payload.receiverId === currentUserRef.current.id || payload.senderId === currentUserRef.current.id || payload.receiverId === 'general') {
          if (payload.senderId !== currentUserRef.current.id) {
            window.dispatchEvent(new CustomEvent('vypervic_webrtc_signal', { detail: payload }));
          }
        }
      })
      .on('broadcast', { event: 'vyper_call_participant_added' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        window.dispatchEvent(new CustomEvent('vyper_call_participant_added', { detail: payload }));
      })
      .on('broadcast', { event: 'vyper_call_live_reaction' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        window.dispatchEvent(new CustomEvent('vyper_call_live_reaction', { detail: payload }));
      })
      .on('broadcast', { event: 'vyper_group_call_heartbeat' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        window.dispatchEvent(new CustomEvent('vyper_group_call_heartbeat', { detail: payload }));
      })
      .on('broadcast', { event: 'vyper_group_call_leave' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        window.dispatchEvent(new CustomEvent('vyper_group_call_leave', { detail: payload }));
      })
      .on('broadcast', { event: 'call_invite' }, (response: any) => {
        const payload = response.payload;
        if (!payload || !currentUserRef.current) return;
        const { call } = payload;
        if (call.receiver_id === 'general' && call.status === 'ringing') {
          setGroupCallStatuses((prev) => ({ ...prev, [call.id]: 'ringing' }));
        } else if (call.receiver_id === currentUserRef.current.id && call.status === 'ringing') {
          setActiveCall(call);
        }
      })
      .on('broadcast', { event: 'call_status_update' }, (response: any) => {
        const payload = response.payload;
        if (!payload || !currentUserRef.current) return;
        const { callId, status } = payload;
        setGroupCallStatuses((prev) => ({ ...prev, [callId]: status }));
        if (activeCallRef.current && activeCallRef.current.id === callId) {
          if (status === 'accepted') {
            setActiveCall((prev) => prev ? { ...prev, status: 'accepted' } : null);
          } else if (status === 'rejected' || status === 'ended') {
            setActiveCall(null);
          }
        }
      })
      .on('broadcast', { event: 'new_message' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        const { message } = payload;
        if (!message || !message.chat_id) return;

        // Apply strict privacy filters to real-time broadcast messages
        if (message.chat_id.startsWith('dm:')) {
          if (message.chat_id !== 'dm:system:test') {
            const parts = message.chat_id.split(':');
            const u1 = parts[1];
            const u2 = parts[2];
            if (currentUserRef.current && currentUserRef.current.id !== u1 && currentUserRef.current.id !== u2) {
              return; // Ignore other users' private DMs completely
            }
          }
        } else if (message.chat_id.startsWith('me:')) {
          const targetUserId = message.chat_id.substring(3);
          if (currentUserRef.current && currentUserRef.current.id !== targetUserId) {
            return; // Ignore other users' private self-chats completely
          }
        }

        setMessagesList((prev) => addOrUpdateMessage(prev, message));

        if (message.text) {
          checkAndTriggerIncomingCall(message.text);
        }

        // Trigger notification if not in the current active chat
        triggerPushNotification(message);
      })
      .on('broadcast', { event: 'delete_message' }, (response: any) => {
        const payload = response.payload;
        if (payload && payload.messageId) {
          setMessagesList((prev) => prev.map((m) => m.id === payload.messageId ? { ...m, text: '_vyper_deleted_::', is_voice: false, file_name: undefined, file_url: undefined, file_data: undefined, file_type: undefined } : m));
        }
      })
      .on('broadcast', { event: 'vyper_group_created' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        const { group } = payload;
        if (!group) return;
        setGroups((prev) => {
          if (prev.some((g) => g.id === group.id)) return prev;
          return [...prev, group];
        });
      })
      .on('broadcast', { event: 'vyper_group_updated' }, (response: any) => {
        const payload = response.payload;
        if (!payload) return;
        const { group } = payload;
        if (!group) return;
        setGroups((prev) => prev.map((g) => g.id === group.id ? group : g));
      })
      .subscribe();

    // D. Real-time subscription to the custom `triggered_pushes` table
    let triggeredPushesChannel: any = null;
    if (currentUser) {
      triggeredPushesChannel = supabase
        .channel(`realtime_triggered_pushes:${currentUser.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'triggered_pushes', filter: `user_id=eq.${currentUser.id}` },
          (payload) => {
            const push = payload.new as any;
            if (push) {
              // Construct a mock message to trigger unified notifications engine
              const mockMsg: Message = {
                id: push.id || 'notif_' + Date.now(),
                chat_id: push.type === 'mention' ? 'general' : `dm:system:test`,
                sender_id: '00000000-0000-0000-0000-000000000000', // support/bot
                text: push.body,
                file_name: null,
                file_type: null,
                file_data: null,
                is_voice: false,
                created_at: new Date().toISOString(),
              };
              triggerPushNotification(mockMsg);
            }
          }
        )
        .subscribe();
    }

    chatUpdatesChannelRef.current = chatUpdatesChannel;

    return () => {
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(callsChannel);
      supabase.removeChannel(chatUpdatesChannel);
      if (triggeredPushesChannel) {
        supabase.removeChannel(triggeredPushesChannel);
      }
    };
  }, [currentUser]);

  // Handle setting user online/offline on load or exit
  useEffect(() => {
    if (!currentUser) return;

    // Set online to true immediately when current user mounts/logins
    supabase
      .from('profiles')
      .update({ is_online: true, last_seen: new Date().toISOString() })
      .eq('id', currentUser.id)
      .then(({ error }) => {
        if (error) console.warn('Failed to set online status true on mount:', error);
      });

    // Heartbeat every 30 seconds to keep presence alive and accurate
    const heartbeatInterval = setInterval(() => {
      supabase
        .from('profiles')
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq('id', currentUser.id)
        .then(({ error }) => {
          if (error) console.warn('Failed presence heartbeat update:', error);
        });
    }, 30000);

    const handleBeforeUnload = async () => {
      try {
        if (activeCallRef.current) {
          await supabase
            .from('calls')
            .update({ status: 'ended', updated_at: new Date().toISOString() })
            .eq('id', activeCallRef.current.id);
        }
        await supabase
          .from('profiles')
          .update({ is_online: false, last_seen: new Date().toISOString() })
          .eq('id', currentUser.id);
      } catch (err) {
        console.warn('Error in handleBeforeUnload:', err);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(heartbeatInterval);
      // DO NOT call handleBeforeUnload() here! Doing so will mark the user offline on every state change.
    };
  }, [currentUser?.id]);

  // Fallback Polling for Active Calls to guarantee 100% calling reliability
  useEffect(() => {
    if (!currentUser) return;

    const pollCalls = async () => {
      try {
        // If we already have an active call, don't trigger another ring
        if (activeCallRef.current) return;

        // Fetch any call where the current user is the receiver and the status is ringing, created in the last 45 seconds
        const fortyFiveSecsAgo = new Date(Date.now() - 45000).toISOString();
        const { data, error } = await supabase
          .from('calls')
          .select('*')
          .eq('receiver_id', currentUser.id)
          .eq('status', 'ringing')
          .gt('created_at', fortyFiveSecsAgo)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const call = data[0];
          setActiveCall(call);
        }
      } catch (err) {
        console.error('Error polling active calls:', err);
      }
    };

    const interval = setInterval(pollCalls, 3000);
    pollCalls();

    return () => clearInterval(interval);
  }, [currentUser]);

  // Fallback Polling for Call Status updates (accepted, rejected, ended)
  useEffect(() => {
    if (!currentUser || !activeCall) return;

    // Skip polling if the activeCall.id is a client-side generated fallback ID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activeCall.id);
    if (!isUuid) return;

    const pollCallStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('calls')
          .select('*')
          .eq('id', activeCall.id)
          .single();

        if (!error && data) {
          if (data.status !== activeCallRef.current?.status) {
            setActiveCall(data);
          }
        }
      } catch (err) {
        console.error('Error polling call status:', err);
      }
    };

    const interval = setInterval(pollCallStatus, 3000);
    return () => clearInterval(interval);
  }, [currentUser, activeCall?.id]);

  // Handle Call Initiation (Instant 0ms UI response)
  const handleInitiateCall = (type: 'voice' | 'video') => {
    if (!currentUser) return;
    if (activeCallRef.current || activeCall || isInitiatingCallRef.current) {
      console.warn('Call already active, dialing, or initiating. Ignoring duplicate initiation attempt.');
      return;
    }
    isInitiatingCallRef.current = true;
    
    let receiverId = 'general';
    if (selectedChatId?.startsWith('group:')) {
      receiverId = selectedChatId;
    } else if (selectedChatId === 'general') {
      receiverId = 'general';
    } else if (selectedPeerProfile?.id) {
      receiverId = selectedPeerProfile.id;
    } else if (selectedChatId?.startsWith('dm:')) {
      const parts = selectedChatId.split(':');
      const peerId = parts.find((p) => p !== 'dm' && p !== currentUser.id);
      receiverId = peerId || 'general';
    }

    const isGeneral = receiverId === 'general' || receiverId.startsWith('group:');
    const callId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const callData = {
      id: callId,
      caller_id: currentUser.id,
      receiver_id: receiverId,
      type,
      status: 'ringing' as const,
      signal_data: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // INSTANT UI UPDATE: Open call screen with 0ms tap latency
    setActiveCall(callData);

    // Post system message in chat
    const callerName = currentUser.display_name || currentUser.username || 'Operator';
    const callMetaText = `_vyper_call_::${JSON.stringify({
      callId: callData.id,
      type,
      callerId: currentUser.id,
      callerName,
      receiverId,
      status: 'ringing',
    })}`;

    const msgId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}`;
    const messagePayload = {
      id: msgId,
      chat_id: isGeneral ? 'general' : (selectedChatId || 'general'),
      sender_id: currentUser.id,
      text: callMetaText,
      file_name: null,
      file_type: null,
      file_data: null,
      is_voice: false,
      created_at: new Date().toISOString(),
    };

    setMessagesList((prev) => addOrUpdateMessage(prev, messagePayload));
    sendBroadcastEvent('new_message', { message: messagePayload });

    // Broadcast invitation immediately to bypass replication lag
    sendBroadcastEvent('call_invite', { call: callData });

    // Release initiating lock quickly
    setTimeout(() => {
      isInitiatingCallRef.current = false;
    }, 1200);

    // Persist to database asynchronously in the background
    (async () => {
      try {
        await supabase.from('calls').insert({
          id: callId,
          caller_id: currentUser.id,
          receiver_id: receiverId,
          type,
          status: 'ringing',
        });
      } catch (err) {
        console.warn('Background call database insert handled via fallback:', err);
      }

      try {
        await supabase.from('messages').insert(messagePayload);
      } catch (dbErr) {
        console.warn('Background message insert handled via fallback:', dbErr);
      }
    })();
  };

  // Handle joining a group call
  const handleJoinGroupCall = (callId: string, type: 'voice' | 'video', callerId: string) => {
    const groupCall = {
      id: callId,
      caller_id: callerId,
      receiver_id: 'general',
      type,
      status: 'accepted' as const,
      signal_data: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setActiveCall(groupCall);
    
    // Broadcast join status change immediately so peers know someone joined
    sendBroadcastEvent('call_status_update', {
      callId,
      status: 'accepted',
    });
  };

  // Broadcast Helper
  const sendBroadcastEvent = (event: string, payload: any) => {
    if (chatUpdatesChannelRef.current) {
      chatUpdatesChannelRef.current.send({
        type: 'broadcast',
        event,
        payload,
      });
    }
  };

  // Toggle Message Reaction
  const handleToggleReaction = (messageId: string, emoji: string) => {
    if (!currentUser) return;
    setReactions((prev) => {
      const msgReactions = { ...(prev[messageId] || {}) } as Record<string, string[]>;
      
      let existingEmoji: string | null = null;
      for (const [key, users] of Object.entries(msgReactions)) {
        if (users.includes(currentUser.id)) {
          existingEmoji = key;
          break;
        }
      }

      const updatedMsgReactions = { ...msgReactions };

      if (existingEmoji === emoji) {
        const users = [...(updatedMsgReactions[emoji] || [])];
        const idx = users.indexOf(currentUser.id);
        if (idx >= 0) {
          users.splice(idx, 1);
        }
        if (users.length === 0) {
          delete updatedMsgReactions[emoji];
        } else {
          updatedMsgReactions[emoji] = users;
        }
      } else {
        if (existingEmoji) {
          const users = [...(updatedMsgReactions[existingEmoji] || [])];
          const idx = users.indexOf(currentUser.id);
          if (idx >= 0) {
            users.splice(idx, 1);
          }
          if (users.length === 0) {
            delete updatedMsgReactions[existingEmoji];
          } else {
            updatedMsgReactions[existingEmoji] = users;
          }
        }

        const users = [...(updatedMsgReactions[emoji] || [])];
        if (!users.includes(currentUser.id)) {
          users.push(currentUser.id);
        }
        updatedMsgReactions[emoji] = users;
      }
      
      const updatedAll = { ...prev, [messageId]: updatedMsgReactions };
      
      // Broadcast reaction update in real time
      sendBroadcastEvent('reaction', {
        messageId,
        userId: currentUser.id,
        emoji,
      });
      
      return updatedAll;
    });
  };

  // Toggle Message Pinning status
  const handleTogglePin = (chatId: string, messageId: string) => {
    setPinnedState((prev) => {
      const pins = [...(prev[chatId] || [])];
      const idx = pins.indexOf(messageId);
      if (idx >= 0) {
        pins.splice(idx, 1);
      } else {
        pins.push(messageId);
      }
      const updated = { ...prev, [chatId]: pins };
      try {
        localStorage.setItem('vypervic_pinned_messages_v3', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save pinned messages to localStorage:', e);
      }
      // Broadcast this change to all active peers
      sendBroadcastEvent('pin_change', { chatId, pinnedMessageIds: pins });
      return updated;
    });
  };

  // Periodically prune stale typing indicator states (older than 4 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let changed = false;
      setTypingState((prev) => {
        const next = { ...prev };
        Object.entries(next).forEach(([chatId, users]) => {
          const typedUsers = users as Record<string, { username: string; timestamp: number }>;
          const nextUsers = { ...typedUsers };
          let chatChanged = false;
          Object.entries(nextUsers).forEach(([userId, info]) => {
            const typedInfo = info as { username: string; timestamp: number };
            if (now - typedInfo.timestamp > 4000) {
              delete nextUsers[userId];
              chatChanged = true;
              changed = true;
            }
          });
          if (chatChanged) {
            next[chatId] = nextUsers;
          }
        });
        return changed ? next : prev;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Send read receipt when selecting a chat room or receiving a new message while inside it
  useEffect(() => {
    if (!currentUser || !selectedChatId || messagesList.length === 0) return;

    // Clear unread system/push notifications for this chat room (Requirement 3)
    setNotifications((prev) => prev.filter((n) => n.chatId !== selectedChatId));

    // Find the last message in this room
    const chatMsgs = messagesList.filter((m) => m.chat_id === selectedChatId);
    if (chatMsgs.length === 0) return;

    const lastMsg = chatMsgs[chatMsgs.length - 1];

    // Mark it locally as read in our separate state
    setMyReadReceipts((prev) => ({
      ...prev,
      [selectedChatId]: {
        lastReadMessageId: lastMsg.id,
        timestamp: new Date().toISOString(),
      },
    }));

    // Find the last message in this room sent by other users
    const lastPeerMsg = [...chatMsgs].reverse().find((m) => m.sender_id !== currentUser.id);
    if (!lastPeerMsg) return;

    // Broadcast the read receipt to others in real-time
    sendBroadcastEvent('read_receipt', {
      chatId: selectedChatId,
      readerId: currentUser.id,
      lastReadMessageId: lastPeerMsg.id,
      timestamp: new Date().toISOString(),
    });
  }, [selectedChatId, messagesList.length, currentUser]);

  if (showSplash) {
    return <Splash onComplete={() => setShowSplash(false)} />;
  }

  const generalProfile: Profile = {
    id: 'general',
    email: 'general@vypervic.net',
    username: 'general',
    display_name: 'VyperVic General',
    is_online: true,
    avatar_url: null,
    about: 'VyperVic general broadcast calling room',
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  // Find calling partner profile details with resilient fallback
  const getCallPartnerProfile = () => {
    if (!activeCall) return undefined;
    const partnerId = activeCall.receiver_id === 'general'
      ? (activeCall.caller_id === currentUser?.id ? 'general' : activeCall.caller_id)
      : (activeCall.caller_id === currentUser?.id ? activeCall.receiver_id : activeCall.caller_id);

    if (partnerId === 'general') return generalProfile;

    const found = allProfiles.find((p) => p.id === partnerId);
    if (found) return found;

    // Direct fallback mapping to prevent UI blocking during sync lag
    return {
      id: partnerId,
      username: 'operator_peer',
      display_name: 'Operator Peer',
      email: '',
      is_online: true,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      about: 'Securing satellite link...',
      avatar_url: null,
    } as Profile;
  };

  const activeCallPartnerProfile = getCallPartnerProfile();

  const getUnreadCount = (chatId: string) => {
    if (selectedChatId === chatId && activeScreen === 'chat') return 0;

    const chatMsgs = messagesList.filter((m) => m.chat_id === chatId && m.sender_id !== currentUser?.id);
    if (chatMsgs.length === 0) return 0;

    const receipt = myReadReceipts[chatId];
    const receiptTime = receipt ? new Date(receipt.timestamp).getTime() : 0;
    return chatMsgs.filter((m) => {
      const msgTime = new Date(m.created_at).getTime();
      if (receipt) {
        return msgTime > receiptTime && m.id !== receipt.lastReadMessageId;
      } else {
        return msgTime > sessionStartRef.current;
      }
    }).length;
  };

  return (
    <div className="w-full h-full min-h-[100dvh] h-[100dvh] max-h-[100dvh] flex items-center justify-center bg-[#05070a] overflow-hidden overflow-x-hidden select-none relative">
      <div className="phone relative w-full max-w-lg md:max-w-xl h-full h-[100dvh] max-h-[100dvh] bg-[#080b10] sm:border-x sm:border-[#1e2634] shadow-2xl overflow-hidden flex flex-col mx-auto">
      {/* iOS Dynamic Island Component (ONLY visible when a new incoming notification arrives) */}
      {headsUpNotification && (
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center pointer-events-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key="expanded-island-notification"
              initial={{ width: 112, height: 24, borderRadius: 24, opacity: 0.8, scale: 0.9 }}
              animate={{ width: 'calc(100% - 24px)', maxWidth: 380, height: 'auto', borderRadius: 32, opacity: 1, scale: 1 }}
              exit={{ width: 112, height: 24, borderRadius: 24, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className="bg-black/95 backdrop-blur-2xl border border-white/20 text-white shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden p-3.5 flex flex-col gap-2.5 select-none w-[calc(100vw-32px)] max-w-[380px]"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div 
                  className="flex items-center gap-3 flex-1 cursor-pointer min-w-0"
                  onClick={() => selectChatFromNotification(headsUpNotification.chatId)}
                >
                  {/* Sender Avatar / Icon */}
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#20e3a2] to-[#7c5cff] flex items-center justify-center text-white text-xs font-black shadow-lg">
                      {headsUpNotification.senderName.substring(0, 1).toUpperCase()}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-black flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#20e3a2] animate-ping" />
                    </div>
                  </div>

                  {/* Notification Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display font-extrabold text-[13px] text-white truncate max-w-[150px]">
                        {headsUpNotification.senderName}
                      </span>
                      <span className="text-[9px] font-bold text-[#20e3a2] bg-[#20e3a2]/15 px-2 py-0.5 rounded-full uppercase shrink-0">
                        now
                      </span>
                    </div>
                    <p className="text-[11.5px] text-[#a0a8b8] truncate mt-0.5 font-medium leading-snug">
                      {headsUpNotification.body}
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <button
                    onClick={() => setShowHeadsUpReply(!showHeadsUpReply)}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[#20e3a2] transition-colors cursor-pointer"
                    title="Quick Reply"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => setHeadsUpNotification(null)}
                    className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[#8d97ab] hover:text-white transition-colors cursor-pointer"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quick Reply Form inside Dynamic Island */}
              {showHeadsUpReply && (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!headsUpReplyText.trim()) return;
                    handleReplyFromNotification(headsUpNotification.id, headsUpReplyText);
                  }}
                  className="flex items-center gap-2 bg-[#121822] border border-white/15 rounded-2xl px-3 py-1.5 animate-fade-in mt-0.5"
                >
                  <input 
                    type="text"
                    placeholder="Reply from Dynamic Island..."
                    value={headsUpReplyText}
                    onChange={(e) => setHeadsUpReplyText(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-[12px] text-white placeholder-[#5a6478] py-1 font-medium"
                    autoFocus
                  />
                  <button 
                    type="submit"
                    className="p-1.5 rounded-xl bg-[#20e3a2] text-black font-bold cursor-pointer hover:bg-[#20e3a2]/90 shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Sleek, Realistic Smartphone Status Bar */}
      <div 
        className="absolute top-0 left-0 right-0 h-12 bg-transparent flex items-center justify-center select-none z-50 pointer-events-none"
      >
      </div>

      {/* Slide-down Notification Center Drawer */}
      <AnimatePresence>
        {showNotificationCenter && (
          <motion.div 
            initial={{ y: '-100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '-100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 180 }}
            className="absolute inset-0 bg-[#030509]/85 backdrop-blur-[12px] z-[550] flex flex-col"
          >
            <div className="pt-12 px-5 pb-4 flex items-center justify-between border-b border-[#212a38] bg-[#0c1017]/95 sticky top-0">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-display font-black text-[15px] text-white tracking-wide">NOTIFICATION CENTER</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#20e3a2] animate-pulse" />
                </div>
                <p className="text-[10px] text-[#5a6478] font-medium mt-0.5">
                  Keep track of direct messages, system alerts, and mentions.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {getUnifiedFeed().length > 0 && (
                  <button 
                    onClick={() => {
                      const ids = getUnifiedFeed().map((item) => item.id);
                      setDismissedFeedItemIds((prev) => [...prev, ...ids]);
                      setNotifications([]);
                      showToast('Cleared');
                    }}
                    className="text-[11px] font-extrabold text-[#ff5470] bg-[#ff5470]/10 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-[#ff5470]/20"
                  >
                    Clear All
                  </button>
                )}
                <button 
                  onClick={() => setShowNotificationCenter(false)}
                  className="w-8 h-8 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center text-white cursor-pointer active:bg-[#1d2531]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {/* System Push Delivery Card */}
              <div className="bg-[#161d28]/90 border border-[#212a38] rounded-2xl p-4 flex flex-col gap-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#7c5cff]/10 flex items-center justify-center text-[#7c5cff]">
                      <Sparkles className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h4 className="text-[13px] font-bold text-white leading-tight">System Push Delivery</h4>
                      <p className="text-[11px] text-[#8d97ab] mt-0.5">
                        {notifPermission === 'granted' ? 'Active & Reliable' : 'Requires browser permissions'}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    notifPermission === 'granted' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                  }`}>
                    {notifPermission === 'granted' ? 'ACTIVE' : 'OFF'}
                  </span>
                </div>
                {notifPermission !== 'granted' && (
                  <button
                    onClick={handleRequestPermission}
                    className="w-full bg-gradient-to-r from-[#20e3a2] to-[#7c5cff] py-2.5 rounded-xl text-xs font-bold text-black cursor-pointer shadow-md hover:opacity-90"
                  >
                    Enable Background Alerts
                  </button>
                )}
              </div>

              {/* Dynamic Notifications Map */}
              {getUnifiedFeed().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#161d28] flex items-center justify-center text-[#5a6478] mb-3">
                    <Bell className="w-5 h-5 text-[#20e3a2]" />
                  </div>
                  <span className="text-[13px] font-bold text-[#8d97ab]">Inbox is pristine</span>
                  <p className="text-[11px] text-[#5a6478] max-w-[200px] mt-1 leading-normal">
                    New alerts, mentions, and private messages will be captured here in real-time.
                  </p>
                </div>
              ) : (
                getUnifiedFeed().map((notif) => (
                  <NotificationCard 
                    key={notif.id}
                    notification={notif}
                    allProfiles={allProfiles}
                    onSelect={selectChatFromNotification}
                    onReply={handleReplyFromNotification}
                    onDismiss={(id) => {
                      setDismissedFeedItemIds((prev) => [...prev, id]);
                      setNotifications((prev) => prev.filter((n) => n.id !== id));
                    }}
                  />
                ))
              )}
            </div>

            <div 
              onClick={() => setShowNotificationCenter(false)}
              className="bg-[#0c1017] py-3.5 flex flex-col items-center justify-center border-t border-[#212a38] cursor-pointer hover:bg-white/5"
            >
              <div className="w-12 h-1.5 bg-[#212a38] rounded-full" />
              <span className="text-[9px] font-bold tracking-widest text-[#5a6478] uppercase mt-1.5">Close Drawer</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Primary Screen Container */}
      <div className="screen-stack w-full h-full transform-gpu [will-change:transform] [backface-visibility:hidden]" style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}>
        {!currentUser ? (
          <div className="w-full h-full transform-gpu [will-change:transform] [backface-visibility:hidden]" style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}>
            <AuthScreen onAuthComplete={(profile) => setCurrentUser(profile)} />
          </div>
        ) : (
          <>
            {/* Global Persistent Audio Player Banner across screens */}
            <GlobalAudioBanner
              currentActiveScreen={activeScreen}
              currentChatId={selectedChatId}
              onNavigateToChat={(targetChatId) => {
                const targetPeer = allProfiles.find((p) => {
                  const sortedIds = [currentUser.id, p.id].sort();
                  return `dm:${sortedIds[0]}:${sortedIds[1]}` === targetChatId;
                });
                setSelectedChatId(targetChatId);
                if (targetPeer) {
                  setSelectedPeerProfile(targetPeer);
                }
                setActiveScreen('chat');
              }}
            />

            {/* Navigational Screens with GPU Acceleration */}
            {activeScreen === 'chatList' && (
              <div className="w-full h-full transform-gpu [will-change:transform] [backface-visibility:hidden]" style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}>
                <ChatListScreen
                  currentUser={currentUser}
                  isOffline={isOffline}
                  onSelectChat={(chatId, peer, targetMessageId) => {
                    setSelectedChatId(chatId);
                    setSelectedPeerProfile(peer);
                    setSelectedTargetMsgId(targetMessageId || null);
                    setActiveScreen('chat');
                  }}
                  onOpenSettings={() => setActiveScreen('settings')}
                  onOpenSearch={() => setActiveScreen('search')}
                  onOpenNotifications={() => setShowNotificationCenter(true)}
                  allProfiles={allProfiles}
                  messagesList={messagesList}
                  readReceipts={readReceipts}
                  getUnreadCount={getUnreadCount}
                  unreadNotificationsCount={getUnifiedFeed().length}
                  groups={groups}
                  groupCallStatuses={groupCallStatuses}
                  onViewProfileDetail={(type, data) => setActiveProfileView({ type, data })}
                />
              </div>
            )}

            {activeScreen === 'chat' && selectedChatId && (
              <div className="w-full h-full transform-gpu [will-change:transform] [backface-visibility:hidden]" style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}>
                <ChatScreen
                  chatId={selectedChatId}
                  peerProfile={selectedPeerProfile}
                  currentUser={currentUser}
                  targetMessageId={selectedTargetMsgId}
                  onBack={() => {
                    setSelectedChatId(null);
                    setSelectedPeerProfile(undefined);
                    setSelectedTargetMsgId(null);
                    setActiveScreen('chatList');
                  }}
                  onCall={handleInitiateCall}
                  onJoinGroupCall={handleJoinGroupCall}
                  groupCallStatuses={groupCallStatuses}
                  messagesList={messagesList}
                  allProfiles={allProfiles}
                  callHistory={callHistory}
                  typingUsers={typingState[selectedChatId] || {}}
                  readReceipts={readReceipts}
                  reactions={reactions}
                  onToggleReaction={handleToggleReaction}
                  sendBroadcastEvent={sendBroadcastEvent}
                  pinnedMessageIds={pinnedState[selectedChatId] || []}
                  onTogglePin={(msgId) => handleTogglePin(selectedChatId, msgId)}
                  onSelectChat={(chatId, peer, targetMessageId) => {
                    setSelectedChatId(chatId);
                    setSelectedPeerProfile(peer);
                    setSelectedTargetMsgId(targetMessageId || null);
                    setActiveScreen('chat');
                  }}
                  onSendMessage={(msg) => {
                    setMessagesList((prev) => addOrUpdateMessage(prev, msg));
                  }}
                  groups={groups}
                  chatTheme={chatThemes[selectedChatId]}
                  onUpdateChatTheme={(cid, theme) => {
                    setChatThemes((prev) => ({ ...prev, [cid]: theme }));
                  }}
                  onUpdateGroup={(updatedGrp) => {
                    setGroups((prev) => prev.map((g) => g.id === updatedGrp.id ? updatedGrp : g));
                  }}
                  onDisbandGroup={(groupId) => {
                    setGroups((prev) => prev.filter((g) => g.id !== groupId));
                    setSelectedChatId(null);
                    setSelectedPeerProfile(undefined);
                    setActiveScreen('chatList');
                  }}
                  onViewProfileDetail={(type, data) => setActiveProfileView({ type, data })}
                />
              </div>
            )}

            {activeScreen === 'search' && (
              <div className="w-full h-full transform-gpu [will-change:transform] [backface-visibility:hidden]" style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}>
                <SearchScreen
                  currentUser={currentUser}
                  onCancel={() => setActiveScreen('chatList')}
                  allProfiles={allProfiles}
                  existingContactIds={existingContactIds}
                  onSelectUser={(peer) => {
                    setActiveProfileView({ type: 'user', data: peer });
                  }}
                  onCreateGroup={(name, icon, memberIds) => {
                    const newGroup: Group = {
                      id: `group:${Date.now()}`,
                      name,
                      icon,
                      creator_id: currentUser.id,
                      members: [currentUser.id, ...memberIds],
                      created_at: new Date().toISOString()
                    };
                    setGroups((prev) => [...prev, newGroup]);
                    
                    // Broadcast group creation to other users
                    sendBroadcastEvent('vyper_group_created', { group: newGroup });

                    // Automatically select the new group
                    setSelectedChatId(newGroup.id);
                    setSelectedPeerProfile(undefined);
                    setActiveScreen('chat');

                    // Inject welcome message
                    const welcomeMsg: Message = {
                      id: `msg_grp_welcome_${Date.now()}`,
                      chat_id: newGroup.id,
                      sender_id: currentUser.id,
                      text: `🔒 System Update: Secure group channel "${name}" has been established by Admin. End-to-end multi-party encryption initialized.`,
                      file_name: null,
                      file_type: null,
                      file_data: null,
                      is_voice: false,
                      created_at: new Date().toISOString()
                    };
                    setMessagesList((prev) => addOrUpdateMessage(prev, welcomeMsg));
                  }}
                />
              </div>
            )}

            {activeScreen === 'calls' && (
              <div className="w-full h-full transform-gpu [will-change:transform] [backface-visibility:hidden]" style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}>
                <CallsScreen
                  currentUser={currentUser}
                  allProfiles={allProfiles}
                  callHistory={callHistory}
                  onInitiateCall={handleInitiateCall}
                  onViewProfileDetail={(type, data) => setActiveProfileView({ type, data })}
                />
              </div>
            )}

            {activeScreen === 'settings' && (
              <div className="w-full h-full transform-gpu [will-change:transform] [backface-visibility:hidden]" style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}>
                <SettingsScreen
                  currentUser={currentUser}
                  allProfiles={allProfiles}
                  appTheme={appTheme}
                  onUpdateAppTheme={setAppTheme}
                  onBack={() => setActiveScreen('chatList')}
                  onLogout={async () => {
                    try {
                      await supabase
                        .from('profiles')
                        .update({ is_online: false, last_seen: new Date().toISOString() })
                        .eq('id', currentUser.id);
                    } catch (e) {
                      console.warn('Failed to update online status on logout:', e);
                    }
                    try {
                      await supabase.auth.signOut();
                    } catch (e) {
                      console.warn('Failed to sign out of Supabase:', e);
                    }
                    // Reset states
                    setMessagesList([]);
                    setAllProfiles([]);
                    setActiveCall(null);
                    setGroupCallStatuses({});
                    setCallHistory([]);
                    setNotifications([]);
                    setSelectedChatId(null);
                    setSelectedPeerProfile(undefined);
                    setActiveScreen('chatList');
                    
                    // Clear specific localStorage entries
                    Object.keys(localStorage).forEach((key) => {
                      if (
                        (key.startsWith('vypervic_') && key !== 'vypervic_app_theme') ||
                        key.startsWith('vyper_') ||
                        key.includes('supabase') ||
                        key.startsWith('sb-')
                      ) {
                        localStorage.removeItem(key);
                      }
                    });
                    setCurrentUser(null);
                  }}
                  onUpdateProfile={(updated) => setCurrentUser(updated)}
                  onToast={showToast}
                />
              </div>
            )}

            {/* Floating Pill Navigation Bar (Liquid Glass or Neumorphism based on theme) */}
            {(activeScreen === 'chatList' || activeScreen === 'calls' || activeScreen === 'search') && !activeProfileView && !showNotificationCenter && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-sm">
                {(() => {
                  const isLiquidGlassTheme = appTheme === 'liquid-glass' || appTheme === 'light-liquid-glass';
                  const isLight = appTheme.startsWith('light');

                  const containerClass = isLiquidGlassTheme
                    ? isLight
                      ? 'bg-white/75 backdrop-blur-3xl border border-white/80 shadow-[0_16px_40px_rgba(0,0,0,0.12),inset_0_1.5px_2px_rgba(255,255,255,0.95)]'
                      : 'bg-slate-950/60 backdrop-blur-3xl border border-white/20 shadow-[0_16px_48px_rgba(0,0,0,0.6),inset_0_1.5px_2px_rgba(255,255,255,0.35)]'
                    : isLight
                      ? 'bg-[#e6ecf5] border border-white/80 shadow-[8px_8px_20px_rgba(163,177,198,0.7),-6px_-6px_16px_rgba(255,255,255,0.95)]'
                      : 'bg-[#121824] border border-white/10 shadow-[8px_8px_22px_rgba(0,0,0,0.75),-6px_-6px_16px_rgba(255,255,255,0.05)]';

                  const getButtonClass = (screen: 'chatList' | 'calls' | 'search' | 'settings') => {
                    const isActive = activeScreen === screen;
                    if (isLiquidGlassTheme) {
                      if (isActive) {
                        return isLight
                          ? 'bg-white/90 backdrop-blur-2xl border border-white/90 text-[#007aff] shadow-[inset_0_1px_1.5px_rgba(255,255,255,1),0_4px_16px_rgba(0,122,255,0.2)] scale-105'
                          : 'bg-gradient-to-r from-white/30 to-white/10 backdrop-blur-2xl border border-white/40 text-white shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.6),0_4px_20px_rgba(255,255,255,0.2)] scale-105';
                      }
                      return isLight
                        ? 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                        : 'text-white/60 hover:text-white hover:bg-white/5';
                    } else {
                      // Neumorphism style for all other themes
                      if (isActive) {
                        return isLight
                          ? 'bg-[#d8e0ed] border border-white/60 text-[#007aff] shadow-[inset_3px_3px_6px_rgba(163,177,198,0.8),inset_-3px_-3px_6px_rgba(255,255,255,0.95)] scale-105 font-black'
                          : 'bg-[#0c1018] border border-white/5 text-[#20e3a2] shadow-[inset_3px_3px_6px_rgba(0,0,0,0.85),inset_-2px_-2px_5px_rgba(255,255,255,0.08)] scale-105 font-black';
                      }
                      return isLight
                        ? 'text-slate-500 hover:text-slate-800 hover:bg-white/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5';
                    }
                  };

                  return (
                    <div className={`flex items-center justify-around px-2 py-1.5 rounded-full ${containerClass}`}>
                      {/* Chats */}
                      <button
                        type="button"
                        onClick={() => setActiveScreen('chatList')}
                        className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full text-[11px] font-extrabold transition-all cursor-pointer select-none ${getButtonClass('chatList')}`}
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span className="text-[10px] mt-0.5">Chats</span>
                      </button>

                      {/* Calls */}
                      <button
                        type="button"
                        onClick={() => setActiveScreen('calls')}
                        className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full text-[11px] font-extrabold transition-all cursor-pointer select-none ${getButtonClass('calls')}`}
                      >
                        <Phone className="w-4 h-4" />
                        <span className="text-[10px] mt-0.5">Calls</span>
                      </button>

                      {/* People */}
                      <button
                        type="button"
                        onClick={() => setActiveScreen('search')}
                        className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full text-[11px] font-extrabold transition-all cursor-pointer select-none ${getButtonClass('search')}`}
                      >
                        <Users className="w-4 h-4" />
                        <span className="text-[10px] mt-0.5">People</span>
                      </button>

                      {/* Settings */}
                      <button
                        type="button"
                        onClick={() => setActiveScreen('settings')}
                        className={`flex flex-col items-center justify-center px-4 py-1.5 rounded-full text-[11px] font-extrabold transition-all cursor-pointer select-none ${getButtonClass('settings')}`}
                      >
                        <Settings className="w-4 h-4" />
                        <span className="text-[10px] mt-0.5">Settings</span>
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Full-Screen Profile details */}
            {activeProfileView && (
              <FullscreenProfile
                type={activeProfileView.type}
                data={activeProfileView.data}
                onClose={() => setActiveProfileView(null)}
                currentUser={currentUser}
                allProfiles={allProfiles}
                onStartDM={(peer) => {
                  const sortedIds = [currentUser.id, peer.id].sort();
                  const dmId = `dm:${sortedIds[0]}:${sortedIds[1]}`;
                  setSelectedChatId(dmId);
                  setSelectedPeerProfile(peer);
                  setActiveProfileView(null);
                  setActiveScreen('chat');
                }}
                onCall={(type, peerId) => {
                  const peer = allProfiles.find((p) => p.id === peerId);
                  if (peer) {
                    setSelectedPeerProfile(peer);
                    const sortedIds = [currentUser.id, peer.id].sort();
                    const dmId = `dm:${sortedIds[0]}:${sortedIds[1]}`;
                    setSelectedChatId(dmId);
                    setActiveProfileView(null);
                    handleInitiateCall(type);
                  }
                }}
              />
            )}

            {/* Real-Time Signaling Calling Interface Overlay */}
            {activeCall && activeCallPartnerProfile && (
              <CallOverlay
                currentCall={activeCall}
                currentUser={currentUser}
                peerProfile={activeCallPartnerProfile}
                sendBroadcastEvent={sendBroadcastEvent}
                allProfiles={allProfiles}
                onUpdateCallStatus={(status) => {
                  setGroupCallStatuses((prev) => ({ ...prev, [activeCall.id]: status }));
                  setActiveCall((prev) => prev ? { ...prev, status } : null);
                }}
                onClose={(statusMessage) => {
                  setActiveCall(null);
                  if (statusMessage) {
                    showToast(statusMessage);
                  }
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Global Action Toasts */}
      {toastMessage && (
        <div className="toast show fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#161d28]/95 border border-[#20e3a2]/40 text-[#eef1f6] px-3.5 py-1.5 rounded-full text-xs font-bold shadow-2xl backdrop-blur-md z-[9999] whitespace-nowrap animate-fade-in flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#20e3a2]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  </div>
);
}

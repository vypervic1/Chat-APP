import { useState, FormEvent } from 'react';
import { Profile, PushNotification } from '../types';
import { X, Send, Loader2 } from 'lucide-react';

interface NotificationCardProps {
  key?: any;
  notification: PushNotification;
  allProfiles: Profile[];
  onSelect: (chatId: string) => void;
  onReply: (id: string, text: string) => Promise<void> | void;
  onDismiss: (id: string) => void;
}

export default function NotificationCard({
  notification,
  allProfiles,
  onSelect,
  onReply,
  onDismiss,
}: NotificationCardProps) {
  const [replyText, setReplyText] = useState('');
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSendReply = async (e: FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || sending) return;

    setSending(true);
    try {
      await onReply(notification.id, replyText);
      setReplyText('');
      setShowReplyInput(false);
    } catch (err) {
      console.error('Error sending inline notification reply:', err);
    } finally {
      setSending(false);
    }
  };

  const sender = allProfiles.find((p) => p.id === notification.senderId);
  
  // Seed avatars palette matching existing app style
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

  const seed = sender?.username?.charCodeAt(0) || 0;
  const initials = (sender?.display_name || sender?.username || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const formatNotifTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="bg-[#121824] border border-[#212a38] rounded-2xl p-3.5 shadow-lg flex flex-col gap-3 transition-all duration-200">
      {/* Header Info */}
      <div className="flex items-start justify-between">
        <div 
          className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
          onClick={() => onSelect(notification.chatId)}
        >
          {/* Avatar icon with active app indicator */}
          <div className="relative shrink-0">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-black shadow-md"
              style={{
                background: sender?.avatar_url ? 'none' : getAvatarStyle(seed),
              }}
            >
              {sender?.avatar_url ? (
                <img 
                  src={sender.avatar_url} 
                  alt="sender" 
                  className="w-full h-full rounded-full object-cover" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                initials
              )}
            </div>
            {/* Active app notification indicator */}
            <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 bg-[#080b10] border-2 border-[#121824] rounded-full flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-[#20e3a2] shadow-[0_0_4px_#20e3a2]" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-display font-extrabold text-[13px] text-white truncate max-w-[120px]">
                {notification.senderName}
              </span>
              <span className="text-[10px] text-[#8d97ab] bg-[#1d2531] px-1.5 py-0.5 rounded-md font-medium truncate max-w-[100px]">
                {notification.title}
              </span>
              {notification.isMention && (
                <span className="bg-[#ff5470]/10 text-[#ff5470] text-[9px] font-extrabold tracking-widest px-1.5 py-0.5 rounded uppercase shrink-0">
                  Mention
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#8d97ab] line-clamp-2 mt-1 leading-relaxed">
              {notification.body}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-[10px] text-[#5a6478] font-mono font-bold whitespace-nowrap">
            {formatNotifTime(notification.timestamp)}
          </span>
          <button 
            onClick={() => onDismiss(notification.id)}
            className="w-6 h-6 rounded-full flex items-center justify-center text-[#5a6478] hover:text-white cursor-pointer hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Button controls */}
      <div className="flex items-center gap-2 border-t border-[#212a38]/40 pt-2.5">
        <button 
          onClick={() => onSelect(notification.chatId)}
          className="flex-1 text-center bg-[#1d2531]/70 hover:bg-[#1d2531] py-2 rounded-xl text-xs font-bold text-white transition-colors cursor-pointer"
        >
          Open Chat
        </button>
        <button 
          onClick={() => setShowReplyInput(!showReplyInput)}
          className={`flex-1 text-center py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            showReplyInput 
              ? 'bg-[#5a6478]/10 text-[#8d97ab] hover:bg-[#5a6478]/15'
              : 'bg-[#20e3a2]/10 text-[#20e3a2] hover:bg-[#20e3a2]/15'
          }`}
        >
          {showReplyInput ? 'Cancel Reply' : 'Quick Reply'}
        </button>
      </div>

      {/* Reply input field drawer */}
      {showReplyInput && (
        <form onSubmit={handleSendReply} className="flex items-center gap-2 bg-[#090d13] border border-[#212a38] rounded-xl px-2.5 py-1.5 mt-1 animate-fade-in">
          <input 
            type="text"
            placeholder={`Reply to ${notification.senderName}...`}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            disabled={sending}
            className="flex-1 bg-transparent border-none outline-none text-xs text-white placeholder-[#5a6478] py-1"
            autoFocus
          />
          <button 
            type="submit"
            disabled={!replyText.trim() || sending}
            className="p-1.5 rounded-lg bg-[#20e3a2]/20 text-[#20e3a2] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#20e3a2]/30 cursor-pointer transition-all shrink-0"
          >
            {sending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </form>
      )}
    </div>
  );
}

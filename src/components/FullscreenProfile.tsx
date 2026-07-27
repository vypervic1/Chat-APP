import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Shield, 
  User, 
  Mail, 
  Info, 
  Hash, 
  Users, 
  Circle, 
  Phone, 
  Video, 
  MessageSquare, 
  Calendar, 
  Lock, 
  Sparkles,
  X 
} from 'lucide-react';
import { Profile, Group } from '../types';
import { isUserOnline, formatLastSeen, parseProfileAbout } from '../utils/customNames';

interface FullscreenProfileProps {
  type: 'user' | 'group' | 'general';
  data?: any; // Profile, Group, or undefined (for general)
  currentUser: Profile;
  allProfiles: Profile[];
  onClose: () => void;
  onStartDM?: (peer: Profile) => void;
  onCall?: (type: 'voice' | 'video', peerId: string) => void;
}

export default function FullscreenProfile({
  type,
  data,
  currentUser,
  allProfiles,
  onClose,
  onStartDM,
  onCall
}: FullscreenProfileProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showZoomedAvatar, setShowZoomedAvatar] = useState(false);
  const [showZoomedCover, setShowZoomedCover] = useState(false);

  // Determine which layout to show
  const isGeneral = type === 'general';
  const isGroup = type === 'group';
  const isUser = type === 'user';

  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [customDisplayName, setCustomDisplayName] = useState(() => {
    if (isUser && data) {
      const saved = localStorage.getItem('vyper_custom_display_names');
      if (saved) {
        try {
          const map = JSON.parse(saved);
          return map[data.id] || '';
        } catch (e) {
          console.error(e);
        }
      }
    }
    return '';
  });

  const handleSaveCustomDisplayName = () => {
    if (!data) return;
    const saved = localStorage.getItem('vyper_custom_display_names') || '{}';
    try {
      const map = JSON.parse(saved);
      if (customDisplayName.trim()) {
        map[data.id] = customDisplayName.trim();
      } else {
        delete map[data.id];
      }
      localStorage.setItem('vyper_custom_display_names', JSON.stringify(map));
      setIsEditingDisplayName(false);
      window.dispatchEvent(new Event('vyper_custom_names_updated'));
    } catch (e) {
      console.error(e);
    }
  };

  // Helpers
  const getAvatarStyle = (seed: number) => {
    const gradients = [
      'linear-gradient(135deg, #20e3a2 0%, #007adf 100%)',
      'linear-gradient(135deg, #7c5cff 0%, #ff4b91 100%)',
      'linear-gradient(135deg, #ff9233 0%, #ea00d9 100%)',
      'linear-gradient(135deg, #20e3a2 0%, #7c5cff 100%)',
      'linear-gradient(135deg, #007adf 0%, #7c5cff 100%)',
    ];
    return gradients[seed % gradients.length];
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  // Extract profiles of community members
  let communityMembers: Profile[] = [];
  let title = '';
  let subTitle = '';
  let bioText = '';
  let badgeText = '';
  let badgeStyle = '';
  let iconContent: React.ReactNode = null;
  let bgStyle: React.CSSProperties = {};
  let parsedAbout: { thinking: string | null; coverUrl: string | null; about: string } | null = null;

  const handleMemberClick = (member: Profile) => {
    if (member.id === currentUser.id) return;
    if (onStartDM) {
      onStartDM(member);
    }
  };

  if (isGeneral) {
    title = 'VyperVic General Chat';
    subTitle = '#general';
    bioText = 'The primary communications channel for all VyperVic operators worldwide. Access is guaranteed for all registered and verified profiles.';
    badgeText = 'Public Chat Room';
    badgeStyle = 'bg-emerald-500/10 text-[#20e3a2] border-emerald-500/20';
    communityMembers = allProfiles;
    iconContent = (
      <svg width="60" height="60" viewBox="0 0 150 150" fill="none">
        <defs>
          <linearGradient id="profileLogoGrad" x1="0" y1="0" x2="150" y2="150" gradientUnits="userSpaceOnUse">
            <stop stopColor="#20e3a2" />
            <stop offset="1" stopColor="#7c5cff" />
          </linearGradient>
        </defs>
        <path
          d="M30 40 C30 20, 60 15, 75 35 C95 60, 60 65, 55 80 C50 95, 85 100, 90 75 C93 60, 75 55, 70 65 C65 75, 80 85, 100 78 C118 71, 118 45, 100 35 C85 27, 75 45, 85 55"
          stroke="url(#profileLogoGrad)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  } else if (isGroup && data) {
    const group = data as Group;
    title = group.name;
    subTitle = `Group ID: ${group.id.replace('group:', '')}`;
    bioText = group.description || 'Custom operator group channel created to synchronize tasks.';
    badgeText = 'Group Chat';
    badgeStyle = 'bg-[#7c5cff]/10 text-[#7c5cff] border-[#7c5cff]/20';
    
    // Resolve members and sort with creator/admins first
    const memberIds = group.members || [];
    const resolvedMembers = allProfiles.filter(p => memberIds.includes(p.id));
    resolvedMembers.sort((a, b) => {
      const isACreator = group.creator_id === a.id;
      const isBCreator = group.creator_id === b.id;
      if (isACreator) return -1;
      if (isBCreator) return 1;
      const isAAdmin = (group.admins || []).includes(a.id);
      const isBAdmin = (group.admins || []).includes(b.id);
      if (isAAdmin && !isBAdmin) return -1;
      if (!isAAdmin && isBAdmin) return 1;
      return 0;
    });
    communityMembers = resolvedMembers;

    if (group.icon && (group.icon.startsWith('data:image/') || group.icon.startsWith('http'))) {
      iconContent = (
        <img 
          src={group.icon} 
          alt="" 
          className="w-full h-full object-cover rounded-full" 
        />
      );
    } else {
      iconContent = <span className="text-3xl font-black">{group.icon || '👥'}</span>;
    }
  } else if (isUser && data) {
    const profile = data as Profile;
    title = profile.display_name || profile.username || 'Operator';
    subTitle = `@${profile.username || 'unknown'}`;
    parsedAbout = parseProfileAbout(profile.about);
    bioText = parsedAbout.about || 'No operator bio provided. Communication route is active.';
    badgeText = formatLastSeen(profile);
    badgeStyle = isUserOnline(profile) 
      ? 'bg-emerald-500/10 text-[#20e3a2] border-emerald-500/20' 
      : 'bg-white/5 text-[#8d97ab] border-white/5';
    
    const seed = profile.username?.charCodeAt(0) || 0;
    bgStyle = {
      background: profile.avatar_url ? 'none' : getAvatarStyle(seed),
    };

    if (profile.avatar_url) {
      iconContent = (
        <img 
          src={profile.avatar_url} 
          alt="" 
          className="w-full h-full object-cover rounded-full" 
          referrerPolicy="no-referrer"
        />
      );
    } else {
      iconContent = getInitials(title);
    }
  }

  // Filter members list based on search query
  const filteredMembers = communityMembers.filter(member => {
    const nameMatch = (member.display_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    const userMatch = (member.username || '').toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || userMatch;
  });

  const coverUrl = isGroup ? (data as Group)?.cover_url : parsedAbout?.coverUrl;

  return (
    <div className="fixed inset-0 bg-[#080b10] z-50 flex flex-col md:flex-row animate-fade-in text-left overflow-hidden">
      {/* Back button and screen header */}
      <div className="absolute top-[calc(var(--safe-top)+12px)] left-4 z-50">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-white hover:text-[#20e3a2] cursor-pointer hover:bg-white/10 transition-all shadow-lg backdrop-blur-md"
          title="Back to portal"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* LEFT COLUMN: Main profile details card */}
      <div className={`w-full ${isUser ? 'max-w-xl mx-auto border-x border-[#212a38]' : 'md:w-[360px] shrink-0 border-b md:border-b-0 md:border-r border-[#212a38]'} flex flex-col relative overflow-y-auto`}>
        {/* Profile Header Image/Gradient Background */}
        <div className={`${isGroup ? 'h-32' : 'h-40'} relative flex items-end justify-center overflow-hidden bg-gradient-to-r from-[#7c5cff]/20 to-[#20e3a2]/20`}>
          {coverUrl ? (
            <img
              src={coverUrl}
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => setShowZoomedCover(true)}
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#080b10]/40 to-[#080b10]" />
          
          {/* Badge at top right */}
          <span className={`absolute top-[calc(var(--safe-top)+12px)] right-4 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${badgeStyle} backdrop-blur-sm shadow-md whitespace-nowrap truncate max-w-[200px]`}>
            {badgeText}
          </span>
        </div>

        {/* Profile Content Container */}
        <div className="px-5 relative -mt-10 pb-4">
          {/* Profile Big Avatar (Tapping here opens full screen) */}
          <div className="flex justify-center md:justify-start mb-2">
            <div 
              onClick={() => setShowZoomedAvatar(true)}
              className={`${isGroup ? 'w-16 h-16 text-2xl' : 'w-20 h-20 text-3xl'} rounded-full border-4 border-[#080b10] flex items-center justify-center text-white font-black shadow-2xl relative overflow-hidden bg-[#161d28] cursor-pointer hover:scale-105 active:scale-95 transition-transform`}
              style={bgStyle}
              title="View in Full Screen"
            >
              {iconContent}
            </div>
          </div>

          {/* Texts */}
          <div className="text-center md:text-left">
            {isUser && data && data.id !== currentUser.id ? (
              <div className="flex flex-col gap-1">
                {isEditingDisplayName ? (
                  <div className="flex items-center gap-2 mt-1 justify-center md:justify-start">
                    <input
                      type="text"
                      className="bg-[#161d28] border border-[#212a38] text-white text-sm font-semibold rounded-lg px-2.5 py-1.5 outline-none focus:border-[#20e3a2] max-w-[180px]"
                      placeholder="Edit display name..."
                      value={customDisplayName}
                      onChange={(e) => setCustomDisplayName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCustomDisplayName();
                        else if (e.key === 'Escape') setIsEditingDisplayName(false);
                      }}
                      autoFocus
                    />
                    <button
                      onClick={handleSaveCustomDisplayName}
                      className="px-2 py-1.5 bg-[#20e3a2] text-black text-xs font-bold rounded-lg hover:opacity-90 cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditingDisplayName(false)}
                      className="px-2 py-1.5 bg-white/10 text-white text-xs font-bold rounded-lg hover:bg-white/15 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                    <h1 className="text-lg font-display font-black text-white tracking-wide flex items-center gap-2">
                      <span>{customDisplayName ? `${customDisplayName} (${data.display_name || data.username})` : title}</span>
                      {isUserOnline(data) && (
                        <span className="w-2 h-2 rounded-full bg-[#20e3a2] animate-pulse shrink-0" />
                      )}
                    </h1>
                    <button
                      onClick={() => setIsEditingDisplayName(true)}
                      className="text-[9px] bg-[#161d28] hover:bg-[#1d2531] border border-[#212a38] text-[#20e3a2] font-semibold px-2 py-0.5 rounded-md cursor-pointer transition-colors"
                    >
                      Edit Name
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <h1 className="text-lg font-display font-black text-white tracking-wide flex items-center justify-center md:justify-start gap-2">
                <span>{title}</span>
                {isUser && isUserOnline(data) && (
                  <span className="w-2 h-2 rounded-full bg-[#20e3a2] animate-pulse shrink-0" />
                )}
              </h1>
            )}
            <p className="text-[11px] text-[#8d97ab] font-mono mt-0.5">
              {subTitle}
            </p>

            {parsedAbout?.thinking && (
              <div className="mt-2.5 bg-[#20e3a2]/10 border border-[#20e3a2]/30 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#20e3a2] flex items-center gap-2 max-w-full">
                <span className="shrink-0 text-sm">💭</span>
                <span className="text-white leading-tight break-words font-sans">{parsedAbout.thinking}</span>
              </div>
            )}
          </div>

          {/* Action buttons for platform users */}
          {isUser && data && data.id !== currentUser.id && (
            <div className="flex items-center gap-2.5 mt-4">
              {onStartDM && (
                <button
                  onClick={() => {
                    onStartDM(data as Profile);
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#7c5cff] to-[#6849eb] hover:shadow-lg hover:shadow-[#7c5cff]/10 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Start Chat</span>
                </button>
              )}

              {onCall && (
                <>
                  <button
                    onClick={() => onCall('voice', (data as Profile).id)}
                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-[#20e3a2]/30 hover:bg-[#20e3a2]/5 flex items-center justify-center text-[#20e3a2] transition-colors cursor-pointer"
                    title="Start Voice Call"
                  >
                    <Phone className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    onClick={() => onCall('video', (data as Profile).id)}
                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 hover:border-[#7c5cff]/30 hover:bg-[#7c5cff]/5 flex items-center justify-center text-[#7c5cff] transition-colors cursor-pointer"
                    title="Start Video Call"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          )}

          {/* Biography Detail */}
          <div className="mt-4 pt-3 border-t border-[#212a38]">
            <h3 className="text-[9.5px] text-[#5a6478] uppercase font-mono font-black tracking-widest flex items-center gap-1.5 mb-1.5">
              <Info className="w-3 h-3 text-[#7c5cff]" />
              <span>{isUser ? 'Bio' : 'Biography & Description'}</span>
            </h3>
            <p className="text-[11.5px] text-[#eef1f6] leading-snug italic bg-black/30 p-2.5 rounded-xl border border-[#212a38]/30">
              "{bioText}"
            </p>
          </div>

          {/* Details Fields */}
          <div className="mt-3 space-y-1.5">
            {isUser && data && (
              <>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/3 border border-[#212a38]/20 text-[10.5px]">
                  <span className="text-[#8d97ab] font-mono font-medium flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#8d97ab]" /> Email Address
                  </span>
                  <span className="text-white font-mono font-semibold truncate max-w-[180px]" title={(data as Profile).email}>
                    {(data as Profile).email}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/3 border border-[#212a38]/20 text-[10.5px]">
                  <span className="text-[#8d97ab] font-mono font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#8d97ab]" /> Joined On
                  </span>
                  <span className="text-white font-mono">
                    {new Date((data as Profile).created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </>
            )}

            {isGroup && data && (
              <>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/3 border border-[#212a38]/20 text-[10.5px]">
                  <span className="text-[#8d97ab] font-mono font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#8d97ab]" /> Created On
                  </span>
                  <span className="text-white font-mono">
                    {new Date((data as Group).created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Community members area (For general chat and groups only) */}
      {!isUser && (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0d14]/90 p-5 md:p-6">
          {/* Header / Members Count Area */}
          <div className="flex items-center justify-between border-b border-[#212a38] pb-4 mb-4">
            <div>
              <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-[#20e3a2]" />
                <span>Members</span>
              </h3>
              <p className="text-[10px] text-[#8d97ab] mt-0.5 font-mono">
                {communityMembers.length} operators verified to access this channel
              </p>
            </div>
          </div>

          {/* Search Input Area with Search Icon (Requirement) */}
          <div className="relative mb-4">
            <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-[#5a6478]">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Search community operators..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111622]/90 border border-[#212a38] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-[#5a6478] focus:border-[#7c5cff] focus:outline-none focus:ring-1 focus:ring-[#7c5cff]/30 transition-all font-medium font-mono shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-3 flex items-center text-[#5a6478] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Scrollable Members List */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-1">
            {filteredMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center animate-fade-in">
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider font-mono">No matching operators found</span>
                <p className="text-[10.5px] text-gray-500 mt-1 max-w-[200px]">Ensure spelling matches the user's username or ID</p>
              </div>
            ) : (
              filteredMembers.map((member) => {
                const seed = member.username?.charCodeAt(0) || 0;
                const isSelf = member.id === currentUser.id;
                const isGroupAdmin = isGroup && data && ((data as Group).creator_id === member.id || ((data as Group).admins || []).includes(member.id));
                
                return (
                  <div
                    key={member.id}
                    onClick={() => handleMemberClick(member)}
                    className={`w-full flex items-center justify-between py-2 px-3 rounded-xl border transition-all text-left group/row ${
                      isSelf 
                        ? 'bg-[#161d28]/10 border-[#212a38]/10 cursor-default' 
                        : 'bg-[#161d28]/30 hover:bg-[#161d28]/80 border-[#212a38]/20 hover:border-[#212a38]/60 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Member Avatar */}
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-md shrink-0 relative overflow-hidden"
                        style={{
                          background: member.avatar_url ? 'none' : getAvatarStyle(seed),
                        }}
                      >
                        {member.avatar_url ? (
                          <img 
                            src={member.avatar_url} 
                            alt="" 
                            className="w-full h-full object-cover rounded-full" 
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          getInitials(member.display_name || member.username || 'U')
                        )}
                      </div>
 
                      {/* Member details */}
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                          <span className="group-hover/row:text-[#20e3a2] transition-colors truncate">
                            {member.display_name || member.username}
                          </span>
                          {isGroupAdmin && (
                            <span className="text-[7px] font-mono font-bold bg-[#20e3a2]/10 text-[#20e3a2] border border-[#20e3a2]/20 px-1 py-0.2 rounded">ADMIN</span>
                          )}
                          {isSelf && (
                            <span className="text-[7.5px] font-bold text-[#7c5cff] bg-[#7c5cff]/10 border border-[#7c5cff]/15 px-1 py-0.5 rounded font-mono">YOU</span>
                          )}
                        </div>
                        <p className="text-[9px] text-[#8d97ab] font-mono leading-none mt-0.5 truncate">
                          @{member.username}
                        </p>
                      </div>
                    </div>

                    {/* Right online status marker */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider border whitespace-nowrap truncate max-w-[160px] inline-block ${
                        isUserOnline(member) 
                          ? 'bg-emerald-500/10 text-[#20e3a2] border-emerald-500/20' 
                          : 'bg-white/5 text-[#8d97ab] border-white/5'
                      }`}>
                        {formatLastSeen(member)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* FULL SCREEN ZOOMED COVER PHOTO OVERLAY */}
      {showZoomedCover && coverUrl && (
        <div 
          onClick={() => setShowZoomedCover(false)}
          className="fixed inset-0 bg-[#030508]/95 z-[100] flex flex-col items-center justify-center animate-fade-in cursor-pointer p-4 select-none"
        >
          {/* Back button */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowZoomedCover(false); }}
            className="absolute top-[calc(var(--safe-top)+20px)] left-6 w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:text-[#20e3a2] hover:bg-white/15 transition-all cursor-pointer shadow-xl backdrop-blur-md animate-fade-in"
            title="Close Zoom"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          {/* Main zoomed cover container */}
          <div 
            onClick={() => setShowZoomedCover(false)}
            className="w-[92vw] h-[60vw] max-w-[840px] max-h-[520px] rounded-2xl border border-white/20 flex items-center justify-center shadow-2xl relative overflow-hidden bg-[#161d28] animate-zoom-in cursor-pointer"
          >
            <img 
              src={coverUrl} 
              alt="Zoomed Cover" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-4 font-mono uppercase tracking-wider font-semibold">Tap anywhere to zoom out</p>
        </div>
      )}

      {/* FULL SCREEN ZOOMED PROFILE AVATAR PORTRAIT OVERLAY */}
      {showZoomedAvatar && (
        <div 
          onClick={() => setShowZoomedAvatar(false)}
          className="fixed inset-0 bg-[#030508]/95 z-[100] flex flex-col items-center justify-center animate-fade-in cursor-pointer p-4 select-none"
        >
          {/* Back button */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowZoomedAvatar(false); }}
            className="absolute top-[calc(var(--safe-top)+20px)] left-6 w-11 h-11 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:text-[#20e3a2] hover:bg-white/15 transition-all cursor-pointer shadow-xl backdrop-blur-md animate-fade-in"
            title="Close Zoom"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          {/* Main zoomed avatar container */}
          <div 
            onClick={() => setShowZoomedAvatar(false)}
            className="w-[85vw] h-[85vw] max-w-[460px] max-h-[460px] rounded-full border-2 border-white/20 flex items-center justify-center text-white text-8xl font-black shadow-[0_0_80px_rgba(32,227,162,0.18)] relative overflow-hidden bg-[#161d28] animate-zoom-in cursor-pointer" 
            style={bgStyle}
          >
            {data?.avatar_url || (isGroup && data?.icon && (data.icon.startsWith('data:image/') || data.icon.startsWith('http'))) ? (
              <img 
                src={isGroup ? data.icon : data.avatar_url} 
                alt="Zoomed Portrait" 
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : isGeneral ? (
              <svg width="220" height="220" viewBox="0 0 150 150" fill="none">
                <path
                  d="M30 40 C30 20, 60 15, 75 35 C95 60, 60 65, 55 80 C50 95, 85 100, 90 75 C93 60, 75 55, 70 65 C65 75, 80 85, 100 78 C118 71, 118 45, 100 35 C85 27, 75 45, 85 55"
                  stroke="url(#profileLogoGrad)"
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              getInitials(title)
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-4 font-mono uppercase tracking-wider font-semibold">Tap anywhere to zoom out</p>
        </div>
      )}
    </div>
  );
}

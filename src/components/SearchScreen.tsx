import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Profile, Group } from '../types';
import { ArrowLeft, Search, Circle, X, Loader2, Compass, Users, Plus, Check, CheckSquare, Square, Shield, Image } from 'lucide-react';
import { isUserOnline } from '../utils/customNames';

interface SearchScreenProps {
  currentUser: Profile;
  onCancel: () => void;
  onSelectUser: (peer: Profile) => void;
  allProfiles?: Profile[];
  onCreateGroup?: (name: string, icon: string, memberIds: string[]) => void;
}

export default function SearchScreen({ 
  currentUser, 
  onCancel, 
  onSelectUser, 
  allProfiles = [],
  onCreateGroup 
}: SearchScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [localResults, setLocalResults] = useState<Profile[]>([]);
  const [suggestions, setSuggestions] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  // Group creation states
  const [isGroupCreateMode, setIsGroupCreateMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('👥');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  // Listen to external group creation triggers
  useEffect(() => {
    const handleTrigger = () => {
      setGroupName('');
      setGroupIcon('👥');
      setSelectedMemberIds([]);
      setIsGroupCreateMode(true);
    };
    window.addEventListener('vyper_trigger_group_creation', handleTrigger);
    return () => {
      window.removeEventListener('vyper_trigger_group_creation', handleTrigger);
    };
  }, []);

  // Fetch initial suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .neq('id', currentUser.id)
          .order('display_name', { ascending: true })
          .limit(10);

        if (!error && data) {
          setSuggestions(data);
          try {
            localStorage.setItem('vypervic_suggestions_cache', JSON.stringify(data));
          } catch (storageErr) {
            console.warn('Could not write suggestions cache to localStorage:', storageErr);
          }
        } else {
          // Fallback to cache or prop list
          const cache = localStorage.getItem('vypervic_suggestions_cache');
          if (cache) {
            setSuggestions(JSON.parse(cache));
          } else if (allProfiles && allProfiles.length > 0) {
            setSuggestions(allProfiles.filter(p => p.id !== currentUser.id).slice(0, 10));
          }
        }
      } catch (err) {
        console.error('Error fetching suggestions:', err);
        const cache = localStorage.getItem('vypervic_suggestions_cache');
        if (cache) {
          setSuggestions(JSON.parse(cache));
        } else if (allProfiles && allProfiles.length > 0) {
          setSuggestions(allProfiles.filter(p => p.id !== currentUser.id).slice(0, 10));
        }
      }
    };

    fetchSuggestions();
  }, [currentUser, allProfiles]);

  // Instant local filtering
  useEffect(() => {
    if (!searchQuery.trim()) {
      setLocalResults([]);
      return;
    }
    const queryStr = searchQuery.trim().toLowerCase();
    const localMatch = allProfiles.filter(p => 
      p.id !== currentUser.id && 
      ((p.username && p.username.toLowerCase().includes(queryStr)) || 
       (p.display_name && p.display_name.toLowerCase().includes(queryStr)))
    );
    setLocalResults(localMatch);
  }, [searchQuery, allProfiles, currentUser.id]);

  // Execute database search query on input changes
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setLoading(true);
      try {
        const queryStr = `%${searchQuery.trim()}%`;
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .neq('id', currentUser.id)
          .or(`username.ilike.${queryStr},display_name.ilike.${queryStr}`)
          .limit(20);

        if (!error && data) {
          setSearchResults(data);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error('Error searching profiles:', err);
        setSearchResults([]);
      } finally {
        setLoading(false);
      }
    }, 150); // 150ms debounce for database search

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, currentUser, allProfiles]);

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
      ['#ffd166', '#c99a1f'],
      ['#a78bfa', '#6d4fd4'],
      ['#34d399', '#0f9d6b'],
    ];
    const c = palette[seed % palette.length];
    return `linear-gradient(135deg, ${c[0]} 0%, ${c[1]} 100%)`;
  };

  const displayList = searchQuery.trim()
    ? (() => {
        const combined = [...localResults];
        searchResults.forEach(sr => {
          if (!combined.some(c => c.id === sr.id)) {
            combined.push(sr);
          }
        });
        return combined;
      })()
    : suggestions;

  // Toggle member selection for group creation
  const handleToggleMember = (userId: string) => {
    setSelectedMemberIds((prev) => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleGroupSubmit = () => {
    if (!groupName.trim()) return;
    if (onCreateGroup) {
      onCreateGroup(groupName.trim(), groupIcon, selectedMemberIds);
    }
  };

  if (isGroupCreateMode) {
    // Render group creation form and multiple contact friend selector
    const contactsList = allProfiles.filter(p => p.id !== currentUser.id);

    return (
      <div className="absolute inset-0 flex flex-col bg-[#080b10] z-20 animate-fade-in">
        {/* Header */}
        <div className="pt-[calc(var(--safe-top)+10px)] px-4 pb-3.5 flex items-center gap-3 border-b border-[#212a38] bg-[#080b10]/95 backdrop-blur-md sticky top-0 z-10">
          <button
            onClick={() => setIsGroupCreateMode(false)}
            className="w-9 h-9 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center cursor-pointer hover:bg-[#1d2531] transition-colors"
          >
            <ArrowLeft className="w-4.5 h-4.5 text-[#eef1f6]" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-bold text-sm text-white leading-tight">Create Group</h2>
            <p className="text-[10px] text-[#5a6478] font-mono leading-none mt-0.5">Define metadata & add members</p>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-12 space-y-5">
          {/* Group info fields card */}
          <div className="bg-[#161d28]/40 border border-[#212a38]/60 rounded-2xl p-4 space-y-4">
            {/* Custom Icon Picker with presets & file upload */}
            <div className="flex flex-col gap-2.5">
              <label className="text-[10px] font-bold text-[#5a6478] uppercase tracking-wider block">
                Group Icon Avatar
              </label>
              
              <div className="flex items-center gap-4 bg-[#10151d] border border-[#212a38] rounded-xl p-3">
                {/* Active Icon Preview */}
                <div className="w-14 h-14 rounded-xl bg-[#080b10] border border-[#212a38] flex items-center justify-center text-xl overflow-hidden shadow-inner shrink-0 relative">
                  {groupIcon && (groupIcon.startsWith('data:image/') || groupIcon.startsWith('http')) ? (
                    <img src={groupIcon} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span>{groupIcon || '👥'}</span>
                  )}
                </div>

                {/* Grid of Preset Emojis & Custom Upload Button */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {['👥', '🛡️', '🛰️', '🔥', '⚡', '🔮', '🤖', '🚀', '🛸'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setGroupIcon(emoji)}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs hover:bg-white/5 border transition-all cursor-pointer ${
                          groupIcon === emoji ? 'border-[#20e3a2] bg-[#20e3a2]/10' : 'border-[#212a38] bg-[#161d28]'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>

                  {/* Device Gallery Upload Button */}
                  <div>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#20e3a2]/10 hover:bg-[#20e3a2]/20 border border-[#20e3a2]/20 text-[10px] font-bold text-[#20e3a2] transition-colors cursor-pointer select-none">
                      <Image className="w-3 h-3" />
                      Choose from Gallery
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              if (reader.result && typeof reader.result === 'string') {
                                setGroupIcon(reader.result);
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Group name input */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-[#5a6478] uppercase tracking-wider">Group Channel Name</label>
              <input
                type="text"
                placeholder="Enter group name..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full bg-[#161d28] border border-[#212a38] rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold placeholder-[#5a6478] outline-none focus:border-[#20e3a2] transition-colors"
                maxLength={30}
                autoFocus
              />
            </div>

            {/* Warning banner */}
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#20e3a2]/5 border border-[#20e3a2]/15 text-[10.5px] text-[#8d97ab] leading-normal">
              <Shield className="w-4 h-4 text-[#20e3a2] shrink-0 mt-0.5" />
              <span>All communications in this group will be visible to all members.</span>
            </div>
          </div>

          {/* Members list section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[11px] font-bold tracking-[1.5px] text-[#5a6478] uppercase">Select Contacts ({selectedMemberIds.length} Selected)</h3>
              <span className="text-[10px] font-mono text-[#5a6478]">Total: {contactsList.length}</span>
            </div>

            {contactsList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-[#212a38] rounded-2xl">
                <Users className="w-8 h-8 text-[#5a6478] mb-2 opacity-60" />
                <p className="text-xs text-[#8d97ab]">No contacts available yet to establish a group.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {contactsList.map((user) => {
                  const isSelected = selectedMemberIds.includes(user.id);
                  const seed = user.username?.charCodeAt(0) || 0;
                  return (
                    <button
                      key={user.id}
                      onClick={() => handleToggleMember(user.id)}
                      className={`w-full flex items-center gap-3.5 p-3 rounded-2xl border transition-all cursor-pointer text-left ${
                        isSelected 
                          ? 'bg-[#20e3a2]/5 border-[#20e3a2]/30' 
                          : 'bg-[#161d28]/35 border-[#212a38]/20 hover:bg-[#161d28]'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className="shrink-0 text-[#20e3a2]">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 fill-[#20e3a2]/10" />
                        ) : (
                          <Square className="w-5 h-5 text-[#5a6478]" />
                        )}
                      </div>

                      {/* Avatar */}
                      <div className="relative w-10 h-10 flex-shrink-0">
                        <div
                          className="w-full h-full rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
                          style={{
                            background: user.avatar_url ? 'none' : getAvatarStyle(seed),
                          }}
                        >
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt={user.display_name || ''}
                              className="w-full h-full rounded-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            getInitials(user.display_name || user.username || 'V')
                          )}
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-display font-bold text-xs text-white truncate">
                          {user.display_name || user.username}
                        </div>
                        <div className="text-[10px] text-[#8d97ab] font-mono mt-0.5 truncate">
                          @{user.username}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Submit button bar */}
        <div className="p-4 border-t border-[#212a38] bg-[#0c1017]/95 backdrop-blur-md sticky bottom-0 flex items-center gap-3 z-10">
          <button
            onClick={() => setIsGroupCreateMode(false)}
            className="flex-1 py-3.5 rounded-xl border border-[#212a38] hover:bg-white/5 text-xs text-white font-bold transition-colors cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            disabled={!groupName.trim() || selectedMemberIds.length === 0}
            onClick={handleGroupSubmit}
            className={`flex-1 py-3.5 rounded-xl text-xs font-bold text-center transition-all cursor-pointer shadow-lg ${
              groupName.trim() && selectedMemberIds.length > 0
                ? 'bg-[#20e3a2] text-black hover:bg-[#20e3a2]/90 active:scale-95'
                : 'bg-[#212a38] text-[#5a6478] cursor-not-allowed opacity-60'
            }`}
          >
            Establish Channel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-[#080b10] z-20">
      {/* Search Header Input bar */}
      <div className="pt-[calc(var(--safe-top)+10px)] px-4 pb-3.5 flex items-center gap-3 border-b border-[#212a38] bg-[#080b10]/95 backdrop-blur-md sticky top-0 z-10">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center cursor-pointer hover:bg-[#1d2531] transition-colors"
        >
          <ArrowLeft className="w-4.5 h-4.5 text-[#eef1f6]" />
        </button>

        <div className="flex-1 flex items-center bg-[#161d28] border border-[#212a38] rounded-2xl px-3.5 py-2.5 focus-within:border-[#20e3a2] transition-colors">
          <Search className="w-4 h-4 text-[#5a6478] mr-2.5" />
          <input
            type="text"
            placeholder="Search by username or display name..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-[#eef1f6] font-semibold placeholder-[#5a6478]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-0.5 rounded-full hover:bg-[#1d2531] cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-[#8d97ab]" />
            </button>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-12">
        {/* Create Group Banner CTA at the top (Requirement 4) */}
        {!searchQuery && (
          <div className="mb-5 bg-gradient-to-r from-[#7c5cff]/10 to-[#20e3a2]/10 border border-[#212a38] rounded-2xl p-4 flex items-center justify-between gap-4 shadow-lg">
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5 leading-tight">
                <Users className="w-4 h-4 text-[#20e3a2]" />
                Create Group Chat?
              </h4>
              <p className="text-[10.5px] text-[#8d97ab] mt-1 leading-normal">
                Coordinate communication channels with multiple users simultaneously.
              </p>
            </div>
            <button
              onClick={() => {
                setGroupName('');
                setGroupIcon('👥');
                setSelectedMemberIds([]);
                setIsGroupCreateMode(true);
              }}
              className="shrink-0 bg-[#20e3a2] text-black font-bold text-[11px] px-3.5 py-2 rounded-xl flex items-center gap-1 hover:bg-[#20e3a2]/90 active:scale-95 transition-all cursor-pointer shadow-md"
            >
              <Plus className="w-3.5 h-3.5" />
              Start Group
            </button>
          </div>
        )}

        <div className="mb-4">
          <h3 className="text-[11px] font-bold tracking-[1.5px] text-[#5a6478] uppercase px-1.5 flex items-center gap-1.5">
            {searchQuery.trim() ? (
              <>
                <span>Search Results</span>
                {loading && <Loader2 className="w-3 h-3 animate-spin text-[#20e3a2]" />}
              </>
            ) : (
              <>
                <Compass className="w-3.5 h-3.5 text-[#7c5cff]" />
                <span>Suggested Connections</span>
              </>
            )}
          </h3>
        </div>

        {/* Profiles output list */}
        {displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            {loading ? (
              <Loader2 className="w-8 h-8 text-[#20e3a2] animate-spin mb-3" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center mb-3">
                  <X className="w-5 h-5 text-[#ff5470]" />
                </div>
                <p className="text-xs font-bold text-white mb-1">No users found</p>
                <p className="text-[11px] text-[#8d97ab] max-w-xs">
                  We couldn't locate any users matching "{searchQuery}". Check the spelling or connection status.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {displayList.map((user) => {
              const seed = user.username?.charCodeAt(0) || 0;
              return (
                <button
                  key={user.id}
                  onClick={() => onSelectUser(user)}
                  className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-[#161d28]/35 hover:bg-[#161d28] border border-[#212a38]/20 transition-colors cursor-pointer text-left"
                >
                  {/* User Profile Avatar with dynamic bg or base64 profile image */}
                  <div className="relative w-11 h-11 flex-shrink-0">
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-white text-base font-bold shadow-sm"
                      style={{
                        background: user.avatar_url ? 'none' : getAvatarStyle(seed),
                      }}
                    >
                      {user.avatar_url ? (
                        <img
                          src={user.avatar_url}
                          alt={user.display_name || ''}
                          className="w-full h-full rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        getInitials(user.display_name || user.username || 'V')
                      )}
                    </div>
                    {/* Status badge */}
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#080b10] flex items-center justify-center">
                      <Circle
                        className={`w-full h-full rounded-full fill-current ${
                          isUserOnline(user) ? 'text-[#20e3a2]' : 'text-[#5a6478]'
                        }`}
                      />
                    </span>
                  </div>

                  {/* Profile info details */}
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-sm text-white truncate">
                      {user.display_name || user.username}
                    </div>
                    <div className="text-[11.5px] text-[#8d97ab] font-mono mt-0.5 truncate">
                      @{user.username}
                    </div>
                    {user.about && (
                      <p className="text-[11px] text-[#5a6478] truncate mt-1">
                        {user.about}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

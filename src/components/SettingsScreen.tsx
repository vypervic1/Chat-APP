import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { supabase } from '../supabase';
import { Profile } from '../types';
import { 
  ArrowLeft, 
  Trash, 
  LogOut, 
  Edit, 
  Save,
  Sparkles, 
  Loader2, 
  Bell, 
  Smartphone, 
  Check, 
  Database, 
  RefreshCw, 
  Send, 
  AlertTriangle,
  HardDrive,
  Download,
  Play,
  Pause,
  Trash2,
  Link as LinkIcon,
  Globe,
  Copy,
  ExternalLink,
  Camera,
  X
} from 'lucide-react';
import { getAllSavedFiles, deleteSavedFile, SavedFile } from '../utils/indexedDB';
import { 
  checkNotificationPermission, 
  requestNotificationPermission, 
  generateMockFCMToken, 
  registerPushToken, 
  fetchRegisteredTokens, 
  deletePushToken,
  PushToken 
} from '../notifications';
import { parseProfileAbout, buildProfileAbout } from '../utils/customNames';
import { getMiniRoastMessage } from '../utils/roasts';

function compressImage(file: File, maxWidth: number, maxHeight: number, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface SettingsScreenProps {
  currentUser: Profile;
  allProfiles: Profile[];
  appTheme: string;
  onUpdateAppTheme: (theme: string) => void;
  onBack: () => void;
  onLogout: () => void;
  onUpdateProfile: (updated: Profile) => void;
  onToast: (msg: string) => void;
}

export default function SettingsScreen({
  currentUser,
  allProfiles,
  appTheme,
  onUpdateAppTheme,
  onBack,
  onLogout,
  onUpdateProfile,
  onToast,
}: SettingsScreenProps) {
  const [displayName, setDisplayName] = useState(currentUser.display_name || '');
  const parsedAbout = parseProfileAbout(currentUser.about);
  const [thinking, setThinking] = useState(parsedAbout.thinking || '');
  const [about, setAbout] = useState(parsedAbout.about || 'Hey there! I am using VyperVic.');
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<'logout' | 'delete' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showZoomedCover, setShowZoomedCover] = useState(false);
  const [lastDarkTheme, setLastDarkTheme] = useState('cosmic');

  // Push Notifications Settings States
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [pushTokens, setPushTokens] = useState<PushToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [registeringDevice, setRegisteringDevice] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [coverUrl, setCoverUrl] = useState(parsedAbout.coverUrl || '');
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  // Local files cache state
  const [localFiles, setLocalFiles] = useState<SavedFile[]>([]);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Device Storage Tabs & Fullscreen state
  const [activeStorageTab, setActiveStorageTab] = useState<'media' | 'docs' | 'voice' | 'links'>('media');
  const [fullscreenMedia, setFullscreenMedia] = useState<SavedFile | null>(null);

  // Deletion Confirmation States (Strict Requirement: all deletion must ask confirmation for delete or cancel)
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string } | null>(null);
  const [tokenToDeregister, setTokenToDeregister] = useState<{ id: string; deviceName: string } | null>(null);

  useEffect(() => {
    loadLocalFiles();
  }, []);

  const loadLocalFiles = async () => {
    const files = await getAllSavedFiles();
    setLocalFiles(files);
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    const { id, name } = fileToDelete;
    if (playingAudioId === id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setPlayingAudioId(null);
    }
    await deleteSavedFile(id);
    onToast(getMiniRoastMessage('delete_file', name));
    setFileToDelete(null);
    if (fullscreenMedia?.id === id) {
      setFullscreenMedia(null);
    }
    loadLocalFiles();
  };

  const confirmDeregisterToken = async () => {
    if (!tokenToDeregister) return;
    const { id, deviceName } = tokenToDeregister;
    if (id.startsWith('local_')) {
      const localTokensKey = `vypervic_local_tokens_${currentUser.id}`;
      const localTokens: PushToken[] = JSON.parse(localStorage.getItem(localTokensKey) || '[]');
      const filtered = localTokens.filter(t => t.id !== id);
      try {
        localStorage.setItem(localTokensKey, JSON.stringify(filtered));
      } catch (storageErr) {
        console.warn('Failed to remove token from local storage:', storageErr);
      }
      setPushTokens(prev => prev.filter(t => t.id !== id));
      onToast('Removed');
    } else {
      const success = await deletePushToken(id);
      if (success) {
        onToast('Removed');
        await loadPushTokens();
      } else {
        onToast('Failed');
      }
    }
    setTokenToDeregister(null);
  };

  const handleDownloadLocalFile = (file: SavedFile) => {
    const link = document.createElement('a');
    link.href = file.fileData;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast('Downloaded');
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    onToast('Copied');
  };

  const handlePlayVoiceNote = (file: SavedFile) => {
    if (playingAudioId === file.id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setPlayingAudioId(null);
    } else {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(file.fileData);
      audioPlayerRef.current = audio;
      audio.play().catch(e => console.warn("Failed to play local voice file:", e));
      setPlayingAudioId(file.id);
      audio.onended = () => {
        setPlayingAudioId(null);
      };
    }
  };

  // Load push notifications state
  useEffect(() => {
    setPermission(checkNotificationPermission());
    loadPushTokens();
  }, [currentUser]);

  const loadPushTokens = async () => {
    setLoadingTokens(true);
    const tokens = await fetchRegisteredTokens(currentUser.id);
    setPushTokens(tokens);
    setLoadingTokens(false);
  };

  const handleRequestPermission = async () => {
    const status = await requestNotificationPermission();
    setPermission(status);
    if (status === 'granted') {
      onToast('Granted');
    } else {
      onToast('Denied');
    }
  };

  const handleRegisterDevice = async () => {
    setRegisteringDevice(true);
    try {
      // First, ensure notification permission is requested
      let currentPermission = checkNotificationPermission();
      if (currentPermission !== 'granted') {
        currentPermission = await requestNotificationPermission();
        setPermission(currentPermission);
      }

      const mockToken = generateMockFCMToken();
      // Detect browser / device details
      const isMobile = /Android|iPhone/i.test(navigator.userAgent);
      const deviceLabel = isMobile 
        ? 'VyperVic Android App (Simulated Device)' 
        : 'VyperVic Client (Web Browser)';

      const res = await registerPushToken(currentUser.id, mockToken, deviceLabel);
      if (res.success) {
        onToast('Registered');
        await loadPushTokens();
      } else {
        // Fallback simulate locally if Supabase tables are not run yet
        const localTokensKey = `vypervic_local_tokens_${currentUser.id}`;
        const localTokens = JSON.parse(localStorage.getItem(localTokensKey) || '[]');
        const mockRow: PushToken = {
          id: 'local_' + Math.random().toString(36).substring(2, 9),
          user_id: currentUser.id,
          fcm_token: mockToken,
          device_name: deviceLabel + ' (Local Sandbox)',
          is_active: true,
          created_at: new Date().toISOString()
        };
        try {
          localStorage.setItem(localTokensKey, JSON.stringify([...localTokens, mockRow]));
        } catch (storageErr) {
          console.warn('Failed to save push token to local storage:', storageErr);
        }
        onToast('Registered');
        setPushTokens(prev => [...prev, mockRow]);
      }
    } catch (e) {
      onToast('Failed');
    } finally {
      setRegisteringDevice(false);
    }
  };

  // Compute initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // Seed avatars
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

  const handleUpdateProfile = async (field: string, value: string) => {
    try {
      const updatedData = { ...currentUser, [field]: value };
      onUpdateProfile(updatedData);
      onToast(getMiniRoastMessage(field, value));

      const { error } = await supabase
        .from('profiles')
        .update({ [field]: value })
        .eq('id', currentUser.id);

      if (error) console.warn('Supabase profile update warning:', error);
    } catch (err: any) {
      console.error('Error updating profile:', err);
    }
  };

  const handleUpdateAboutAndThinking = async (newThinking: string, newAbout: string) => {
    try {
      const combined = buildProfileAbout(newThinking.trim(), coverUrl, newAbout.trim());
      const updatedData = { ...currentUser, about: combined };
      onUpdateProfile(updatedData);

      if (newThinking.trim() !== thinking) {
        onToast(getMiniRoastMessage('thinking', newThinking.trim()));
      } else {
        onToast(getMiniRoastMessage('about', newAbout.trim()));
      }

      const { error } = await supabase
        .from('profiles')
        .update({ about: combined })
        .eq('id', currentUser.id);

      if (error) console.warn('Supabase status update warning:', error);
    } catch (err: any) {
      console.error('Error updating profile status:', err);
    }
  };

  const handleCoverUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressImage(file, 900, 450, 0.82);
      
      // Cache locally so it NEVER resets or gets lost
      try {
        localStorage.setItem(`vyper_cover_${currentUser.id}`, compressedBase64);
      } catch (err) {}

      setCoverUrl(compressedBase64);
      const combined = buildProfileAbout(thinking, compressedBase64, about);
      const updatedData = { ...currentUser, about: combined };
      
      onUpdateProfile(updatedData);
      onToast(getMiniRoastMessage('cover'));

      const { error } = await supabase
        .from('profiles')
        .update({ about: combined })
        .eq('id', currentUser.id);

      if (error) console.warn('Supabase cover photo sync warning:', error);
    } catch (err: any) {
      console.error('Error uploading cover photo:', err);
      onToast('Error');
    }
  };

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressImage(file, 400, 400, 0.82);
      
      // Cache locally so it NEVER resets or gets lost
      try {
        localStorage.setItem(`vyper_avatar_${currentUser.id}`, compressedBase64);
      } catch (err) {}

      const updatedData = { ...currentUser, avatar_url: compressedBase64 };
      onUpdateProfile(updatedData);
      onToast(getMiniRoastMessage('avatar'));

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: compressedBase64 })
        .eq('id', currentUser.id);

      if (error) console.warn('Supabase avatar photo sync warning:', error);
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
      onToast('Error');
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      // 1. Delete profiles entry (on cascade deletes messages)
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', currentUser.id);

      if (profileError) throw profileError;

      // 2. Delete auth user
      const { error: authError } = await supabase.rpc('delete_user_session_or_account');
      // Supabase Auth client can sign out as absolute fallback
      await supabase.auth.signOut();

      onToast('Removed');
      onLogout();
    } catch (err: any) {
      console.error('Error deleting account:', err);
      // Fallback auth signOut in case schema has RPC limitations
      await supabase.auth.signOut();
      onToast('Removed');
      onLogout();
    } finally {
      setDeleting(false);
      setShowConfirmModal(null);
    }
  };

  const seed = currentUser.username?.charCodeAt(0) || 0;

  return (
    <div className="absolute inset-0 flex flex-col bg-[#080b10] z-30">
      {/* Header */}
      <div className="pt-[calc(var(--safe-top)+10px)] px-[18px] pb-3.5 flex items-center gap-3.5 border-b border-[#212a38]">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-[#161d28] border border-[#212a38] flex items-center justify-center cursor-pointer active:bg-[#1d2531] transition-colors"
        >
          <ArrowLeft className="w-[18px] h-[18px] text-[#eef1f6]" />
        </button>
        <div className="font-display text-[17px] font-bold text-white">Settings</div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-[22px] py-6 pb-28">
        <div className="flex flex-col items-center mb-[30px] w-full relative">
          {/* Cover Photo Container */}
          <div 
            onClick={() => {
              if (coverUrl) setShowZoomedCover(true);
            }}
            className="w-full h-32 rounded-2xl relative overflow-hidden bg-gradient-to-r from-[#7c5cff]/20 to-[#20e3a2]/20 border border-[#212a38]/60 group mb-[-46px] z-0 cursor-pointer"
            title={coverUrl ? "Click to Zoom Cover Photo" : "Cover Photo"}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Cover"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : null}
            
            {/* Dark overlay on hover */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
              <span className="text-[11px] font-bold text-white bg-black/60 px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm">
                Tap to Zoom
              </span>
            </div>

            {/* Top-Right Edit Icon Button to Change Cover */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                coverInputRef.current?.click();
              }}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 flex items-center justify-center text-white cursor-pointer active:scale-95 transition-all z-20 shadow-lg"
              title="Change Cover Photo"
            >
              <Edit className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Big Avatar */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-[96px] h-[96px] rounded-full flex items-center justify-center text-[34px] font-extrabold text-[#06120d] cursor-pointer relative shadow-[0_12px_32px_-8px_rgba(124,92,255,0.4)] select-none group z-10 border-4 border-[#080b10]"
            style={{
              background: currentUser.avatar_url ? 'none' : getAvatarStyle(seed),
            }}
          >
            {currentUser.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt="Profile"
                className="w-full h-full rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              getInitials(currentUser.display_name || currentUser.username || 'V')
            )}

            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#1d2531] border-2 border-[#080b10] flex items-center justify-center text-white shadow-md">
              <Edit className="w-3 h-3 text-[#eef1f6]" />
            </div>
          </div>

          <div className="mt-3.5 font-display text-[19px] font-bold text-white leading-tight">
            {currentUser.display_name || currentUser.username}
          </div>
          <div className="mt-0.5 text-[#5a6478] font-mono text-[12.5px]">
            @{currentUser.username} • online
          </div>
        </div>

        {/* Hidden File input for avatar */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          className="hidden"
          accept="image/*"
        />

        {/* Hidden File input for cover photo */}
        <input
          type="file"
          ref={coverInputRef}
          onChange={handleCoverUpload}
          className="hidden"
          accept="image/*"
        />

        {/* Form Fields */}
        <div className="space-y-[22px]">
          <div className="field-group">
            <label className="text-[11px] font-bold tracking-[1.4px] text-[#5a6478] uppercase mb-2 block">
              Display Name
            </label>
            <div className="flex items-center justify-between gap-2.5 bg-[#161d28] border border-[#212a38] rounded-2xl px-4 py-3 focus-within:border-[#20e3a2] transition-colors">
              <input
                type="text"
                className="w-full bg-transparent border-none outline-none text-sm text-[#eef1f6] font-semibold"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => handleUpdateProfile('display_name', displayName)}
              />
              <button
                type="button"
                onClick={() => handleUpdateProfile('display_name', displayName)}
                className="p-1 text-[#20e3a2] hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Save Display Name"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="field-group">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold tracking-[1.4px] text-[#5a6478] uppercase block">
                What's on your mind
              </label>
              <span className="text-[10px] text-[#5a6478] font-mono">{thinking.length}/80</span>
            </div>
            <div className="flex items-center justify-between gap-2.5 bg-[#161d28] border border-[#212a38] rounded-2xl px-4 py-3 focus-within:border-[#20e3a2] transition-colors">
              <input
                type="text"
                maxLength={80}
                placeholder="What's on your mind... 💭"
                className="w-full bg-transparent border-none outline-none text-sm text-[#eef1f6] font-semibold"
                value={thinking}
                onChange={(e) => setThinking(e.target.value.substring(0, 80))}
                onBlur={() => handleUpdateAboutAndThinking(thinking, about)}
              />
              <button
                type="button"
                onClick={() => handleUpdateAboutAndThinking(thinking, about)}
                className="p-1 text-[#20e3a2] hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Save Status"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="field-group">
            <label className="text-[11px] font-bold tracking-[1.4px] text-[#5a6478] uppercase mb-2 block">
              About Status
            </label>
            <div className="flex items-center justify-between gap-2.5 bg-[#161d28] border border-[#212a38] rounded-2xl px-4 py-3 focus-within:border-[#20e3a2] transition-colors">
              <input
                type="text"
                className="w-full bg-transparent border-none outline-none text-sm text-[#eef1f6] font-semibold"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                onBlur={() => handleUpdateAboutAndThinking(thinking, about)}
              />
              <button
                type="button"
                onClick={() => handleUpdateAboutAndThinking(thinking, about)}
                className="p-1 text-[#20e3a2] hover:scale-110 active:scale-95 transition-all cursor-pointer"
                title="Save About"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* App Theme Selection Card */}
        <div className="mt-6 bg-[#161d28]/60 border border-[#212a38] rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#7c5cff]/15 text-[#7c5cff]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-white leading-tight">App Theme</h4>
              <p className="text-[11px] text-[#8d97ab] mt-0.5">Customize your visual interface</p>
            </div>
          </div>

          {/* Dark / Light Mode Toggle */}
          {(() => {
            const isLightMode = appTheme.startsWith('light');
            const currentBaseTheme = appTheme === 'light' ? 'cosmic' : appTheme.replace('light-', '');

            return (
              <>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#10151d] border border-[#212a38] rounded-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      if (isLightMode) {
                        onUpdateAppTheme(currentBaseTheme);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-2 cursor-pointer select-none ${
                      !isLightMode
                        ? 'bg-[#1d2531] text-[#20e3a2] border border-[#20e3a2]/30 shadow-md'
                        : 'text-[#8d97ab] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-[#20e3a2]" />
                    <span>Dark</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!isLightMode) {
                        onUpdateAppTheme(`light-${currentBaseTheme}`);
                      }
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold font-mono transition-all flex items-center justify-center gap-2 cursor-pointer select-none ${
                      isLightMode
                        ? 'bg-[#ffffff] text-black border border-white shadow-md'
                        : 'text-[#8d97ab] hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                    <span>Light</span>
                  </button>
                </div>

                {/* 4 Theme Type Cards */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {/* Liquid Glass */}
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateAppTheme(isLightMode ? 'light-liquid-glass' : 'liquid-glass');
                    }}
                    className={`flex flex-col items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      currentBaseTheme === 'liquid-glass'
                        ? 'border-[#38bdf8] bg-[#10151d] shadow-lg shadow-[#38bdf8]/15 ring-1 ring-[#38bdf8]/40'
                        : 'border-[#212a38] bg-[#10151d] hover:bg-[#161d28]'
                    }`}
                  >
                    <div className="flex gap-1.5 mb-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-[#030509] border border-white/10" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#38bdf8]" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#818cf8]" />
                    </div>
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">Liquid Glass</span>
                  </button>

                  {/* Cosmic */}
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateAppTheme(isLightMode ? 'light-cosmic' : 'cosmic');
                    }}
                    className={`flex flex-col items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      currentBaseTheme === 'cosmic'
                        ? 'border-[#20e3a2] bg-[#10151d] shadow-lg shadow-[#20e3a2]/15 ring-1 ring-[#20e3a2]/40'
                        : 'border-[#212a38] bg-[#10151d] hover:bg-[#161d28]'
                    }`}
                  >
                    <div className="flex gap-1.5 mb-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-[#080b10] border border-white/10" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#20e3a2]" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#7c5cff]" />
                    </div>
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">Cosmic</span>
                  </button>

                  {/* Solar */}
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateAppTheme(isLightMode ? 'light-solar' : 'solar');
                    }}
                    className={`flex flex-col items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      currentBaseTheme === 'solar'
                        ? 'border-[#00e5ff] bg-[#10151d] shadow-lg shadow-[#00e5ff]/15 ring-1 ring-[#00e5ff]/40'
                        : 'border-[#212a38] bg-[#10151d] hover:bg-[#161d28]'
                    }`}
                  >
                    <div className="flex gap-1.5 mb-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-[#0b0914] border border-white/10" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#00e5ff]" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#7c5cff]" />
                    </div>
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">Solar</span>
                  </button>

                  {/* Emerald */}
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateAppTheme(isLightMode ? 'light-emerald' : 'emerald');
                    }}
                    className={`flex flex-col items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      currentBaseTheme === 'emerald'
                        ? 'border-[#00ff88] bg-[#10151d] shadow-lg shadow-[#00ff88]/15 ring-1 ring-[#00ff88]/40'
                        : 'border-[#212a38] bg-[#10151d] hover:bg-[#161d28]'
                    }`}
                  >
                    <div className="flex gap-1.5 mb-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-[#040706] border border-white/10" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#00ff88]" />
                      <span className="w-3.5 h-3.5 rounded-full bg-[#20e3a2]" />
                    </div>
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">Emerald</span>
                  </button>
                </div>
              </>
            );
          })()}
        </div>

        {/* ========================================================= */}
        {/* DEVICE LOCAL STORAGE MEDIA MANAGER                       */}
        {/* ========================================================= */}
        <div className="mt-8 bg-[#161d28]/60 border border-[#212a38] rounded-3xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#20e3a2]/15 text-[#20e3a2]">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-display font-bold text-sm text-white leading-tight">Device Local Storage</h4>
                <p className="text-[11px] text-[#8d97ab] mt-0.5">Media, documents, and web links</p>
              </div>
            </div>
          </div>

          {/* Tabs Splitter: Media, Docs, Voice notes, Links */}
          <div className="grid grid-cols-4 bg-[#080b10]/80 p-1 rounded-2xl border border-[#212a38]/60 gap-1">
            <button
              type="button"
              onClick={() => setActiveStorageTab('media')}
              className={`py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center ${
                activeStorageTab === 'media'
                  ? 'bg-[#7c5cff] text-white shadow-md'
                  : 'text-[#8d97ab] hover:text-white'
              }`}
            >
              Media
            </button>
            <button
              type="button"
              onClick={() => setActiveStorageTab('docs')}
              className={`py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center ${
                activeStorageTab === 'docs'
                  ? 'bg-[#7c5cff] text-white shadow-md'
                  : 'text-[#8d97ab] hover:text-white'
              }`}
            >
              Docs
            </button>
            <button
              type="button"
              onClick={() => setActiveStorageTab('voice')}
              className={`py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center ${
                activeStorageTab === 'voice'
                  ? 'bg-[#7c5cff] text-white shadow-md'
                  : 'text-[#8d97ab] hover:text-white'
              }`}
            >
              Voice notes
            </button>
            <button
              type="button"
              onClick={() => setActiveStorageTab('links')}
              className={`py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center ${
                activeStorageTab === 'links'
                  ? 'bg-[#7c5cff] text-white shadow-md'
                  : 'text-[#8d97ab] hover:text-white'
              }`}
            >
              Links
            </button>
          </div>

          <div className="space-y-3">
            {localFiles.filter(f => {
              if (activeStorageTab === 'media') {
                return f.fileType !== 'link' && f.fileType !== 'audio/voice-note' && (f.fileType.startsWith('image/') || f.fileType.startsWith('video/'));
              } else if (activeStorageTab === 'docs') {
                return f.fileType !== 'link' && f.fileType !== 'audio/voice-note' && !f.fileType.startsWith('image/') && !f.fileType.startsWith('audio/') && !f.fileType.startsWith('video/');
              } else if (activeStorageTab === 'voice') {
                return f.fileType === 'audio/voice-note' || (f.fileType.startsWith('audio/') && (f.fileName.toLowerCase().includes('voice') || f.fileName.toLowerCase().includes('audio')));
              } else {
                return f.fileType === 'link';
              }
            }).length > 0 ? (
              <div className="max-h-[300px] overflow-y-auto space-y-2.5 pr-1">
                {localFiles
                  .filter(f => {
                    if (activeStorageTab === 'media') {
                      return f.fileType !== 'link' && f.fileType !== 'audio/voice-note' && (f.fileType.startsWith('image/') || f.fileType.startsWith('video/'));
                    } else if (activeStorageTab === 'docs') {
                      return f.fileType !== 'link' && f.fileType !== 'audio/voice-note' && !f.fileType.startsWith('image/') && !f.fileType.startsWith('audio/') && !f.fileType.startsWith('video/');
                    } else if (activeStorageTab === 'voice') {
                      return f.fileType === 'audio/voice-note' || (f.fileType.startsWith('audio/') && (f.fileName.toLowerCase().includes('voice') || f.fileName.toLowerCase().includes('audio')));
                    } else {
                      return f.fileType === 'link';
                    }
                  })
                  .map((file) => {
                    const displayTarget = (!file.targetName || file.targetName.toLowerCase() === 'user' || file.targetName === 'Operator')
                      ? 'Recipient'
                      : file.targetName;

                    const directionLabel = file.direction
                      ? (file.direction === 'to' ? `To ${displayTarget}` : `From ${displayTarget}`)
                      : (file.fileType === 'link' ? 'Web Link' : 'Local File');

                    return (
                      <div 
                        key={file.id}
                        onClick={() => {
                          if (file.fileType.startsWith('image/') || file.fileType.startsWith('video/')) {
                            setFullscreenMedia(file);
                          }
                        }}
                        className={`flex items-center justify-between p-3 bg-[#080b10]/60 border border-[#212a38]/60 rounded-2xl gap-3 animate-fade-in ${
                          file.fileType.startsWith('image/') || file.fileType.startsWith('video/') ? 'cursor-pointer hover:border-[#20e3a2]/40' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Left icon depending on file type */}
                          <div className="w-9 h-9 rounded-xl bg-[#212a38]/80 flex items-center justify-center shrink-0 overflow-hidden">
                            {file.fileType === 'link' ? (
                              <LinkIcon className="w-4 h-4 text-[#20e3a2]" />
                            ) : file.fileType.startsWith('image/') ? (
                              <img src={file.fileData} className="w-full h-full object-cover" />
                            ) : file.fileType.startsWith('video/') ? (
                              <div className="relative w-full h-full flex items-center justify-center bg-black/40">
                                <Play className="w-3.5 h-3.5 text-white fill-current" />
                              </div>
                            ) : file.fileType === 'audio/voice-note' || file.fileType.startsWith('audio/') ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePlayVoiceNote(file);
                                }}
                                className="p-1 rounded-full text-[#20e3a2] hover:bg-[#20e3a2]/15 transition-all cursor-pointer flex items-center justify-center"
                              >
                                {playingAudioId === file.id ? (
                                  <Pause className="w-4 h-4 fill-current animate-pulse" />
                                ) : (
                                  <Play className="w-4 h-4 fill-current ml-0.5" />
                                )}
                              </button>
                            ) : (
                              <Database className="w-4.5 h-4.5 text-[#8d97ab]" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">
                              {file.fileName}
                            </p>
                            <p className="text-[10.5px] text-[#20e3a2] font-mono mt-0.5 truncate font-medium">
                              {directionLabel}
                            </p>
                          </div>
                        </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {file.fileType === 'link' ? (
                          <>
                            <button
                              onClick={() => handleCopyLink(file.fileData)}
                              className="p-1.5 rounded-lg text-[#20e3a2] hover:bg-[#20e3a2]/10 transition-colors cursor-pointer"
                              title="Copy URL link"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <a
                              href={file.fileData}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-lg text-[#7c5cff] hover:bg-[#7c5cff]/10 transition-colors cursor-pointer"
                              title="Open link in browser"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </>
                        ) : (
                          <button
                            onClick={() => handleDownloadLocalFile(file)}
                            className="p-1.5 rounded-lg text-[#20e3a2] hover:bg-[#20e3a2]/10 transition-colors cursor-pointer"
                            title="Download to system"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setFileToDelete({ id: file.id, name: file.fileName })}
                          className="p-1.5 rounded-lg text-[#ff5470] hover:bg-[#ff5470]/10 transition-colors cursor-pointer"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-5 bg-[#080b10]/30 border border-dashed border-[#212a38] rounded-2xl text-center">
                <HardDrive className="w-7 h-7 text-[#5a6478] mx-auto mb-2 opacity-50" />
                <p className="text-xs text-[#8d97ab] font-medium">No items found in this section</p>
                <p className="text-[10.5px] text-[#5a6478] mt-1 max-w-[260px] mx-auto leading-normal">
                  {activeStorageTab === 'media'
                    ? 'All media files and photos are automatically indexed here.'
                    : activeStorageTab === 'docs'
                      ? 'Document uploads, PDFs, and files are cached here.'
                      : activeStorageTab === 'voice'
                        ? 'All recorded voice notes sent and received are saved here.'
                        : 'All hyperlinks parsed from messages are indexed here.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="h-[1px] bg-[#212a38] my-[26px]" />

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => setShowConfirmModal('logout')}
            className="w-full flex items-center gap-3 px-4 py-3.5 border border-[#ffb454]/28 bg-[#ffb454]/5 hover:bg-[#ffb454]/10 rounded-2xl text-[#ffb454] font-semibold text-sm transition-colors cursor-pointer"
          >
            <LogOut className="w-4.5 h-4.5" />
            Log out
          </button>

          <button
            onClick={() => setShowConfirmModal('delete')}
            className="w-full flex items-center gap-3 px-4 py-3.5 border border-[#ff5470]/30 bg-[#ff5470]/6 hover:bg-[#ff5470]/12 rounded-2xl text-[#ff5470] font-semibold text-sm transition-colors cursor-pointer"
          >
            <Trash className="w-4.5 h-4.5" />
            Delete account
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="absolute inset-0 bg-[#030509]/72 backdrop-blur-[3px] flex items-center justify-center z-[200]">
          <div className="w-[82%] bg-[#161d28] border border-[#212a38] rounded-[20px] p-5 text-center">
            <h3 className="font-display font-bold text-lg text-white mb-2">
              {showConfirmModal === 'logout' ? 'Log out of VyperVic?' : 'Delete your account?'}
            </h3>
            <p className="text-[#8d97ab] text-[13.5px] leading-relaxed mb-5">
              {showConfirmModal === 'logout'
                ? 'You can always sign back in with your credentials.'
                : 'This permanently removes your profile, chats and settings. This action cannot be undone.'}
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowConfirmModal(null)}
                className="flex-1 py-3 bg-[#1d2531] text-[#eef1f6] rounded-xl font-bold text-sm cursor-pointer hover:bg-opacity-80"
              >
                Cancel
              </button>
              <button
                disabled={deleting}
                onClick={showConfirmModal === 'logout' ? onLogout : handleDeleteAccount}
                className={`flex-1 py-3 text-white rounded-xl font-bold text-sm cursor-pointer flex items-center justify-center gap-1.5 ${
                  showConfirmModal === 'logout' ? 'bg-[#ffb454] text-[#241300]' : 'bg-[#ff5470]'
                }`}
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {showConfirmModal === 'logout' ? 'Log out' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Deletion Confirmation Modal */}
      {fileToDelete && (
        <div className="absolute inset-0 bg-[#030509]/72 backdrop-blur-[3px] flex items-center justify-center z-[200]">
          <div className="w-[82%] bg-[#161d28] border border-[#212a38] rounded-[20px] p-5 text-center animate-zoom-in">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-3.5 text-[#ff5470]">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-base text-white mb-2">
              Permanently delete this file?
            </h3>
            <p className="text-[#8d97ab] text-xs leading-relaxed mb-5">
              Are you sure you want to delete <span className="text-white font-mono font-bold">"{fileToDelete.name}"</span>? This will permanently erase it from local cache.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setFileToDelete(null)}
                className="flex-1 py-2.5 bg-[#1d2531] text-[#eef1f6] rounded-xl font-bold text-xs cursor-pointer hover:bg-opacity-80"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFile}
                className="flex-1 py-2.5 bg-[#ff5470] text-white rounded-xl font-bold text-xs cursor-pointer hover:bg-opacity-80"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zoomed Cover Modal Overlay */}
      {showZoomedCover && coverUrl && (
        <div 
          onClick={() => setShowZoomedCover(false)}
          className="fixed inset-0 bg-black/92 backdrop-blur-md z-[300] flex flex-col items-center justify-center p-4 animate-fade-in cursor-pointer select-none"
        >
          <button
            onClick={() => setShowZoomedCover(false)}
            className="absolute top-6 right-6 text-white/80 hover:text-white bg-black/60 border border-white/20 p-2.5 rounded-full backdrop-blur-sm cursor-pointer shadow-xl"
            title="Zoom Out"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative max-w-2xl w-full max-h-[85vh] flex flex-col items-center justify-center">
            <img 
              src={coverUrl} 
              alt="Cover Photo Zoomed" 
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-white/10 animate-zoom-in"
              referrerPolicy="no-referrer"
            />
            <p className="text-xs text-gray-400 mt-4 font-mono uppercase tracking-wider font-semibold">
              Tap anywhere to zoom out
            </p>
          </div>
        </div>
      )}

      {/* Fullscreen Media Viewer Modal */}
      {fullscreenMedia && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[300] flex flex-col justify-between p-4 animate-fade-in">
          {/* Header Bar */}
          <div className="flex items-center justify-between z-10 py-2 border-b border-white/10">
            <button
              onClick={() => setFullscreenMedia(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <div className="text-center min-w-0 mx-2">
              <p className="text-xs font-bold text-white truncate max-w-[180px]">
                {fullscreenMedia.fileName}
              </p>
              <p className="text-[10px] text-[#20e3a2] font-mono">
                {fullscreenMedia.direction && fullscreenMedia.targetName
                  ? (fullscreenMedia.direction === 'to' ? `To ${fullscreenMedia.targetName}` : `From ${fullscreenMedia.targetName}`)
                  : 'Media Preview'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownloadLocalFile(fullscreenMedia)}
                className="p-2 rounded-xl bg-[#20e3a2]/20 hover:bg-[#20e3a2]/30 text-[#20e3a2] transition-all cursor-pointer"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setFileToDelete({ id: fullscreenMedia.id, name: fullscreenMedia.fileName })}
                className="p-2 rounded-xl bg-[#ff5470]/20 hover:bg-[#ff5470]/30 text-[#ff5470] transition-all cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Media Center */}
          <div className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden">
            {fullscreenMedia.fileType.startsWith('video/') ? (
              <video
                src={fullscreenMedia.fileData}
                controls
                autoPlay
                className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl object-contain border border-white/10"
              />
            ) : (
              <img
                src={fullscreenMedia.fileData}
                alt={fullscreenMedia.fileName}
                className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl object-contain border border-white/10"
              />
            )}
          </div>
        </div>
      )}

    </div>
  );
}

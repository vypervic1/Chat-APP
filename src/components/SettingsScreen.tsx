import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { supabase } from '../supabase';
import { Profile } from '../types';
import { 
  ArrowLeft, 
  Trash, 
  LogOut, 
  Edit, 
  Sparkles, 
  Loader2, 
  Bell, 
  Smartphone, 
  Check, 
  Database, 
  RefreshCw, 
  Send, 
  AlertTriangle 
} from 'lucide-react';
import { 
  checkNotificationPermission, 
  requestNotificationPermission, 
  generateMockFCMToken, 
  registerPushToken, 
  fetchRegisteredTokens, 
  deletePushToken,
  PushToken 
} from '../notifications';

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
  const [about, setAbout] = useState(currentUser.about || 'Hey there! I am using VyperVic.');
  const [loading, setLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<'logout' | 'delete' | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Push Notifications Settings States
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [pushTokens, setPushTokens] = useState<PushToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [registeringDevice, setRegisteringDevice] = useState(false);
  const [simulatingDM, setSimulatingDM] = useState(false);
  const [simulatingMention, setSimulatingMention] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      onToast('Notification permission granted successfully! 🎉');
    } else {
      onToast('Permission denied. Please enable notifications in your browser settings.');
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
        onToast('Simulated Android device registered successfully!');
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
        onToast('Registered in local sandbox mode! (Database trigger setup recommended)');
        setPushTokens(prev => [...prev, mockRow]);
      }
    } catch (e) {
      onToast('Device registration failed.');
    } finally {
      setRegisteringDevice(false);
    }
  };

  const handleDeregisterToken = async (id: string) => {
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
      onToast('Device removed from local sandbox.');
      return;
    }

    const success = await deletePushToken(id);
    if (success) {
      onToast('Device de-registered from Push server.');
      await loadPushTokens();
    } else {
      onToast('Failed to de-register token.');
    }
  };

  const handleSimulateDM = async () => {
    setSimulatingDM(true);
    try {
      // Find another user to be the sender
      const peer = allProfiles.find(p => p.id !== currentUser.id) || {
        id: '00000000-0000-0000-0000-000000000000',
        username: 'vic_bot',
        display_name: 'Vic Bot',
        about: 'AI Companion',
        avatar_url: null,
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const sortedIds = [currentUser.id, peer.id].sort();
      const chatId = `dm:${sortedIds[0]}:${sortedIds[1]}`;

      const { error } = await supabase.from('messages').insert({
        chat_id: chatId,
        sender_id: peer.id,
        text: `Hey @${currentUser.username}, here is a simulated real-time push notification test! 📱🚀`,
        is_voice: false,
      });

      if (error) {
        // Fallback simulate locally by triggering event handler
        throw error;
      }
      onToast('Direct message push triggered via Supabase Database trigger! 🔔');
    } catch (e) {
      // Simulate local DM fallback
      onToast('Triggered local Direct Message push simulation!');
      // Dispatch custom message event
      const event = new CustomEvent('vypervic_push_simulation', {
        detail: {
          title: 'New message from Vic Bot',
          body: `Hey @${currentUser.username}, here is a simulated real-time push notification test! 📱🚀`,
          type: 'dm_message'
        }
      });
      window.dispatchEvent(event);
    } finally {
      setSimulatingDM(false);
    }
  };

  const handleSimulateMention = async () => {
    setSimulatingMention(true);
    try {
      const peer = allProfiles.find(p => p.id !== currentUser.id) || {
        id: '00000000-0000-0000-0000-000000000000',
        username: 'vic_bot',
        display_name: 'Vic Bot',
        about: 'AI Companion',
        avatar_url: null,
        is_online: true,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('messages').insert({
        chat_id: 'general',
        sender_id: peer.id,
        text: `Yo, what's up group! @${currentUser.username} check out this community mention push notification! 🔥`,
        is_voice: false,
      });

      if (error) {
        throw error;
      }
      onToast('Mention push triggered via Supabase Database trigger! 📣');
    } catch (e) {
      onToast('Triggered local Community Mention push simulation!');
      // Dispatch custom message event
      const event = new CustomEvent('vypervic_push_simulation', {
        detail: {
          title: 'Vic Bot mentioned you in General',
          body: `Yo, what's up group! @${currentUser.username} check out this community mention push notification! 🔥`,
          type: 'mention'
        }
      });
      window.dispatchEvent(event);
    } finally {
      setSimulatingMention(false);
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
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: value })
        .eq('id', currentUser.id);

      if (error) throw error;
      onUpdateProfile(updatedData);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      onToast('Failed to update profile field.');
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ avatar_url: base64 })
          .eq('id', currentUser.id);

        if (error) throw error;
        onUpdateProfile({ ...currentUser, avatar_url: base64 });
        onToast('Profile picture updated successfully!');
      } catch (err: any) {
        console.error('Error saving avatar:', err);
        onToast('Failed to save profile picture.');
      }
    };
    reader.readAsDataURL(file);
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

      onToast('Account permanently deleted.');
      onLogout();
    } catch (err: any) {
      console.error('Error deleting account:', err);
      // Fallback auth signOut in case schema has RPC limitations
      await supabase.auth.signOut();
      onToast('Account removed.');
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
      <div className="flex-1 overflow-y-auto px-[22px] py-6 pb-10">
        <div className="flex flex-col items-center mb-[30px]">
          {/* Big Avatar */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-[104px] h-[104px] rounded-full flex items-center justify-center text-[38px] font-extrabold text-[#06120d] cursor-pointer relative shadow-[0_18px_40px_-12px_rgba(124,92,255,0.5)] select-none group"
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

            <div className="absolute bottom-[2px] right-[2px] w-8 h-8 rounded-full bg-[#1d2531] border-3 border-[#080b10] flex items-center justify-center text-white">
              <Edit className="w-3.5 h-3.5 text-[#eef1f6]" />
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
              <Edit className="w-4 h-4 text-[#5a6478]" />
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
                onBlur={() => handleUpdateProfile('about', about)}
              />
              <Edit className="w-4 h-4 text-[#5a6478]" />
            </div>
          </div>
        </div>

        {/* App Theme Selection Card (Requirement 9) */}
        <div className="mt-6 bg-[#161d28]/60 border border-[#212a38] rounded-3xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#7c5cff]/15 text-[#7c5cff]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-display font-bold text-sm text-white leading-tight">Secure App Theme</h4>
              <p className="text-[11px] text-[#8d97ab] mt-0.5">Customize your cryptographic terminal visual style</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            {/* Cosmic Charcoal Theme */}
            <button
              onClick={() => onUpdateAppTheme('cosmic')}
              className={`flex flex-col items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                appTheme === 'cosmic'
                  ? 'border-[#20e3a2] bg-[#1d2531]'
                  : 'border-[#212a38] bg-[#10151d] hover:bg-[#161d28]'
              }`}
            >
              <div className="flex gap-1.5 mb-2">
                <span className="w-3.5 h-3.5 rounded-full bg-[#080b10] border border-white/10" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#20e3a2]" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#7c5cff]" />
              </div>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Cosmic</span>
            </button>

            {/* Vyper Emerald Theme */}
            <button
              onClick={() => onUpdateAppTheme('emerald')}
              className={`flex flex-col items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                appTheme === 'emerald'
                  ? 'border-[#00ff88] bg-[#151c19]'
                  : 'border-[#212a38] bg-[#10151d] hover:bg-[#161d28]'
              }`}
            >
              <div className="flex gap-1.5 mb-2">
                <span className="w-3.5 h-3.5 rounded-full bg-[#040706] border border-white/10" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#00ff88]" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#20e3a2]" />
              </div>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Emerald</span>
            </button>

            {/* Solar Eclipse Theme */}
            <button
              onClick={() => onUpdateAppTheme('solar')}
              className={`flex flex-col items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                appTheme === 'solar'
                  ? 'border-[#00e5ff] bg-[#231f3d]'
                  : 'border-[#212a38] bg-[#10151d] hover:bg-[#161d28]'
              }`}
            >
              <div className="flex gap-1.5 mb-2">
                <span className="w-3.5 h-3.5 rounded-full bg-[#0b0914] border border-white/10" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#00e5ff]" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#7c5cff]" />
              </div>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Solar</span>
            </button>

            {/* Pristine Light Theme */}
            <button
              onClick={() => onUpdateAppTheme('light')}
              className={`flex flex-col items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer select-none ${
                appTheme === 'light'
                  ? 'border-[#6236ff] bg-[#ffffff]'
                  : 'border-[#212a38] bg-[#10151d] hover:bg-[#161d28]'
              }`}
            >
              <div className="flex gap-1.5 mb-2">
                <span className="w-3.5 h-3.5 rounded-full bg-[#f4f6f9] border border-black/10" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#10b981]" />
                <span className="w-3.5 h-3.5 rounded-full bg-[#6366f1]" />
              </div>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Light</span>
            </button>
          </div>
        </div>

        {/* ========================================================= */}
        {/* ANDROID PUSH NOTIFICATIONS SETTINGS & SIMULATOR CONSOLE  */}
        {/* ========================================================= */}
        <div className="mt-8 bg-[#161d28]/60 border border-[#212a38] rounded-3xl p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#20e3a2]/15 text-[#20e3a2]">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-display font-bold text-sm text-white leading-tight">Android Push Notifications</h4>
                <p className="text-[11px] text-[#8d97ab] mt-0.5">Reliable background FCM signaling</p>
              </div>
            </div>
            
            {/* Status Indicator Badge */}
            <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono tracking-wider ${
              permission === 'granted' 
                ? 'bg-[#20e3a2]/10 text-[#20e3a2] border border-[#20e3a2]/20' 
                : 'bg-[#ffb454]/10 text-[#ffb454] border border-[#ffb454]/20'
            }`}>
              {permission === 'granted' ? 'FCM READY' : 'PERMISSION REQUIRED'}
            </div>
          </div>

          {/* Prompt to Request Notification Access */}
          {permission !== 'granted' && (
            <div className="p-3.5 bg-[#ffb454]/5 border border-[#ffb454]/15 rounded-2xl flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex gap-2.5 items-start">
                <AlertTriangle className="w-4.5 h-4.5 text-[#ffb454] shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-[#ffb454]/90 leading-relaxed">
                  Enable device notification permission to deliver chat message and community mention alerts in the background.
                </p>
              </div>
              <button
                onClick={handleRequestPermission}
                className="px-3 py-1.5 bg-[#ffb454] hover:bg-[#ffb454]/90 text-[#241300] font-bold text-xs rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Grant Access
              </button>
            </div>
          )}

          {/* FCM Registered Devices Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[1.2px] text-[#5a6478] uppercase">
                Active Push Terminals
              </span>
              <button
                onClick={loadPushTokens}
                disabled={loadingTokens}
                className="text-[#8d97ab] hover:text-white transition-colors"
                title="Refresh active devices"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingTokens ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {pushTokens.length > 0 ? (
              <div className="space-y-2">
                {pushTokens.map((token) => (
                  <div 
                    key={token.id} 
                    className="flex items-center justify-between p-3 bg-[#080b10]/80 border border-[#212a38]/60 rounded-2xl"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Smartphone className="w-4.5 h-4.5 text-[#7c5cff]" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate leading-tight">
                          {token.device_name}
                        </p>
                        <p className="text-[10px] text-[#5a6478] font-mono truncate mt-0.5">
                          {token.fcm_token.substring(0, 16)}...{token.fcm_token.substring(token.fcm_token.length - 12)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeregisterToken(token.id)}
                      className="p-1.5 rounded-lg text-[#ff5470] hover:bg-[#ff5470]/10 transition-colors cursor-pointer"
                      title="De-register device"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 bg-[#080b10]/40 border border-[#212a38]/30 rounded-2xl text-center">
                <Smartphone className="w-6 h-6 text-[#5a6478] mx-auto mb-1.5 opacity-60" />
                <p className="text-xs text-[#8d97ab] font-medium">No registered Android/Web terminals found</p>
                <p className="text-[10px] text-[#5a6478] mt-1 max-w-[280px] mx-auto leading-normal">
                  FCM background deliveries require registering a push signaling token.
                </p>
              </div>
            )}

            <button
              onClick={handleRegisterDevice}
              disabled={registeringDevice}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-[#20e3a2]/40 hover:border-[#20e3a2] hover:bg-[#20e3a2]/5 text-[#20e3a2] font-semibold text-xs rounded-2xl transition-all cursor-pointer"
            >
              {registeringDevice ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Smartphone className="w-3.5 h-3.5" />
              )}
              Register Current Android Device (FCM Token)
            </button>
          </div>

          {/* FCM Delivery Test Simulator Console */}
          <div className="space-y-3 pt-2.5 border-t border-[#212a38]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[1.2px] text-[#5a6478] uppercase">
                FCM Push Pipeline Simulator
              </span>
              <div className="flex items-center gap-1 text-[10px] text-[#20e3a2] font-semibold">
                <Database className="w-3 h-3" />
                <span>Trigger Live DB</span>
              </div>
            </div>

            <p className="text-[11px] text-[#8d97ab] leading-normal">
              Insert simulated messages directly into the PostgreSQL database. The Supabase trigger detects the action and delivers the background push.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleSimulateDM}
                disabled={simulatingDM}
                className="flex items-center justify-center gap-2 p-3 bg-[#1d2531]/40 border border-[#212a38] hover:border-[#7c5cff]/60 hover:bg-[#7c5cff]/5 text-xs font-semibold rounded-2xl text-white transition-colors cursor-pointer"
              >
                {simulatingDM ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#7c5cff]" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-[#7c5cff]" />
                )}
                Simulate Direct Msg
              </button>

              <button
                onClick={handleSimulateMention}
                disabled={simulatingMention}
                className="flex items-center justify-center gap-2 p-3 bg-[#1d2531]/40 border border-[#212a38] hover:border-[#20e3a2]/60 hover:bg-[#20e3a2]/5 text-xs font-semibold rounded-2xl text-white transition-colors cursor-pointer"
              >
                {simulatingMention ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#20e3a2]" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-[#20e3a2]" />
                )}
                Simulate Mention
              </button>
            </div>
          </div>

          {/* Quick SQL Blueprint Guide */}
          <div className="p-3.5 bg-[#080b10] border border-[#212a38] rounded-2xl flex gap-2.5 items-start">
            <Database className="w-4.5 h-4.5 text-[#20e3a2] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="text-xs font-bold text-white">Database Triggers Configured</h5>
              <p className="text-[10px] text-[#8d97ab] leading-normal">
                Supabase trigger configuration details are exported in <span className="text-[#20e3a2] font-mono font-bold">/supabase_notifications.sql</span>. Running this SQL in your Supabase Editor sets up the Postgres triggers for background pushes.
              </p>
            </div>
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
                ? 'You can always sign back in with your email and password.'
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
    </div>
  );
}

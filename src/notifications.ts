import { supabase } from './supabase';
import { Profile } from './types';

export interface PushToken {
  id: string;
  user_id: string;
  fcm_token: string;
  device_name: string;
  is_active: boolean;
  created_at: string;
}

export interface TriggeredPush {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: 'dm_message' | 'mention';
  status: string;
  created_at: string;
}

// Check if user has notification permissions
export function checkNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}

// Request permission for push notifications
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
    return 'default';
  }
}

// Generate a random mocked Android FCM token
export function generateMockFCMToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = 'fcm_token_vyper_';
  for (let i = 0; i < 140; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Register or update device push token in Supabase
export async function registerPushToken(
  userId: string,
  token: string,
  deviceName: string = 'Android Device (Simulated)'
): Promise<{ success: boolean; error?: any }> {
  try {
    // Attempt to upsert the push token in user_push_tokens
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        {
          user_id: userId,
          fcm_token: token,
          device_name: deviceName,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fcm_token' }
      );

    if (error) {
      console.warn('Could not save push token to database (table user_push_tokens may not be created yet):', error);
      return { success: false, error };
    }
    return { success: true };
  } catch (err) {
    console.error('Exception registering push token:', err);
    return { success: false, error: err };
  }
}

// Fetch registered push tokens for a user from Supabase
export async function fetchRegisteredTokens(userId: string): Promise<PushToken[]> {
  try {
    const { data, error } = await supabase
      .from('user_push_tokens')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      // Fallback silently if table does not exist
      return [];
    }
    return data || [];
  } catch (err) {
    return [];
  }
}

// Delete or toggle a push token
export async function deletePushToken(tokenId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_push_tokens')
      .delete()
      .eq('id', tokenId);
    return !error;
  } catch (err) {
    return false;
  }
}

// Helper to raise browser notification or play ambient Android sound
export function displayLocalPushNotification(title: string, body: string, iconUrl?: string | null) {
  // 1. Browser Native Notification
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: iconUrl || '/assets/vypervic_logo.png',
        tag: 'vypervic-push',
      });
    } catch (e) {
      console.warn('Native notification failed:', e);
    }
  }

  // 2. Play ambient Android notification sound (subtle beep)
  try {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = context.createOscillator();
    const gain = context.createGain();
    
    osc.connect(gain);
    gain.connect(context.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, context.currentTime); // High pitch notification bell
    gain.gain.setValueAtTime(0.08, context.currentTime);
    
    // Quick dual-chime "ding ding"
    osc.start();
    osc.frequency.setValueAtTime(1500, context.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3);
    osc.stop(context.currentTime + 0.3);
  } catch (audioErr) {
    // Browser audio policy might block until user interaction, skip silently
  }
}

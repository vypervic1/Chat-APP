export interface Profile {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  about: string | null;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
  created_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string | null;
  file_name: string | null;
  file_type: string | null;
  file_data: string | null; // Base64 representation of attachments or voice notes
  is_voice: boolean;
  created_at: string;
  profiles?: Profile; // Joined profile of the sender
}

export interface Call {
  id: string;
  caller_id: string;
  receiver_id: string;
  type: 'voice' | 'video';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended';
  signal_data: string | null;
  created_at: string;
  updated_at: string;
  caller?: Profile;
  receiver?: Profile;
}

export interface PushNotification {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  title: string;
  body: string;
  isMention: boolean;
  timestamp: string;
}

export interface ThemeConfig {
  type: 'solid' | 'gradient' | 'image';
  value: string;
  brightness?: number; // 10 to 100
  zoom?: number; // 1.0 to 3.0
  offsetX?: number; // -100 to 100
  offsetY?: number; // -100 to 100
}

export interface Group {
  id: string; // group:id
  name: string;
  icon: string;
  creator_id: string;
  members: string[]; // list of profile IDs
  theme?: ThemeConfig;
  created_at: string;
  description?: string;
  cover_url?: string;
  admins?: string[]; // list of profile IDs who are admins
}


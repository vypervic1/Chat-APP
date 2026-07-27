import { supabase } from '../supabase';
import { Message } from '../types';

const QUEUE_KEY = 'vyper_offline_msg_queue';

export function getOfflineQueue(): Message[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function queueOfflineMessage(msg: Message) {
  try {
    const queue = getOfflineQueue();
    // Avoid duplicate IDs
    if (!queue.some((m) => m.id === msg.id)) {
      const updated = [...queue, { ...msg, is_pending: true }];
      localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
    }
  } catch (e) {
    console.error('Failed to queue offline message:', e);
  }
}

export function removeOfflineMessage(msgId: string) {
  try {
    const queue = getOfflineQueue();
    const updated = queue.filter((m) => m.id !== msgId);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to remove queued message:', e);
  }
}

export async function flushOfflineQueue(onSynced?: (syncedMsgId: string) => void) {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  for (const msg of queue) {
    try {
      const dbPayload = {
        id: msg.id,
        chat_id: msg.chat_id,
        sender_id: msg.sender_id,
        text: msg.text || null,
        file_name: msg.file_name || null,
        file_type: msg.file_type || null,
        file_data: msg.file_data || null,
        is_voice: !!msg.is_voice,
      };

      const { error } = await supabase.from('messages').insert(dbPayload);
      if (!error) {
        removeOfflineMessage(msg.id);
        if (onSynced) onSynced(msg.id);
      }
    } catch (e) {
      console.warn('Failed sync attempt for message:', msg.id, e);
    }
  }
}

// Auto-sync listener
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineQueue();
  });
}

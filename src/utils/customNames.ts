import { Profile } from '../types';

export function getContactDisplayName(profile: Profile | null | undefined): string {
  if (!profile) return 'Unknown User';
  const saved = localStorage.getItem('vyper_custom_display_names');
  if (saved) {
    try {
      const map = JSON.parse(saved);
      if (map[profile.id]) {
        return map[profile.id];
      }
    } catch (e) {
      console.error(e);
    }
  }
  return profile.display_name || profile.username || 'Unknown User';
}

export function isUserOnline(profile: Profile | null | undefined): boolean {
  if (!profile) return false;
  if (!profile.is_online) return false;
  if (!profile.last_seen) return false;
  // If last_seen is within the last 120 seconds, they are active
  const diffMs = Date.now() - new Date(profile.last_seen).getTime();
  return diffMs < 120 * 1000;
}

export function formatLastSeen(profile: Profile | null | undefined): string {
  if (!profile) return 'offline';
  if (isUserOnline(profile)) return 'online';
  if (!profile.last_seen) return 'last seen recently';

  const date = new Date(profile.last_seen);
  if (isNaN(date.getTime())) return 'last seen recently';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return `last seen today at ${timeStr}`;
  } else {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return `last seen ${day} ${month} at ${timeStr}`;
  }
}

export function parseProfileAbout(aboutStr: string | null, userId?: string) {
  let thinking: string | null = null;
  let coverUrl: string | null = null;
  let about = aboutStr || '';

  // Check local cache fallback first if userId provided
  if (userId) {
    try {
      const cachedCover = localStorage.getItem(`vyper_cover_${userId}`);
      if (cachedCover) {
        coverUrl = cachedCover;
      }
    } catch (e) {}
  }

  // Parse thinking if present at the start
  const thinkingMatch = about.match(/^\[thinking:(.*?)\]/);
  if (thinkingMatch) {
    try {
      thinking = decodeURIComponent(thinkingMatch[1]);
    } catch (e) {
      thinking = thinkingMatch[1];
    }
    about = about.substring(thinkingMatch[0].length);
  }

  // Parse coverUrl if present and not already found locally
  const coverMatch = about.match(/^\[cover:([\s\S]*?)\]/);
  if (coverMatch) {
    if (!coverUrl) {
      try {
        coverUrl = decodeURIComponent(coverMatch[1]);
      } catch (e) {
        coverUrl = coverMatch[1];
      }
    }
    about = about.substring(coverMatch[0].length);
  }

  if (!about && !thinking && !coverUrl) {
    about = '';
  }

  return { thinking, coverUrl, about };
}

export function buildProfileAbout(thinking: string | null, coverUrl: string | null, about: string) {
  let result = '';
  if (thinking && thinking.trim()) {
    result += `[thinking:${encodeURIComponent(thinking.trim())}]`;
  }
  if (coverUrl && coverUrl.trim()) {
    result += `[cover:${encodeURIComponent(coverUrl.trim())}]`;
  }
  result += about;
  return result;
}

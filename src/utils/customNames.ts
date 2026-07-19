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

export function parseProfileAbout(aboutStr: string | null) {
  if (!aboutStr) return { thinking: null, about: '' };
  const match = aboutStr.match(/^\[thinking:(.*?)\](.*)$/);
  if (match) {
    return {
      thinking: match[1],
      about: match[2] || 'Hey there!'
    };
  }
  return { thinking: null, about: aboutStr };
}

export function buildProfileAbout(thinking: string | null, about: string) {
  const cleanThinking = thinking ? thinking.substring(0, 40) : '';
  if (cleanThinking) {
    return `[thinking:${cleanThinking}]${about}`;
  }
  return about;
}

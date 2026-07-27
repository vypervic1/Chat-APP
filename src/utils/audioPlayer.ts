// Global singleton audio player for persistent voice note playback across screens
class GlobalAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentMsgId: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.onended = () => {
        this.currentMsgId = null;
        this.notify();
      };
      this.audio.onpause = () => {
        this.notify();
      };
      this.audio.onplay = () => {
        this.notify();
      };
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public togglePlay(msgId: string, src: string) {
    if (!this.audio) return;
    if (this.currentMsgId === msgId && !this.audio.paused) {
      this.pause();
      return;
    }
    this.currentMsgId = msgId;
    this.audio.src = src;
    this.audio.play().catch((err) => {
      console.warn('Audio playback error:', err);
    });
    this.notify();
  }

  public pause() {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.notify();
    }
  }

  public isPlaying(msgId?: string): boolean {
    if (!this.audio) return false;
    if (msgId) {
      return this.currentMsgId === msgId && !this.audio.paused;
    }
    return !this.audio.paused;
  }

  public getCurrentMsgId(): string | null {
    return this.currentMsgId;
  }
}

export const globalAudioPlayer = new GlobalAudioPlayer();

// Clean Web Audio API sound for audio recording start/stop
export function playRecordSound(type: 'start' | 'stop') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'start') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.14);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.14);
    }
  } catch (e) {
    // Ignore context errors
  }
}

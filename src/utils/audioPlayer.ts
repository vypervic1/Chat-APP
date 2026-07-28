// Global singleton audio player for persistent voice note playback across screens
export interface AudioMetadata {
  msgId: string;
  title: string;
  senderName?: string;
  chatId?: string | null;
}

class GlobalAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentMetadata: AudioMetadata | null = null;
  private playbackRate: number = 1;
  private currentTime: number = 0;
  private duration: number = 0;
  private listeners: Set<() => void> = new Set();
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.preload = 'metadata';

      this.audio.onended = () => {
        this.notify();
      };
      this.audio.onpause = () => {
        this.notify();
      };
      this.audio.onplay = () => {
        this.notify();
      };
      this.audio.ontimeupdate = () => {
        if (this.audio) {
          this.currentTime = this.audio.currentTime;
          this.duration = this.audio.duration || 0;
        }
        this.notify();
      };
      this.audio.onloadedmetadata = () => {
        if (this.audio) {
          this.duration = this.audio.duration || 0;
        }
        this.notify();
      };
      this.audio.onratechange = () => {
        if (this.audio) {
          this.playbackRate = this.audio.playbackRate;
        }
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

  private initAudioContext() {
    if (typeof window === 'undefined' || this.audioCtx || !this.audio) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
      
      // Note: createMediaElementSource can throw if cross-origin without CORS, handle gracefully
      try {
        this.mediaSource = this.audioCtx.createMediaElementSource(this.audio);
        this.mediaSource.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
      } catch (e) {
        // Fallback: Web Audio media source failed or already connected
      }
    } catch (e) {
      // AudioContext init error ignored
    }
  }

  public togglePlay(msgId: string, src: string, metadata?: Partial<AudioMetadata>) {
    if (!this.audio) return;

    if (this.currentMetadata?.msgId === msgId) {
      if (!this.audio.paused) {
        this.pause();
      } else {
        this.resume();
      }
      return;
    }

    this.currentMetadata = {
      msgId,
      title: metadata?.title || 'Voice Note',
      senderName: metadata?.senderName,
      chatId: metadata?.chatId || null,
    };

    this.audio.src = src;
    this.audio.playbackRate = this.playbackRate;
    this.currentTime = 0;
    
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.audio.play().catch((err) => {
      console.warn('Audio playback error:', err);
    });
    this.notify();
  }

  public resume() {
    if (!this.audio) return;
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.audio.play().catch((err) => {
      console.warn('Audio resume error:', err);
    });
    this.notify();
  }

  public pause() {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
      this.notify();
    }
  }

  public stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.currentMetadata = null;
      this.currentTime = 0;
      this.notify();
    }
  }

  public seek(seconds: number) {
    if (this.audio && isFinite(seconds)) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 0));
      this.currentTime = this.audio.currentTime;
      this.notify();
    }
  }

  public setPlaybackRate(rate: number) {
    this.playbackRate = rate;
    if (this.audio) {
      this.audio.playbackRate = rate;
    }
    this.notify();
  }

  public cyclePlaybackRate(): number {
    const nextRate = this.playbackRate === 1 ? 1.5 : this.playbackRate === 1.5 ? 2 : 1;
    this.setPlaybackRate(nextRate);
    return nextRate;
  }

  public isPlaying(msgId?: string): boolean {
    if (!this.audio) return false;
    if (msgId) {
      return this.currentMetadata?.msgId === msgId && !this.audio.paused;
    }
    return !this.audio.paused;
  }

  public hasActiveAudio(): boolean {
    return !!this.currentMetadata && !!this.audio && (!this.audio.paused || this.audio.currentTime > 0);
  }

  public getCurrentMsgId(): string | null {
    return this.currentMetadata?.msgId || null;
  }

  public getMetadata(): AudioMetadata | null {
    return this.currentMetadata;
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getDuration(): number {
    return this.duration;
  }

  public getFrequencyData(array: Uint8Array): boolean {
    if (this.analyser) {
      this.analyser.getByteFrequencyData(array);
      return true;
    }
    return false;
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


import React, { useState, useEffect } from 'react';
import { Play, Pause, X, Volume2, FastForward } from 'lucide-react';
import { globalAudioPlayer } from '../utils/audioPlayer';
import { AudioWaveformCanvas } from './AudioWaveformCanvas';

interface GlobalAudioBannerProps {
  onNavigateToChat?: (chatId: string) => void;
  currentActiveScreen?: string;
  currentChatId?: string | null;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const GlobalAudioBanner: React.FC<GlobalAudioBannerProps> = ({ 
  onNavigateToChat,
  currentActiveScreen,
  currentChatId,
}) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = globalAudioPlayer.subscribe(() => {
      setTick((t) => t + 1);
    });
    return () => unsub();
  }, []);

  if (!globalAudioPlayer.hasActiveAudio()) {
    return null;
  }

  const metadata = globalAudioPlayer.getMetadata();

  // Hide the persistent banner if user is currently inside the active chat room where the audio was played
  if (currentActiveScreen === 'chat' && metadata?.chatId && currentChatId === metadata.chatId) {
    return null;
  }
  const isPlaying = globalAudioPlayer.isPlaying();
  const currentTime = globalAudioPlayer.getCurrentTime();
  const duration = globalAudioPlayer.getDuration();
  const playbackRate = globalAudioPlayer.getPlaybackRate();
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const handleTitleClick = () => {
    if (metadata?.chatId && onNavigateToChat) {
      onNavigateToChat(metadata.chatId);
    }
  };

  const handleCycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    globalAudioPlayer.cyclePlaybackRate();
  };

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      globalAudioPlayer.pause();
    } else {
      globalAudioPlayer.resume();
    }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    globalAudioPlayer.stop();
  };

  const handleSeek = (ratio: number) => {
    if (duration > 0) {
      globalAudioPlayer.seek(ratio * duration);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] max-w-2xl mx-auto px-3 pt-[calc(var(--safe-top)+4px)] pb-1 pointer-events-none">
      <div 
        onClick={handleTitleClick}
        className={`pointer-events-auto bg-[#131923]/95 backdrop-blur-xl border border-[#20e3a2]/40 rounded-2xl p-2.5 px-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3 text-white transition-all animate-fade-in ${
          metadata?.chatId ? 'cursor-pointer hover:border-[#20e3a2]/80' : ''
        }`}
      >
        {/* Left info & icon */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-[#20e3a2]/15 border border-[#20e3a2]/30 flex items-center justify-center shrink-0 text-[#20e3a2]">
            <Volume2 className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate leading-tight">
                {metadata?.title || 'Voice Note'}
              </span>
              {metadata?.senderName && (
                <span className="text-[10px] text-[#20e3a2] font-semibold truncate">
                  • {metadata.senderName}
                </span>
              )}
            </div>
            <div className="text-[9.5px] text-[#8d97ab] font-mono mt-0.5 flex items-center gap-1.5">
              <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              {metadata?.chatId && (
                <span className="text-[#20e3a2] text-[9px] font-sans font-bold underline">
                  Tap to view chat
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center waveform visualizer */}
        <div className="hidden sm:block shrink-0 px-1" onClick={(e) => e.stopPropagation()}>
          <AudioWaveformCanvas
            isPlaying={isPlaying}
            progress={progress}
            barCount={22}
            height={22}
            barWidth={2.5}
            barGap={2}
            activeColor="#20e3a2"
            inactiveColor="rgba(255, 255, 255, 0.2)"
            playbackRate={playbackRate}
            onSeek={handleSeek}
          />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Speed Toggle Button */}
          <button
            type="button"
            onClick={handleCycleSpeed}
            className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-extrabold text-[#20e3a2] transition-colors border border-white/10 flex items-center gap-0.5 cursor-pointer"
            title="Cycle playback speed (1x, 1.5x, 2x)"
          >
            <FastForward className="w-3 h-3" />
            <span>{playbackRate}x</span>
          </button>

          {/* Play / Pause button */}
          <button
            type="button"
            onClick={handleTogglePlay}
            className="w-8 h-8 rounded-xl bg-[#20e3a2] text-black flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-[0_2px_10px_rgba(32,227,162,0.4)]"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 rounded-xl bg-white/5 hover:bg-white/15 text-[#8d97ab] hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Dismiss audio"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

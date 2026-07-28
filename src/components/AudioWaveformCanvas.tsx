import React, { useRef, useEffect } from 'react';
import { globalAudioPlayer } from '../utils/audioPlayer';

interface AudioWaveformCanvasProps {
  isPlaying: boolean;
  progress: number; // 0 to 1
  barCount?: number;
  height?: number;
  barWidth?: number;
  barGap?: number;
  activeColor?: string;
  inactiveColor?: string;
  playbackRate?: number;
  onSeek?: (progress: number) => void;
  className?: string;
}

export const AudioWaveformCanvas: React.FC<AudioWaveformCanvasProps> = ({
  isPlaying,
  progress,
  barCount = 28,
  height = 28,
  barWidth = 3,
  barGap = 2,
  activeColor = '#20e3a2',
  inactiveColor = 'rgba(255, 255, 255, 0.25)',
  playbackRate = 1,
  onSeek,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Generate deterministic bar base heights based on index
  const baseHeights = useRef<number[]>([]);
  if (baseHeights.current.length !== barCount) {
    baseHeights.current = Array.from({ length: barCount }, (_, i) => {
      const seed = (Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
      return 0.25 + Math.abs(seed) * 0.7; // Normalized between 0.25 and 0.95
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const totalWidth = barCount * barWidth + (barCount - 1) * barGap;

    canvas.width = totalWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const freqData = new Uint8Array(32);

    const draw = () => {
      ctx.clearRect(0, 0, totalWidth, height);

      let hasRealFreq = false;
      if (isPlaying) {
        hasRealFreq = globalAudioPlayer.getFrequencyData(freqData);
      }

      const time = performance.now() / 200 * playbackRate;

      for (let i = 0; i < barCount; i++) {
        let barHeightRatio = baseHeights.current[i];

        if (isPlaying) {
          if (hasRealFreq && freqData.length > 0) {
            const freqIndex = Math.floor((i / barCount) * freqData.length);
            const val = freqData[freqIndex] / 255;
            barHeightRatio = Math.max(0.2, val * 0.95);
          } else {
            // Dynamic sine perturbation wave when playing
            const wave = Math.sin(time + i * 0.45) * 0.25 + Math.cos(time * 0.7 + i * 0.3) * 0.15;
            barHeightRatio = Math.max(0.2, Math.min(1.0, barHeightRatio + wave));
          }
        }

        const barH = Math.max(4, barHeightRatio * (height - 4));
        const x = i * (barWidth + barGap);
        const y = (height - barH) / 2;

        const isPlayed = i / barCount <= progress;
        ctx.fillStyle = isPlayed ? activeColor : inactiveColor;

        // Draw bar with rounded caps
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barH, barWidth / 2);
        } else {
          ctx.rect(x, y, barWidth, barH);
        }
        ctx.fill();
      }

      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(draw);
      }
    };

    draw();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, progress, barCount, height, barWidth, barGap, activeColor, inactiveColor, playbackRate]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio);
  };

  const totalW = barCount * barWidth + (barCount - 1) * barGap;

  return (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      style={{ width: `${totalW}px`, height: `${height}px` }}
      className={`cursor-pointer touch-none select-none ${className}`}
      title="Click to seek"
    />
  );
};

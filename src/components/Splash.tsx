import { useEffect } from 'react';
import { motion } from 'motion/react';

interface SplashProps {
  onComplete: () => void;
}

export default function Splash({ onComplete }: SplashProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2400);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#060810] overflow-hidden">
      {/* Background radial gradients for ambient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(124,92,255,0.35),transparent_55%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_80%,rgba(32,227,162,0.2),transparent_50%)] pointer-events-none" />

      {/* Glowing SVG Coil */}
      <div className="relative w-[150px] h-[150px] mb-[26px]">
        <div className="absolute inset-[-30px] rounded-full bg-[radial-gradient(circle,rgba(32,227,162,0.35),transparent_65%)] blur-[10px] coil-glow pointer-events-none" />
        <svg id="coilSvg" width="150" height="150" viewBox="0 0 150 150" fill="none" className="relative z-10">
          <defs>
            <linearGradient id="coilGrad" x1="0" y1="0" x2="150" y2="150" gradientUnits="userSpaceOnUse">
              <stop stopColor="#20e3a2" />
              <stop offset="1" stopColor="#7c5cff" />
            </linearGradient>
          </defs>
          <path
            d="M30 40 C30 20, 60 15, 75 35 C95 60, 60 65, 55 80 C50 95, 85 100, 90 75 C93 60, 75 55, 70 65 C65 75, 80 85, 100 78 C118 71, 118 45, 100 35 C85 27, 75 45, 85 55"
            stroke="url(#coilGrad)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Brand title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.7 }}
        className="font-display text-[30px] font-extrabold tracking-[0.5px] text-white"
      >
        Vyper<span className="bg-gradient-to-r from-[#20e3a2] to-[#7c5cff] bg-clip-text text-transparent">Vic</span>
      </motion.div>

      {/* Tagline */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.15, duration: 0.7 }}
        className="mt-2 font-mono text-[12.5px] text-[#8d97ab] tracking-[2.5px] uppercase"
      >
        encrypted • fast • yours
      </motion.div>

      {/* Progress Bar */}
      <div className="mt-[46px] w-[120px] h-[3px] rounded-[3px] bg-[#161d28] overflow-hidden relative">
        <i className="absolute top-0 bottom-0 left-0 w-[40%] rounded-[3px] bg-gradient-to-r from-[#20e3a2] to-[#7c5cff]" />
      </div>
    </div>
  );
}

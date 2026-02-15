import React, { useRef, useEffect, useState } from 'react';
import { SamplerPadData } from '../types';

interface SamplerPadProps {
  pad: SamplerPadData;
  onDropFile: (fileId: string) => void;
  onTrigger: () => void;
  isTriggered: boolean;
  shortcut: string;
  playbackStartTime?: number;
  isColor?: boolean;
  isGradientBackground?: boolean;
  isGradientWaveform?: boolean;
  gradientHues?: [number, number];
  isFullMode?: boolean;
}

const SamplerPad: React.FC<SamplerPadProps> = React.memo(({ 
  pad, 
  onDropFile, 
  onTrigger, 
  isTriggered, 
  shortcut,
  playbackStartTime = 0,
  isColor = false,
  isGradientBackground = false,
  isGradientWaveform = false,
  gradientHues = [180, 240],
  isFullMode = false
}) => {
  const [isOver, setIsOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }
      
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      if (!pad.waveformPoints) {
        ctx.restore();
        requestRef.current = requestAnimationFrame(animate);
        return;
      }

      const h0 = gradientHues[0];
      const h1 = gradientHues[1];

      // 1. Render Background
      if (isGradientBackground) {
        const bgGrad = ctx.createLinearGradient(0, 0, rect.width, 0);
        bgGrad.addColorStop(0, `hsl(${h0}, 100%, 50%)`);
        bgGrad.addColorStop(1, `hsl(${h1}, 100%, 50%)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, rect.width, rect.height);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0)'; 
        ctx.fillRect(0, 0, rect.width, rect.height);
      }

      // 2. Render Waveform
      const step = rect.width / pad.waveformPoints.length;
      const centerY = rect.height / 2;

      const getStroke = (idx: number) => {
          if (isColor && pad.colors) return pad.colors[idx];
          if (isGradientWaveform) {
              const wfGrad = ctx.createLinearGradient(0, 0, rect.width, 0);
              if (isGradientBackground) {
                wfGrad.addColorStop(0, `hsl(${(h0 + 180) % 360}, 100%, 50%)`);
                wfGrad.addColorStop(1, `hsl(${(h1 + 180) % 360}, 100%, 50%)`);
              } else {
                wfGrad.addColorStop(0, `hsl(${h0}, 100%, 50%)`);
                wfGrad.addColorStop(1, `hsl(${h1}, 100%, 50%)`);
              }
              return wfGrad;
          }
          return 'white';
      };

      const staticStroke = getStroke(0);
      ctx.lineWidth = Math.max(1, step - 0.5);

      pad.waveformPoints.forEach((p, i) => {
        const x = i * step;
        const h = p * (rect.height * 0.8);
        
        ctx.beginPath();
        ctx.strokeStyle = isColor ? getStroke(i) : staticStroke;
        ctx.moveTo(x, centerY - h / 2);
        ctx.lineTo(x, centerY + h / 2);
        ctx.stroke();
      });

      // 3. Render Playhead
      if (playbackStartTime > 0 && pad.buffer) {
        const elapsed = (performance.now() - playbackStartTime) / 1000;
        const duration = pad.buffer.duration;
        
        if (elapsed < duration) {
          const playheadX = (elapsed / duration) * rect.width;
          ctx.beginPath();
          ctx.strokeStyle = (isGradientBackground || isGradientWaveform) ? 'rgba(255,255,255,0.5)' : '#ef4444';
          ctx.lineWidth = 2;
          ctx.moveTo(playheadX, 0);
          ctx.lineTo(playheadX, rect.height);
          ctx.stroke();
        }
      }

      ctx.restore();
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [pad.waveformPoints, pad.colors, playbackStartTime, isGradientBackground, isGradientWaveform, gradientHues, isColor, isFullMode]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = () => setIsOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const data = e.dataTransfer.getData('application/json');
    if (data) {
      try {
        const { fileId } = JSON.parse(data);
        if (fileId) onDropFile(fileId);
      } catch (err) {
        console.warn("Invalid drop data");
      }
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onTrigger}
      className={`relative h-full w-full border transition-all duration-75 flex flex-col items-center justify-center cursor-pointer group select-none overflow-hidden
        ${isOver ? 'border-red-600 bg-red-600/20 scale-95' : pad.buffer ? 'border-white/10 bg-neutral-900/40 hover:border-white/30' : 'border-white/5 bg-black hover:border-white/10'}
        ${isTriggered ? 'border-red-500 bg-red-500/40 ring-1 ring-red-500 z-10' : ''}
      `}
    >
      <span className={`absolute top-2 left-2.5 text-[8px] font-black z-20 ${isGradientBackground ? 'text-white/40' : 'text-neutral-700'} group-hover:text-white transition-colors`}>
        {shortcut}
      </span>
      
      <div className="relative w-full h-full flex flex-col">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-90 pointer-events-none" />
        
        {pad.fileItem && (
          <div className="absolute bottom-2 left-2 right-2 pointer-events-none overflow-hidden z-20">
            <p className={`text-[7px] font-black truncate uppercase tracking-tighter w-full drop-shadow-sm transition-colors ${isGradientBackground ? 'text-white' : 'text-neutral-400'}`}>
              {pad.fileItem.name}
            </p>
          </div>
        )}

        {!pad.waveformPoints && (
          <span className="absolute inset-0 flex items-center justify-center text-[12px] font-light text-white/5 group-hover:text-white/20 transition-all z-10">+</span>
        )}
      </div>
    </div>
  );
});

export default SamplerPad;
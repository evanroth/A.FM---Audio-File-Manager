import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { WaveformData } from '../types';

interface WaveformVisualizerProps {
  waveformData: WaveformData | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isColor?: boolean;
  isGradientBackground?: boolean;
  isGradientWaveform?: boolean;
  gradientHues?: [number, number];
  youtubeId?: string | null;
  isTransitionX?: boolean;
  isTransitionY?: boolean;
}

interface RenderBundle {
  waveformData: WaveformData;
  colors: string[] | null;
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({ 
  waveformData, 
  audioRef, 
  isColor = false,
  isGradientBackground = false,
  isGradientWaveform = false,
  gradientHues = [180, 240],
  youtubeId = null,
  isTransitionX = true,
  isTransitionY = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(null);
  
  // Internal bundles for transitions
  const [currentBundle, setCurrentBundle] = useState<RenderBundle | null>(null);
  const [prevBundle, setPrevBundle] = useState<RenderBundle | null>(null);
  const transitionProgress = useRef(1); // 1 = finished, 0 = starting
  const lastUpdateRef = useRef<number>(performance.now());
  
  // Internal refs for smooth color interpolation
  const currentHuesRef = useRef<[number, number]>([...gradientHues]);

  // Helper to calculate segment colors
  const calculateColors = (wf: WaveformData | null, colorEnabled: boolean): string[] | null => {
    if (!wf || !colorEnabled) return null;
    const { buffer, points } = wf;
    const data = buffer.getChannelData(0);
    const numPoints = points.length;
    const samplesPerPoint = Math.floor(data.length / numPoints);
    const colors: string[] = [];
    for (let i = 0; i < numPoints; i++) {
      const start = i * samplesPerPoint;
      const end = Math.min(start + samplesPerPoint, data.length);
      let crossings = 0;
      for (let j = start + 1; j < end; j++) {
        if ((data[j] >= 0 && data[j - 1] < 0) || (data[j] < 0 && data[j - 1] >= 0)) {
          crossings++;
        }
      }
      const zcr = crossings / (end - start);
      const hue = Math.min(280, zcr * 800); 
      colors.push(`hsl(${hue}, 100%, 50%)`);
    }
    return colors;
  };

  // Trigger transition when waveformData changes
  useEffect(() => {
    if (waveformData) {
      if (currentBundle && currentBundle.waveformData !== waveformData) {
        setPrevBundle(currentBundle);
        // Reset progress if transitions enabled
        transitionProgress.current = (isTransitionX || isTransitionY) ? 0 : 1;
      }
      setCurrentBundle({
        waveformData,
        colors: calculateColors(waveformData, isColor)
      });
    } else {
      // Just clear
      setCurrentBundle(null);
      setPrevBundle(null);
      transitionProgress.current = 1;
    }
  }, [waveformData, isColor, isTransitionX, isTransitionY]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !currentBundle || currentBundle.waveformData.duration <= 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, x / width));
    
    audio.currentTime = percentage * currentBundle.waveformData.duration;
  }, [currentBundle, audioRef]);

  const lerpHue = (current: number, target: number, speed: number) => {
    let diff = target - current;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return (current + diff * speed + 360) % 360;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    
    const animate = (now: number) => {
      const { width, height } = canvas.getBoundingClientRect();
      const deltaTime = now - lastUpdateRef.current;
      lastUpdateRef.current = now;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      
      // Snappy but smooth transition duration
      const transitionDuration = 350;
      
      if (transitionProgress.current < 1) {
        transitionProgress.current = Math.min(1, transitionProgress.current + (deltaTime / transitionDuration));
        if (transitionProgress.current === 1) {
          setPrevBundle(null);
        }
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background Rendering
      if (youtubeId) {
        ctx.clearRect(0, 0, width, height);
      } else {
        currentHuesRef.current[0] = lerpHue(currentHuesRef.current[0], gradientHues[0], 0.05);
        currentHuesRef.current[1] = lerpHue(currentHuesRef.current[1], gradientHues[1], 0.05);
        const h0 = currentHuesRef.current[0];
        const h1 = currentHuesRef.current[1];

        if (isGradientBackground) {
          const bgGrad = ctx.createLinearGradient(0, 0, width, 0);
          bgGrad.addColorStop(0, `hsl(${h0}, 100%, 50%)`);
          bgGrad.addColorStop(1, `hsl(${h1}, 100%, 50%)`);
          ctx.fillStyle = bgGrad;
        } else {
          ctx.fillStyle = 'black';
        }
        ctx.fillRect(0, 0, width, height);
      }

      const centerY = height / 2;
      const t = transitionProgress.current;

      const drawWaveform = (bundle: RenderBundle, scaleX: number, scaleY: number, offsetX: number) => {
        const wf = bundle.waveformData;
        const pts = wf.points;
        const currentWidth = width * scaleX;
        const step = currentWidth / pts.length;

        ctx.save();
        ctx.translate(offsetX, 0);

        const h0 = currentHuesRef.current[0];
        const h1 = currentHuesRef.current[1];

        const getStroke = (idx: number) => {
            if (isColor && bundle.colors) return bundle.colors[idx];
            if (isGradientWaveform) {
                const wfGrad = ctx.createLinearGradient(0, 0, currentWidth, 0);
                if (isGradientBackground || youtubeId) {
                  wfGrad.addColorStop(0, `hsl(${(h0 + 180) % 360}, 100%, 50%)`);
                  wfGrad.addColorStop(1, `hsl(${(h1 + 180) % 360}, 100%, 50%)`);
                } else {
                  wfGrad.addColorStop(0, `hsl(${h0}, 100%, 50%)`);
                  wfGrad.addColorStop(1, `hsl(${h1}, 100%, 50%)`);
                }
                return wfGrad;
            }
            if (youtubeId) return 'rgba(255, 255, 255, 0.8)';
            return 'white';
        };

        const staticStroke = getStroke(0);

        // We use Math.max to avoid disappearing entirely, but squish hard to near zero
        const effectiveScaleY = Math.max(0.0001, scaleY);

        for (let i = 0; i < pts.length; i++) {
          const x = i * step;
          const h = pts[i] * (height * 0.8) * effectiveScaleY;
          
          ctx.beginPath();
          ctx.strokeStyle = isColor ? getStroke(i) : staticStroke;
          ctx.lineWidth = Math.max(1, step - 0.5);
          ctx.moveTo(x, centerY - h / 2);
          ctx.lineTo(x, centerY + h / 2);
          ctx.stroke();
        }
        ctx.restore();
      };

      const drawPlayhead = (wfDuration: number, actualT: number) => {
        const audio = audioRef.current;
        if (!audio || wfDuration <= 0) return;
        
        const currentTime = audio.ended ? wfDuration : audio.currentTime;
        const playheadX = (currentTime / wfDuration) * width;
        
        let actualX = playheadX;
        if (prevBundle && t < 1 && isTransitionX) {
           // Mapping playhead across horizontal transition
           actualX = (width * (1 - actualT)) + (playheadX * actualT);
        }

        ctx.beginPath();
        ctx.strokeStyle = (isGradientBackground || isGradientWaveform || youtubeId) ? 'rgba(255,255,255,0.5)' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.moveTo(actualX, 0);
        ctx.lineTo(actualX, height);
        ctx.stroke();
      };

      // Transition Logic
      if (prevBundle && t < 1) {
        // Both X and Y transitions happen simultaneously here if both are toggled.
        // Outgoing: X goes 1 -> 0, Y goes 1 -> 0
        const outScaleX = isTransitionX ? 1 - t : 1;
        const outScaleY = isTransitionY ? 1 - t : 1;
        drawWaveform(prevBundle, outScaleX, outScaleY, 0);
        
        // Incoming: X goes 0 -> 1, Y goes 0 -> 1
        if (currentBundle) {
          const inScaleX = isTransitionX ? t : 1;
          const inScaleY = isTransitionY ? t : 1;
          const inOffsetX = isTransitionX ? width * (1 - t) : 0;
          drawWaveform(currentBundle, inScaleX, inScaleY, inOffsetX);
          drawPlayhead(currentBundle.waveformData.duration, t);
        }
      } else if (currentBundle) {
        drawWaveform(currentBundle, 1, 1, 0);
        drawPlayhead(currentBundle.waveformData.duration, 1);
      }

      ctx.restore();
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [currentBundle, prevBundle, audioRef, isColor, isGradientBackground, isGradientWaveform, gradientHues, youtubeId, isTransitionX, isTransitionY]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {youtubeId && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden bg-black">
          <iframe 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[115vw] h-[115vh] max-w-none border-0"
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeId}&modestbranding=1&showinfo=0&rel=0&iv_load_policy=3`}
            allow="autoplay; encrypted-media"
          />
          <div className="absolute inset-0 bg-black/30 pointer-events-none" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="relative w-full h-full block cursor-pointer z-10"
      />
    </div>
  );
};

export default WaveformVisualizer;
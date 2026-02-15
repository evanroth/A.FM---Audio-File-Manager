import React, { useCallback, useImperativeHandle, forwardRef, useState, useRef } from 'react';
import { SamplerPadData } from '../types';
import SamplerPad from './SamplerPad';

interface SamplerGridProps {
  pads: SamplerPadData[];
  audioCtx: AudioContext | null;
  onLoadPad: (padId: number, fileId: string) => void;
  isFullView?: boolean;
  isColor?: boolean;
  isGradientBackground?: boolean;
  isGradientWaveform?: boolean;
  gradientHues?: [number, number];
}

export interface SamplerGridHandle {
  triggerPad: (key: string) => void;
  stopAll: () => void;
}

const SHORTCUTS = [
  'C', 'V', 'B', 'N',
  'F', 'G', 'H', 'J',
  'T', 'Y', 'U', 'I',
  '6', '7', '8', '9'
];

const SamplerGrid = forwardRef<SamplerGridHandle, SamplerGridProps>(({ 
  pads,
  audioCtx, 
  onLoadPad,
  isFullView = false,
  isColor = false,
  isGradientBackground = false,
  isGradientWaveform = false,
  gradientHues = [180, 240]
}, ref) => {
  const [triggeredPadId, setTriggeredPadId] = useState<number | null>(null);
  // Track start times for each pad to drive playhead animations
  const [playbacks, setPlaybacks] = useState<Record<number, number>>({});
  // Track active sources to stop them if requested
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const playPad = useCallback((padId: number) => {
    const pad = pads[padId];
    if (!pad || !pad.buffer || !audioCtx) return;

    const source = audioCtx.createBufferSource();
    source.buffer = pad.buffer;
    source.connect(audioCtx.destination);
    
    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
    };
    
    source.start(0);

    const now = performance.now();
    setPlaybacks(prev => ({ ...prev, [padId]: now }));
    setTriggeredPadId(padId);
    
    // Clear trigger state after a short pulse
    setTimeout(() => setTriggeredPadId(null), 100);
  }, [pads, audioCtx]);

  const stopAll = useCallback(() => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source might have already ended
      }
    });
    activeSourcesRef.current.clear();
    setPlaybacks({});
  }, []);

  useImperativeHandle(ref, () => ({
    triggerPad: (key: string) => {
      const idx = SHORTCUTS.indexOf(key.toUpperCase());
      if (idx !== -1) playPad(idx);
    },
    stopAll
  }));

  return (
    <div className={`flex-1 flex flex-col ${isFullView ? 'w-full h-full p-0' : 'p-4 bg-black/40 backdrop-blur-md rounded-sm border border-white/5'}`}>
      <div className={`grid grid-cols-4 gap-1 flex-1 overflow-hidden h-full ${isFullView ? 'p-1 bg-black' : ''}`}>
        {pads.map((pad, i) => (
          <SamplerPad 
            key={pad.id}
            pad={pad}
            shortcut={SHORTCUTS[i]}
            isTriggered={triggeredPadId === pad.id}
            playbackStartTime={playbacks[pad.id] || 0}
            onTrigger={() => playPad(pad.id)}
            onDropFile={(fileId) => onLoadPad(pad.id, fileId)}
            isColor={isColor}
            isGradientBackground={isGradientBackground}
            isGradientWaveform={isGradientWaveform}
            gradientHues={pad.gradientHues || gradientHues}
            isFullMode={isFullView}
          />
        ))}
      </div>
      {!isFullView && (
        <p className="mt-4 text-[7px] font-black text-neutral-600 uppercase tracking-[0.4em] text-center">
          Drag Samples from Browser to Assign
        </p>
      )}
    </div>
  );
});

SamplerGrid.displayName = 'SamplerGrid';
export default SamplerGrid;
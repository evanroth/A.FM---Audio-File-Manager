import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WaveformData, FileSystemItem, SortKey, SortOrder, SamplerPadData, MoveShortcut } from './types';
import WaveformVisualizer from './components/WaveformVisualizer';
import FileExplorer from './components/FileExplorer';

const SHORTCUT_KEY_SEQUENCE = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];

// Simple IndexedDB wrapper for metadata persistence
const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('AudioFM_Metadata', 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('metadata')) {
      db.createObjectStore('metadata');
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const saveMetadata = async (key: string, value: any) => {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readwrite');
    const store = tx.objectStore('metadata');
    store.put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

const getMetadata = async (key: string) => {
  const db = await dbPromise;
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction('metadata', 'readonly');
    const store = tx.objectStore('metadata');
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const getMimeType = (fileName: string, fileType?: string): string => {
  if (fileType && fileType.length > 5 && fileType.startsWith('audio/')) return fileType;
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'wav': return 'audio/wav';
    case 'mp3': return 'audio/mpeg';
    case 'aif':
    case 'aiff': return 'audio/aiff';
    case 'flac': return 'audio/flac';
    case 'ogg': return 'audio/ogg';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    default: return 'audio/wav'; 
  }
};

export const matchSmartSearch = (text: string, query: string): boolean => {
  if (!query.trim()) return true;
  const terms = query.trim().split(/\s+/);
  return terms.every(term => {
    if (term.startsWith('-')) {
      const exclude = term.substring(1).toLowerCase();
      if (!exclude) return true;
      return !text.toLowerCase().includes(exclude);
    }
    if (term.startsWith('/') && term.lastIndexOf('/') > 0) {
      try {
        const lastSlash = term.lastIndexOf('/');
        const pattern = term.substring(1, lastSlash);
        const flags = term.substring(lastSlash + 1);
        const re = new RegExp(pattern, flags || 'i');
        return re.test(text);
      } catch (e) {
        return text.toLowerCase().includes(term.toLowerCase());
      }
    }
    return text.toLowerCase().includes(term.toLowerCase());
  });
};

interface DualRangeSliderProps {
  min: number;
  max: number;
  valMin: number;
  valMax: number;
  onChange: (min: number, max: number) => void;
  format: (val: number) => string;
  label: string;
}

const DualRangeSlider: React.FC<DualRangeSliderProps> = ({ min, max, valMin, valMax, onChange, format, label }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const update = useCallback((clientX: number, isMin: boolean) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const val = min + pct * (max - min);
    
    if (isMin) {
      onChange(Math.min(val, valMax), valMax);
    } else {
      onChange(valMin, Math.max(val, valMin));
    }
  }, [min, max, valMin, valMax, onChange]);

  const handlePointerDown = (e: React.PointerEvent, isMin: boolean) => {
    e.stopPropagation();
    const move = (em: PointerEvent) => update(em.clientX, isMin);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const range = Math.max(0.00001, max - min);
  const leftPct = Math.max(0, Math.min(100, ((valMin - min) / range) * 100));
  const rightPct = Math.max(0, Math.min(100, ((valMax - min) / range) * 100));

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[7px] font-black uppercase tracking-widest text-neutral-500">{label}</span>
        <div className="flex gap-2 text-[7px] font-bold text-neutral-400">
          <span className="text-white">{format(valMin)}</span>
          <span className="opacity-20">/</span>
          <span className="text-white">{format(valMax)}</span>
        </div>
      </div>
      <div 
        ref={containerRef} 
        className="relative h-3 flex items-center cursor-pointer touch-none"
        onPointerDown={(e) => {
          if (!containerRef.current) return;
          const rect = containerRef.current.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          const val = min + pct * range;
          const distMin = Math.abs(val - valMin);
          const distMax = Math.abs(val - valMax);
          update(e.clientX, distMin < distMax);
        }}
      >
        <div className="w-full h-[1px] bg-neutral-900 relative">
          <div 
            className="absolute h-full bg-red-600"
            style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
          />
          <div 
            className="absolute w-2 h-2 bg-white -translate-x-1/2 -translate-y-1/2 top-1/2 hover:scale-125 transition-transform z-10"
            style={{ left: `${leftPct}%` }}
            onPointerDown={(e) => handlePointerDown(e, true)}
          />
          <div 
            className="absolute w-2 h-2 bg-white -translate-x-1/2 -translate-y-1/2 top-1/2 hover:scale-125 transition-transform z-10"
            style={{ left: `${rightPct}%` }}
            onPointerDown={(e) => handlePointerDown(e, false)}
          />
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [explorerItems, setExplorerItems] = useState<FileSystemItem[]>([]);
  const [availableFolders, setAvailableFolders] = useState<FileSystemItem[]>([]);
  const [allFiles, setAllFiles] = useState<FileSystemItem[]>([]);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  
  const [moveShortcuts, setMoveShortcuts] = useState<MoveShortcut[]>([]);

  const [isRandom, setIsRandom] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isColorWaveform, setIsColorWaveform] = useState(false);
  const [isGradientBackground, setIsGradientBackground] = useState(true);
  const [isGradientWaveform, setIsGradientWaveform] = useState(true);
  const [isUpdateGradientOnLoad, setIsUpdateGradientOnLoad] = useState(true);
  
  const [isTransitionX, setIsTransitionX] = useState(false);
  const [isTransitionY, setIsTransitionY] = useState(true);
  
  const [gradientHues, setGradientHues] = useState<[number, number]>([180, 240]);
  const [showFileInfo, setShowFileInfo] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [minSize, setMinSize] = useState(0);
  const [maxSize, setMaxSize] = useState(100000000);
  const [minDuration, setMinDuration] = useState(0);
  const [maxDuration, setMaxDuration] = useState(60); 
  const [minDate, setMinDate] = useState(0);
  const [maxDate, setMaxDate] = useState(Date.now());
  const [minRating, setMinRating] = useState(0);

  const [currentPath, setCurrentPath] = useState<string>('root');

  const [bounds, setBounds] = useState({
    size: { min: 0, max: 100000000 },
    duration: { min: 0, max: 60 },
    date: { min: 0, max: Date.now() }
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const rootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const playRequestCount = useRef(0);
  const hasAutoLoadedFirstRef = useRef(false);
  const metadataQueueRef = useRef<FileSystemItem[]>([]);
  const isEnrichingRef = useRef(false);
  const playNextRef = useRef<((force: boolean) => void) | null>(null);

  // Load persistent metadata from IndexedDB
  useEffect(() => {
    const loadPersisted = async () => {
      try {
        const d = await getMetadata('durations');
        if (d) setDurations(d);
        const r = await getMetadata('ratings');
        if (r) setRatings(r);
        const s = await getMetadata('shortcuts');
        if (s) setMoveShortcuts(s);
      } catch (e) {
        console.warn('Metadata load failed', e);
      }
    };
    loadPersisted();
  }, []);

  // Debounce search text
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 200);
    return () => clearTimeout(timer);
  }, [searchText]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const randomizeGradient = useCallback(() => {
    const h1 = Math.floor(Math.random() * 360);
    let h2: number;
    do {
      h2 = Math.floor(Math.random() * 360);
      let diff = Math.abs(h1 - h2);
      if (diff > 180) diff = 360 - diff;
      if (diff >= 60) break; 
    } while (true);
    setGradientHues([h1, h2]);
  }, []);

  const initAudioCtx = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  };

  const getAudioDuration = async (file: File, name: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      const mimeType = getMimeType(name, file.type);
      const blob = new Blob([file], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      const cleanup = () => {
        URL.revokeObjectURL(url);
        audio.removeAttribute('src');
        audio.load();
      };

      const timeout = setTimeout(() => {
        cleanup();
        resolve(0);
      }, 2000);
      
      audio.onloadedmetadata = () => {
        clearTimeout(timeout);
        const duration = audio.duration;
        cleanup();
        resolve(duration);
      };

      audio.onerror = () => {
        clearTimeout(timeout);
        cleanup();
        resolve(0);
      };

      audio.src = url;
    });
  };

  const scanDirectory = async (handle: FileSystemDirectoryHandle, path: string = ''): Promise<FileSystemItem[]> => {
    const items: FileSystemItem[] = [];
    try {
      // @ts-ignore
      for await (const entry of handle.values()) {
        const fullPath = path ? `${path}/${entry.name}` : entry.name;
        const item: FileSystemItem = {
          id: fullPath,
          name: entry.name,
          kind: entry.kind as 'file' | 'directory',
          handle: entry as FileSystemFileHandle | FileSystemDirectoryHandle,
          parentHandle: handle
        };

        if (entry.kind === 'file') {
          const name = entry.name.toLowerCase();
          if (name.endsWith('.wav') || name.endsWith('.mp3') || name.endsWith('.aif') || name.endsWith('.aiff') || name.endsWith('.flac') || name.endsWith('.ogg') || name.endsWith('.m4a') || name.endsWith('.aac')) {
            const file = await (entry as FileSystemFileHandle).getFile();
            item.size = file.size;
            item.type = file.type;
            item.lastModified = file.lastModified;
            item.duration = 0; 
            items.push(item);
          }
        } else if (entry.kind === 'directory') {
          item.children = await scanDirectory(entry as FileSystemDirectoryHandle, fullPath);
          items.push(item);
        }
      }
    } catch (e) {
      console.error("Scan error:", e);
    }
    return items;
  };

  const refreshFiles = useCallback(async () => {
    if (!rootHandleRef.current) return;
    setIsLoading(true);
    try {
      const items = await scanDirectory(rootHandleRef.current);
      setExplorerItems([{ id: 'root', name: rootHandleRef.current.name, kind: 'directory', handle: rootHandleRef.current, parentHandle: null, children: items }]);
      
      const files: FileSystemItem[] = [];
      const folders: FileSystemItem[] = [];

      const collect = (list: FileSystemItem[]) => {
        list.forEach(item => {
          if (item.kind === 'file') {
            files.push(item);
          } else {
            folders.push(item);
            if (item.children) collect(item.children);
          }
        });
      };

      collect(items);
      
      if (files.length > 0) {
        const sizes = files.map(f => f.size || 0);
        const dates = files.map(f => f.lastModified || 0);
        
        const newBounds = {
          size: { min: Math.min(...sizes), max: Math.max(...sizes) },
          duration: { min: 0, max: 60 },
          date: { min: Math.min(...dates), max: Math.max(...dates) }
        };
        
        setBounds(newBounds);
        setMinSize(newBounds.size.min);
        setMaxSize(newBounds.size.max);
        setMinDuration(newBounds.duration.min);
        setMaxDuration(newBounds.duration.max);
        setMinDate(newBounds.date.min);
        setMaxDate(newBounds.date.max);

        // Filter out files that already have duration metadata cached
        const currentDurations = await getMetadata('durations') || {};
        const unMetadataFiles = files.filter(f => !currentDurations[f.id]);
        metadataQueueRef.current = [...unMetadataFiles];
      }

      setAllFiles(files);
      setAvailableFolders(folders);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isStarted || metadataQueueRef.current.length === 0 || isEnrichingRef.current) return;

    const enrichMetadata = async () => {
      isEnrichingRef.current = true;
      let batch: Record<string, number> = {};
      let batchSize = 0;
      let lastBatchTime = performance.now();
      let lastMaxDuration = bounds.duration.max;

      while (metadataQueueRef.current.length > 0) {
        const fileItem = metadataQueueRef.current.shift();
        if (!fileItem) break;

        try {
          let file: File;
          if ('getFile' in fileItem.handle) {
            file = await (fileItem.handle as FileSystemFileHandle).getFile();
          } else {
            // @ts-ignore
            file = fileItem._file;
          }

          const duration = await getAudioDuration(file, fileItem.name);
          if (duration > 0) {
            batch[fileItem.id] = duration;
            batchSize++;
            if (duration > lastMaxDuration) {
              lastMaxDuration = Math.ceil(duration);
            }
          }
        } catch (e) {}

        const now = performance.now();
        if (batchSize >= 20 || (now - lastBatchTime > 500 && batchSize > 0) || metadataQueueRef.current.length === 0) {
          const currentBatch = { ...batch };
          setDurations(prev => {
            const next = { ...prev, ...currentBatch };
            saveMetadata('durations', next);
            return next;
          });
          
          if (lastMaxDuration > bounds.duration.max) {
             const newMax = lastMaxDuration;
             setBounds(prev => ({ 
               ...prev, 
               duration: { ...prev.duration, max: Math.max(prev.duration.max, newMax) } 
             }));
          }

          batch = {};
          batchSize = 0;
          lastBatchTime = now;
          // Yield to main thread
          await new Promise(r => setTimeout(r, 100));
        }
      }
      isEnrichingRef.current = false;
    };

    enrichMetadata();
  }, [isStarted, allFiles.length, bounds.duration.max]);

  const currentFolderItems = useMemo(() => {
    if (explorerItems.length === 0) return [];
    if (currentPath === 'root') return explorerItems[0].children || [];
    
    const findInTree = (nodes: FileSystemItem[], id: string): FileSystemItem | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findInTree(node.children, id);
          if (found) return found;
        }
      }
      return null;
    };
    
    const node = findInTree(explorerItems, currentPath);
    return node?.children || [];
  }, [explorerItems, currentPath]);

  const navigateUp = () => {
    if (currentPath === 'root') return;
    const parts = currentPath.split('/');
    if (parts.length === 1) setCurrentPath('root');
    else {
      parts.pop();
      setCurrentPath(parts.join('/'));
    }
  };

  const sortedFiles = useMemo(() => {
    return [...allFiles].sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortKey === 'date') {
        valA = a.lastModified || 0;
        valB = b.lastModified || 0;
      } else if (sortKey === 'duration') {
        valA = durations[a.id] || 0;
        valB = durations[b.id] || 0;
      } else if (sortKey === 'rating') {
        valA = ratings[a.id] || 0;
        valB = ratings[b.id] || 0;
      } else {
        valA = (a as any)[sortKey] || 0;
        valB = (b as any)[sortKey] || 0;
      }

      if (sortKey === 'name' || sortKey === 'type') {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allFiles, durations, ratings, sortKey, sortOrder]);

  const filteredFiles = useMemo(() => {
    return sortedFiles.filter(file => {
      const duration = durations[file.id] || 0;
      const rating = ratings[file.id] || 0;
      const matchSearch = matchSmartSearch(file.name, debouncedSearch);
      const matchSize = (file.size || 0) >= minSize && (file.size || 0) <= maxSize;
      const matchDuration = duration >= minDuration && duration <= maxDuration;
      const matchDate = (file.lastModified || 0) >= minDate && (file.lastModified || 0) <= maxDate;
      const matchRating = rating >= minRating;
      return matchSearch && matchSize && matchDuration && matchDate && matchRating;
    });
  }, [sortedFiles, durations, ratings, debouncedSearch, minSize, maxSize, minDuration, maxDuration, minDate, maxDate, minRating]);

  useEffect(() => {
    if (isStarted) refreshFiles();
  }, [isStarted, refreshFiles]);

  const playFile = useCallback(async (item: FileSystemItem, shouldPlay: boolean = true) => {
    if (item.kind !== 'file') return;
    
    const requestId = ++playRequestCount.current;
    
    try {
      if ((isGradientBackground || isGradientWaveform) && isUpdateGradientOnLoad) {
        randomizeGradient();
      }

      await initAudioCtx();
      let file: File;
      try {
        if ('getFile' in item.handle) {
          file = await (item.handle as FileSystemFileHandle).getFile();
        } else {
          // @ts-ignore
          file = item._file;
        }
      } catch (fileErr) {
        throw new Error("Could not access file system entry.");
      }
      
      if (lastUrlRef.current) {
        URL.revokeObjectURL(lastUrlRef.current);
      }

      const mimeType = getMimeType(item.name, file.type);
      const blob = new Blob([file], { type: mimeType });
      const url = URL.createObjectURL(blob);
      lastUrlRef.current = url;
      
      setActiveFileId(item.id);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
        await new Promise(r => setTimeout(r, 10));
        audioRef.current.src = url;
        audioRef.current.load();
        
        if (shouldPlay) {
          try {
            const playPromise = audioRef.current.play();
            if (playPromise !== undefined) await playPromise;
            setIsPlaying(true);
          } catch (playErr: any) {
            if (playErr.name !== 'AbortError') {
              throw playErr;
            }
          }
        } else {
          setIsPlaying(false);
        }
      }

      if (requestId !== playRequestCount.current) return;

      const arrayBuffer = await file.arrayBuffer();
      if (audioCtxRef.current!.state === 'suspended') await audioCtxRef.current!.resume();
      
      const audioBuffer = await audioCtxRef.current!.decodeAudioData(arrayBuffer).catch(e => {
        throw new Error("Audio decoding failed.");
      });
      
      if (requestId !== playRequestCount.current) return;

      if (audioBuffer) {
        const rawData = audioBuffer.getChannelData(0);
        const samples = 800;
        const blockSize = Math.floor(rawData.length / samples) || 1;
        const points: number[] = [];
        for (let i = 0; i < samples; i++) {
          let max = 0;
          const start = i * blockSize;
          const end = Math.min(start + blockSize, rawData.length);
          for (let j = start; j < end; j++) {
            const val = Math.abs(rawData[j]);
            if (val > max) max = val;
          }
          points.push(max);
        }
        setWaveformData({ points, duration: audioBuffer.duration, buffer: audioBuffer });
      } else {
        setWaveformData(null);
      }
    } catch (e: any) {
      if (requestId === playRequestCount.current) {
        console.error("Playback Error:", e);
        setError(`LOAD FAILED: ${item.name}`);
        setTimeout(() => setError(null), 3000);
        setWaveformData(null);
        
        // Skip to next file if playback was requested
        if (shouldPlay) {
          setTimeout(() => playNextRef.current?.(true), 250);
        }
      }
    }
  }, [isGradientBackground, isGradientWaveform, isUpdateGradientOnLoad, randomizeGradient]);

  useEffect(() => {
    if (isStarted && !isLoading && filteredFiles.length > 0 && !hasAutoLoadedFirstRef.current) {
      hasAutoLoadedFirstRef.current = true;
      playFile(filteredFiles[0], false);
    }
  }, [isStarted, isLoading, filteredFiles, playFile]);

  const playNext = useCallback((forceNext: boolean = false) => {
    if (filteredFiles.length === 0) return;
    
    // Consistent lookup of the active file within the global filtered set
    const activeFile = filteredFiles.find(f => f.id === activeFileId);
    
    // Handle Looping
    if (!forceNext && isLooping && activeFile) {
        playFile(activeFile, true);
        return;
    }
    
    // Calculate Next Index using global filteredFiles array
    let nextIdx;
    if (isRandom) {
      nextIdx = Math.floor(Math.random() * filteredFiles.length);
    } else {
      const currentIdx = filteredFiles.findIndex(f => f.id === activeFileId);
      // Handles wrapping to 0 correctly regardless of current index status
      nextIdx = (currentIdx + 1) % filteredFiles.length;
    }
    
    const nextFile = filteredFiles[nextIdx];
    // Navigation (manual press) preserves play state, auto-advance (onEnded) always plays.
    const shouldPlay = forceNext ? isPlaying : true;
    if (nextFile) playFile(nextFile, shouldPlay);
  }, [filteredFiles, activeFileId, isRandom, isLooping, isPlaying, playFile]);

  // Keep playNextRef in sync to avoid circular dependencies
  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  const playPrev = useCallback(() => {
    if (filteredFiles.length === 0) return;
    
    // Calculate Prev Index using global filteredFiles array
    let prevIdx;
    if (isRandom) {
      prevIdx = Math.floor(Math.random() * filteredFiles.length);
    } else {
      const currentIdx = filteredFiles.findIndex(f => f.id === activeFileId);
      // Correctly handle backwards wrap around using global list
      prevIdx = (currentIdx - 1 + filteredFiles.length) % filteredFiles.length;
    }
    
    const prevFile = filteredFiles[prevIdx];
    // Navigation ALWAYS preserves current play state
    if (prevFile) playFile(prevFile, isPlaying);
  }, [filteredFiles, activeFileId, isRandom, isPlaying, playFile]);

  const handleBatchMove = async (target: FileSystemItem) => {
    const itemsToMove: FileSystemItem[] = [];
    if (selectedIds.size > 0) {
      selectedIds.forEach(id => {
        const item = allFiles.find(f => f.id === id);
        if (item) itemsToMove.push(item);
      });
    } else if (activeFileId) {
      const activeFile = allFiles.find(f => f.id === activeFileId);
      if (activeFile) itemsToMove.push(activeFile);
    }

    if (itemsToMove.length === 0 || target.kind !== 'directory') return;

    setIsLoading(true);
    const targetHandle = target.handle as FileSystemDirectoryHandle;
    let movedCount = 0;

    try {
      for (const source of itemsToMove) {
        if (source.kind !== 'file') continue;
        const sourceHandle = source.handle as FileSystemFileHandle;
        const file = await sourceHandle.getFile();
        const newFileHandle = await targetHandle.getFileHandle(source.name, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(file);
        await writable.close();
        if (source.parentHandle) {
          try { await source.parentHandle.removeEntry(source.name); } catch (removeErr) {}
        }
        movedCount++;
      }
      setSelectedIds(new Set());
      await refreshFiles();
      setError(`MOVED ${movedCount} FILE(S)`);
      setTimeout(() => setError(null), 2500);
    } catch (e) {
      setError("BATCH MOVE FAILED");
      setTimeout(() => setError(null), 2500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocateFile = useCallback((path: string) => {
    setError(`LOCATED: ./${path}`);
    setTimeout(() => setError(null), 4000);
  }, []);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === filteredFiles.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredFiles.map(f => f.id)));
  };

  const handleDirectoryPicker = async () => {
    try {
      if (!('showDirectoryPicker' in window)) {
        fallbackInputRef.current?.click();
        return;
      }
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      rootHandleRef.current = handle;
      hasAutoLoadedFirstRef.current = false;
      await refreshFiles();
      setIsStarted(true);
      setShowPanel(true);
    } catch (e: any) {
      if (e.name !== 'AbortError') fallbackInputRef.current?.click();
    }
  };

  const handleLegacyInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsLoading(true);
    hasAutoLoadedFirstRef.current = false;
    const root: FileSystemItem = {
      id: 'root', name: 'UPLOADED FOLDER', kind: 'directory',
      handle: {} as any, parentHandle: null, children: []
    };
    const fileList: FileSystemItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const name = f.name.toLowerCase();
      if (!(name.endsWith('.wav') || name.endsWith('.mp3') || name.endsWith('.aif') || name.endsWith('.aiff') || name.endsWith('.flac') || name.endsWith('.ogg') || name.endsWith('.m4a') || name.endsWith('.aac'))) continue;
      const pathParts = f.webkitRelativePath.split('/');
      let currentLevel = root.children!;
      for (let j = 1; j < pathParts.length - 1; j++) {
        const folderName = pathParts[j];
        let folder = currentLevel.find(item => item.name === folderName && item.kind === 'directory');
        if (!folder) {
          folder = {
            id: pathParts.slice(0, j + 1).join('/'),
            name: folderName, kind: 'directory',
            handle: {} as any, parentHandle: null, children: []
          };
          currentLevel.push(folder);
        }
        currentLevel = folder.children!;
      }
      const fileItem: FileSystemItem = {
        id: f.webkitRelativePath || f.name, name: f.name, kind: 'file',
        handle: {} as any, parentHandle: null, size: f.size, type: f.type,
        duration: 0,
        // @ts-ignore
        _file: f
      };
      currentLevel.push(fileItem);
      fileList.push(fileItem);
    }
    setExplorerItems([root]);
    setAllFiles(fileList);
    setDurations({});
    metadataQueueRef.current = [...fileList];
    setIsStarted(true);
    setIsLoading(false);
    setShowPanel(true);
  };

  const handleRate = useCallback((id: string, rating: number) => {
    setRatings(prev => {
      const next = { ...prev, [id]: rating };
      saveMetadata('ratings', next);
      return next;
    });
  }, []);

  const exportFiles = useCallback((format: 'txt' | 'json') => {
    if (filteredFiles.length === 0) {
      setError("NO FILES TO EXPORT");
      setTimeout(() => setError(null), 2000);
      return;
    }
    
    let content = '';
    let mimeType = '';
    let extension = '';
    
    if (format === 'txt') {
      content = filteredFiles.map(f => f.name).join('\n');
      mimeType = 'text/plain';
      extension = 'txt';
    } else {
      const data = filteredFiles.map(f => ({
        name: f.name,
        path: f.id,
        size: f.size,
        type: f.type,
        duration: durations[f.id] || 0,
        rating: ratings[f.id] || 0,
        lastModified: f.lastModified
      }));
      content = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
      extension = 'json';
    }
    
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audio_fm_export_${new Date().getTime()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("EXPORT FAILED");
      setTimeout(() => setError(null), 2000);
    }
  }, [filteredFiles, durations, ratings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
      if (!isStarted || isLoading) return;
      if (['0', '1', '2', '3', '4', '5'].includes(e.key) && activeFileId) {
        e.preventDefault(); handleRate(activeFileId, parseInt(e.key)); return;
      }
      if (e.key === 's' || e.key === 'Enter') { e.preventDefault(); setShowPanel(v => !v); }
      if (e.key === ' ') { 
        e.preventDefault(); 
        if (audioRef.current) {
          if (audioRef.current.paused) audioRef.current.play();
          else audioRef.current.pause();
        }
      }
      if (e.key === 'ArrowRight') playNext(true);
      if (e.key === 'ArrowLeft') playPrev();
      const key = e.key.toLowerCase();
      const matchedShortcut = moveShortcuts.find(s => s.key === key);
      if (matchedShortcut) {
        const folder = availableFolders.find(f => f.id === matchedShortcut.targetPath);
        if (folder) handleBatchMove(folder);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStarted, isLoading, playNext, playPrev, activeFileId, allFiles, selectedIds, filteredFiles, handleRate, moveShortcuts, availableFolders]);

  const addMoveShortcut = () => {
    const nextIndex = moveShortcuts.length;
    if (nextIndex >= SHORTCUT_KEY_SEQUENCE.length) return;
    const nextKey = SHORTCUT_KEY_SEQUENCE[nextIndex];
    const newShortcuts = [...moveShortcuts, { key: nextKey, targetPath: availableFolders[0]?.id || '' }];
    setMoveShortcuts(newShortcuts);
    saveMetadata('shortcuts', newShortcuts);
  };

  const updateShortcutTarget = (key: string, targetPath: string) => {
    const newShortcuts = moveShortcuts.map(s => s.key === key ? { ...s, targetPath } : s);
    setMoveShortcuts(newShortcuts);
    saveMetadata('shortcuts', newShortcuts);
  };

  const removeShortcut = (key: string) => {
    const newShortcuts = moveShortcuts.filter(s => s.key !== key);
    setMoveShortcuts(newShortcuts);
    saveMetadata('shortcuts', newShortcuts);
  };

  const formatSizeLabel = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  };

  const formatDateLabel = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: '2-digit'});
  };

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortOrder('asc'); }
  };

  const currentlyPlayingFile = allFiles.find(f => f.id === activeFileId);

  if (!isStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-8">
        <h1 className="text-[12rem] font-black leading-none tracking-tighter italic mb-0">A.FM</h1>
        <p className="text-[10px] font-black uppercase tracking-[0.6em] text-neutral-500 mb-8">Audio File Manager</p>
        <div className="h-1 w-32 bg-red-600 mb-16"></div>
        {isLoading ? (
          <div className="flex flex-col items-center gap-8">
            <div className="w-64 h-[2px] bg-neutral-900 relative overflow-hidden">
               <div className="absolute inset-0 bg-red-600 animate-scanner"></div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-red-600 animate-pulse">Analyzing Library Metadata</p>
              <p className="text-[8px] font-bold uppercase tracking-widest text-neutral-500">Indexing Samples and Calculating Waveforms</p>
            </div>
          </div>
        ) : (
          <button 
            onClick={handleDirectoryPicker} 
            className="bg-white text-black px-12 py-5 font-black uppercase tracking-[0.3em] text-xs hover:bg-neutral-200 transition-colors"
          >
            Initialize Directory
          </button>
        )}
        <input {...({ ref: fallbackInputRef, type: "file", className: "hidden", webkitdirectory: "true", onChange: handleLegacyInput } as any)} />
        {error && <p className="mt-8 text-red-500 font-mono text-xs uppercase tracking-widest">{error}</p>}
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden flex text-white font-sans">
      <audio 
        ref={audioRef} 
        onEnded={() => playNext(false)} 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="hidden" 
      />
      
      <main className={`transition-all duration-500 flex flex-col relative z-0 ${showPanel ? 'w-[40%]' : 'w-full'}`}>
        <div className="absolute inset-0 flex flex-col">
          <div className="flex-1 relative overflow-hidden flex flex-col">
            <div className="flex-1 relative overflow-hidden">
              <WaveformVisualizer 
                waveformData={waveformData} audioRef={audioRef} isColor={isColorWaveform} 
                isGradientBackground={isGradientBackground} isGradientWaveform={isGradientWaveform}
                gradientHues={gradientHues} isTransitionX={isTransitionX} isTransitionY={isTransitionY}
              />
              {isLoading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                   <div className="w-32 h-[1px] bg-white/10 relative overflow-hidden">
                      <div className="absolute inset-0 bg-red-600 animate-scanner"></div>
                   </div>
                </div>
              )}
            </div>
            <div className={`absolute bottom-6 left-8 right-8 pointer-events-none transition-all duration-500 z-20 ${showFileInfo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <span className={`text-[8px] font-black tracking-[0.3em] uppercase block truncate drop-shadow-sm transition-colors duration-500 ${isGradientBackground ? 'text-white' : 'text-neutral-400'}`}>
                {currentlyPlayingFile?.name || ""}
              </span>
            </div>
          </div>
        </div>
      </main>

      <div className={`fixed top-0 right-0 h-full w-[60%] bg-black/95 border-l border-white/10 z-[70] transition-transform duration-500 flex flex-col ${showPanel ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-8 pb-4 flex justify-between items-center border-b border-white/5 shrink-0">
          <div className="flex gap-4">
             <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-red-600 underline underline-offset-8">Library</h2>
          </div>
          <button onClick={() => setShowPanel(false)} className="text-white/30 text-[9px] uppercase font-mono hover:text-white transition-colors">[Close]</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-[40%] flex flex-col border-r border-white/5 overflow-y-auto scrollbar-hide">
            <div className="px-8 py-6 space-y-4 bg-white/[0.02] border-b border-white/5">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-neutral-500">Sort Library</h3>
                <div className="flex flex-nowrap gap-1">
                  {(['name', 'size', 'type', 'date', 'duration', 'rating'] as SortKey[]).map(key => (
                    <button 
                        key={key} onClick={() => handleSortClick(key)}
                        className={`flex-1 py-1.5 px-1 text-[7px] font-black uppercase border transition-all flex items-center justify-center gap-1 shrink-0 ${sortKey === key ? 'border-red-600 text-red-600 bg-red-600/5' : 'border-white/10 text-neutral-600 hover:border-white/20'}`}
                    >
                        {key === 'duration' ? 'LEN' : key === 'rating' ? '★' : key.toUpperCase()}
                        {sortKey === key && <span className="text-[8px] leading-none shrink-0">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  ))}
                </div>
            </div>

            <div className="px-8 py-6 space-y-6 bg-white/[0.01] border-b border-white/5">
              <div className="flex justify-between items-center">
                <h3 className="text-[8px] font-black uppercase tracking-[0.4em] text-neutral-500">Filters</h3>
                <button 
                  onClick={() => {
                    setSearchText('');
                    setMinDuration(bounds.duration.min); setMaxDuration(bounds.duration.max);
                    setMinSize(bounds.size.min); setMaxSize(bounds.size.max);
                    setMinDate(bounds.date.min); setMaxDate(bounds.date.max);
                    setMinRating(0);
                  }}
                  className="text-[7px] font-black uppercase text-white/20 hover:text-white transition-colors"
                >Reset All</button>
              </div>

              <div className="relative group">
                <input 
                  type="text" placeholder="SEARCH FILENAME..." value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full bg-black border border-white/10 px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-all outline-none placeholder:text-neutral-800"
                />
              </div>

              <div className="space-y-4 pt-2">
                <DualRangeSlider 
                  label="Length" min={bounds.duration.min} max={bounds.duration.max}
                  valMin={minDuration} valMax={maxDuration}
                  onChange={(n, x) => { setMinDuration(n); setMaxDuration(x); }}
                  format={(v) => `${v.toFixed(1)}s`}
                />
                <DualRangeSlider 
                  label="Size" min={bounds.size.min} max={bounds.size.max}
                  valMin={minSize} valMax={maxSize}
                  onChange={(n, x) => { setMinSize(n); setMaxSize(x); }}
                  format={formatSizeLabel}
                />
                <DualRangeSlider 
                  label="Modified" min={bounds.date.min} max={bounds.date.max}
                  valMin={minDate} valMax={maxDate}
                  onChange={(n, x) => { setMinDate(n); setMaxDate(x); }}
                  format={formatDateLabel}
                />
                <div className="w-full">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[7px] font-black uppercase tracking-widest text-neutral-500">Favorites (Rating)</span>
                    <span className="text-[7px] font-bold text-white uppercase tracking-widest">{minRating}+ Stars</span>
                  </div>
                  <input 
                    type="range" min="0" max="5" step="1" value={minRating} 
                    onChange={(e) => setMinRating(parseInt(e.target.value))}
                    className="w-full h-1 bg-neutral-900 appearance-none cursor-pointer accent-red-600"
                  />
                </div>
              </div>
            </div>

            <div className="px-8 py-6 space-y-4 border-b border-white/5 bg-white/[0.015]">
              <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-neutral-500">Export Match ({filteredFiles.length})</h3>
              <div className="flex gap-2">
                <button 
                  onClick={() => exportFiles('txt')}
                  className="flex-1 py-1.5 text-[7px] font-black uppercase border border-white/10 text-neutral-400 hover:border-white/20 hover:text-white transition-all bg-white/[0.02]"
                >
                  Download .TXT
                </button>
                <button 
                  onClick={() => exportFiles('json')}
                  className="flex-1 py-1.5 text-[7px] font-black uppercase border border-white/10 text-neutral-400 hover:border-white/20 hover:text-white transition-all bg-white/[0.02]"
                >
                  Download .JSON
                </button>
              </div>
            </div>

            <div className="p-8 space-y-10">
              <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex justify-between items-center">
                  <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-neutral-600">Move Shortcuts</h3>
                  <button 
                    onClick={addMoveShortcut}
                    disabled={moveShortcuts.length >= SHORTCUT_KEY_SEQUENCE.length}
                    className="text-[7px] font-black uppercase bg-red-600/20 text-red-600 px-2 py-1 hover:bg-red-600 hover:text-white transition-all disabled:opacity-20"
                  >
                    Add 'move' keyboard shortcut
                  </button>
                </div>
                <div className="space-y-4">
                  {moveShortcuts.map((shortcut) => (
                    <div key={shortcut.key} className="flex flex-col gap-2 border-l border-red-600/20 pl-4 py-1 relative">
                      <button onClick={() => removeShortcut(shortcut.key)} className="absolute -left-1.5 top-0 w-3 h-3 bg-black border border-white/10 text-[8px] flex items-center justify-center text-neutral-700 hover:text-red-500 transition-colors">×</button>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 flex items-center justify-center bg-white/5 border border-white/10 text-[9px] font-mono text-red-600 uppercase shrink-0">{shortcut.key}</div>
                        <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tight">adds current file to:</span>
                      </div>
                      <select
                        value={shortcut.targetPath}
                        onChange={(e) => updateShortcutTarget(shortcut.key, e.target.value)}
                        className="w-full bg-black border border-white/10 text-[9px] font-black uppercase py-2 px-2 focus:border-red-600 outline-none appearance-none cursor-pointer"
                        style={{ background: 'black linear-gradient(to bottom, transparent, rgba(255,255,255,0.02))' }}
                      >
                        <option value="">(Select target folder)</option>
                        {availableFolders.map(folder => (
                          <option key={folder.id} value={folder.id}>{folder.id === 'root' ? '/' : folder.id}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                  {moveShortcuts.length === 0 && <p className="text-[7px] text-neutral-800 uppercase italic">No custom move shortcuts assigned.</p>}
                  <p className="text-[7px] text-neutral-500 uppercase tracking-[0.1em] leading-relaxed pt-2 border-t border-white/5 opacity-60 italic">Note: This functionality will only work when the application is run locally.</p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-neutral-600 mb-2">Display & Playback</h3>
                <div className="flex justify-between items-center"><span className="text-[9px] font-bold uppercase text-neutral-400">Display File Name</span><button onClick={() => setShowFileInfo(!showFileInfo)} className={`h-4 w-8 relative transition-colors ${showFileInfo ? 'bg-red-600' : 'bg-neutral-800'}`}><span className={`absolute top-0.5 h-2 w-2 bg-white transition-transform ${showFileInfo ? 'left-5' : 'left-1'}`} /></button></div>
                <div className="flex justify-between items-center"><span className="text-[9px] font-bold uppercase text-neutral-400">Color Waveform</span><button onClick={() => { const next = !isColorWaveform; setIsColorWaveform(next); if (next) setIsGradientWaveform(false); }} className={`h-4 w-8 relative transition-colors ${isColorWaveform ? 'bg-red-600' : 'bg-neutral-800'}`}><span className={`absolute top-0.5 h-2 w-2 bg-white transition-transform ${isColorWaveform ? 'left-5' : 'left-1'}`} /></button></div>
                <div className="flex justify-between items-center"><span className="text-[9px] font-bold uppercase text-neutral-400">Gradient Background</span><button onClick={() => setIsGradientBackground(!isGradientBackground)} className={`h-4 w-8 relative transition-colors ${isGradientBackground ? 'bg-red-600' : 'bg-neutral-800'}`}><span className={`absolute top-0.5 h-2 w-2 bg-white transition-transform ${isGradientBackground ? 'left-5' : 'left-1'}`} /></button></div>
                <div className="flex justify-between items-center"><span className="text-[9px] font-bold uppercase text-neutral-400">Gradient Waveform</span><button onClick={() => { const next = !isGradientWaveform; setIsGradientWaveform(next); if (next) setIsColorWaveform(false); }} className={`h-4 w-8 relative transition-colors ${isGradientWaveform ? 'bg-red-600' : 'bg-neutral-800'}`}><span className={`absolute top-0.5 h-2 w-2 bg-white transition-transform ${isGradientWaveform ? 'left-5' : 'left-1'}`} /></button></div>
                <div className="flex justify-between items-center"><span className="text-[9px] font-bold uppercase text-neutral-400">Shuffle</span><button onClick={() => setIsRandom(!isRandom)} className={`h-4 w-8 relative transition-colors ${isRandom ? 'bg-red-600' : 'bg-neutral-800'}`}><span className={`absolute top-0.5 h-2 w-2 bg-white transition-transform ${isRandom ? 'left-5' : 'left-1'}`} /></button></div>
                <div className="flex justify-between items-center"><span className="text-[9px] font-bold uppercase text-neutral-400">Loop</span><button onClick={() => setIsLooping(!isLooping)} className={`h-4 w-8 relative transition-colors ${isLooping ? 'bg-red-600' : 'bg-neutral-800'}`}><span className={`absolute top-0.5 h-2 w-2 bg-white transition-transform ${isLooping ? 'left-5' : 'left-1'}`} /></button></div>
              </div>

              <div className="pt-8 border-t border-white/5 space-y-6">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-neutral-600">Shortcuts</h3>
                <div className="grid grid-cols-1 gap-2.5 text-[9px] font-bold uppercase text-neutral-500">
                    <div className="flex justify-between items-center"><span>Play / Pause</span><span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">[SPACE]</span></div>
                    <div className="flex justify-between items-center"><span>Previous Sample</span><span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">[←]</span></div>
                    <div className="flex justify-between items-center"><span>Next Sample</span><span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">[→]</span></div>
                    <div className="flex justify-between items-center"><span>Rate 1-5 Stars</span><span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">[1-5]</span></div>
                    <div className="flex justify-between items-center"><span>Reset Rating</span><span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">[0]</span></div>
                    <div className="flex justify-between items-center"><span>Toggle Panel</span><span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">[S] / [ENTER]</span></div>
                </div>
              </div>
              <div className="pt-8 border-t border-white/10 shrink-0">
                <button onClick={() => setIsStarted(false)} className="w-full py-4 border border-red-600/30 text-[9px] font-black uppercase tracking-widest text-red-600 hover:bg-red-600 hover:text-white transition-all shadow-sm">Eject Directory</button>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-neutral-900/10 overflow-hidden">
            <div className="px-4 py-6 border-b border-white/5 shrink-0 flex flex-col gap-4">
               <div className="flex justify-between items-center">
                 <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-neutral-600">Browser</h3>
                 <button onClick={selectAll} className="text-[7px] font-black uppercase border border-white/10 px-3 py-1.5 hover:bg-white hover:text-black transition-all">
                   {selectedIds.size === filteredFiles.length ? 'Deselect' : 'Select All Match'}
                 </button>
               </div>
               <div className="flex items-center gap-2 overflow-hidden">
                  {currentPath !== 'root' && (
                    <button 
                      onClick={navigateUp}
                      className="text-[7px] font-black uppercase bg-white/5 border border-white/10 px-2 py-1 hover:bg-white hover:text-black transition-all shrink-0"
                    >
                      Back
                    </button>
                  )}
                  <div className="text-[7px] font-bold text-neutral-500 truncate uppercase tracking-widest">
                    Path: {currentPath === 'root' ? '/' : `/${currentPath}`}
                  </div>
               </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <FileExplorer 
                  items={currentFolderItems} 
                  onFileSelect={playFile}
                  onMoveItem={handleBatchMove} 
                  onLocateFile={handleLocateFile}
                  isEmbedded={true}
                  selectedIds={selectedIds}
                  onToggleSelection={toggleSelection}
                  durations={durations}
                  ratings={ratings}
                  onRate={handleRate}
                  filterCriteria={{
                    searchText: debouncedSearch,
                    minSize, maxSize,
                    minDuration, maxDuration,
                    minDate, maxDate,
                    minRating
                  }}
                  sortKey={sortKey}
                  sortOrder={sortOrder}
                  activeId={activeFileId}
                  onToggleFolder={(id) => setCurrentPath(id)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={`fixed bottom-8 right-8 z-[60] flex items-center gap-4 transition-all duration-300 ${showPanel ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        <button onClick={toggleFullscreen} className="p-2 text-white/30 hover:text-white transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
        </button>
        <button onClick={() => setShowPanel(true)} className="p-2 text-white/30 hover:text-white transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.115-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.844zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" /></svg>
        </button>
      </div>
      
      {error && <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-6 py-2.5 font-black text-[9px] uppercase tracking-widest border border-white/20 shadow-xl">{error}</div>}
      
      <input {...({ ref: fallbackInputRef, type: "file", className: "hidden", webkitdirectory: "true", onChange: handleLegacyInput } as any)} />
    </div>
  );
};

export default App;
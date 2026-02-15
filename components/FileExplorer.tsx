
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { FileSystemItem, SortKey, SortOrder } from '../types';
import { matchSmartSearch } from '../App';

interface FilterCriteria {
  searchText: string;
  minSize: number;
  maxSize: number;
  minDuration: number;
  maxDuration: number;
  minDate: number;
  maxDate: number;
  minRating: number;
}

interface FileExplorerProps {
  items: FileSystemItem[];
  onFileSelect: (item: FileSystemItem) => void;
  onMoveItem: (item: FileSystemItem, target: FileSystemItem) => void;
  onLocateFile?: (path: string) => void;
  isEmbedded?: boolean;
  selectedIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  filterCriteria?: FilterCriteria;
  sortKey?: SortKey;
  sortOrder?: SortOrder;
  activeId?: string | null;
  durations?: Record<string, number>;
  ratings?: Record<string, number>;
  onRate?: (id: string, rating: number) => void;
}

const ROW_HEIGHT = 34; // Fixed height for virtualization

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return '--';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
};

const formatDuration = (seconds?: number) => {
  if (seconds === undefined || seconds === 0) return '--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (seconds < 1) return `0.${ms.toString().padStart(2, '0')}s`;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface FileRowProps {
  item: FileSystemItem & { depth: number; isExpanded?: boolean };
  isActive: boolean;
  isSelected: boolean;
  duration: number;
  rating: number;
  onToggleFolder: (id: string) => void;
  onFileSelect: (item: FileSystemItem) => void;
  onToggleSelection?: (id: string) => void;
  onRate?: (id: string, rating: number) => void;
  onLocateFile?: (path: string) => void;
  style?: React.CSSProperties;
}

const FileRow: React.FC<FileRowProps> = React.memo(({ 
  item, isActive, isSelected, duration, rating, onToggleFolder, onFileSelect, onToggleSelection, onRate, onLocateFile, style
}) => {
  const handleDragStart = (e: React.DragEvent) => {
    if (item.kind !== 'file') return;
    e.dataTransfer.setData('application/json', JSON.stringify({ fileId: item.id }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const renderRating = (id: string, currentRating: number = 0) => {
    return (
      <div className="flex gap-0 ml-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {[1, 2, 3, 4, 5].map((star) => (
          <svg
            key={star}
            onClick={() => onRate?.(id, currentRating === star ? star - 1 : star)}
            className={`w-3 h-3 transition-colors cursor-pointer fill-current ${star <= currentRating ? 'text-red-600' : 'text-neutral-800 hover:text-neutral-600'}`}
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
          </svg>
        ))}
      </div>
    );
  };

  return (
    <div
      onClick={() => item.kind === 'directory' ? onToggleFolder(item.id) : onFileSelect(item)}
      draggable={item.kind === 'file'}
      onDragStart={handleDragStart}
      className={`absolute left-0 right-0 flex items-center group cursor-pointer hover:bg-white/10 transition-colors border-b border-white/5 ${isSelected ? 'bg-red-600/10' : ''} ${item.kind === 'file' ? 'active:opacity-50' : ''} ${isActive ? 'bg-white/5' : ''}`}
      style={{ 
        ...style,
        height: ROW_HEIGHT,
        paddingLeft: `${item.depth * 12 + 6}px`, 
        paddingRight: '8px' 
      }}
    >
      {item.kind === 'file' && onToggleSelection && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(item.id);
          }}
          className={`w-3 h-3 mr-1.5 border transition-all flex items-center justify-center shrink-0 ${isSelected ? 'bg-red-600 border-red-600' : 'bg-transparent border-white/20 hover:border-white/40'}`}
        >
          {isSelected && <div className="w-1 h-1 bg-white"></div>}
        </div>
      )}

      <span className="w-3 h-3 mr-1 flex items-center justify-center text-[8px] text-white/30 shrink-0">
        {item.kind === 'directory' ? (item.isExpanded ? '▼' : '▶') : '•'}
      </span>
      
      <div className="flex-1 flex items-center justify-between overflow-hidden">
        <div className="flex items-center overflow-hidden min-w-0">
          <span className={`text-[9px] truncate uppercase tracking-widest px-1 py-0.5 rounded-sm transition-all ${item.kind === 'directory' ? 'font-black text-red-600 bg-red-600/5' : 'font-bold text-white'} ${isActive ? 'bg-red-600/20 ring-1 ring-red-600' : 'bg-transparent'}`}>
            {item.name || "UNNAMED"}
          </span>
          {item.kind === 'file' && renderRating(item.id, rating)}
        </div>
        
        {item.kind === 'file' && (
          <div className="flex items-center gap-2.5 ml-2 shrink-0">
            <span className="text-[8px] font-black text-neutral-500 uppercase tracking-tighter w-10 text-right">
              {formatDuration(duration)}
            </span>
            <span className="text-[8px] font-black text-neutral-600 uppercase tracking-tighter w-14 text-right">
              {formatSize(item.size)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLocateFile?.(item.id);
              }}
              title="Locate file"
              className="p-1 text-neutral-700 hover:text-red-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  items, onFileSelect, selectedIds = new Set(), onToggleSelection,
  filterCriteria, sortKey = 'name', sortOrder = 'asc',
  activeId, durations = {}, ratings = {}, onRate, onLocateFile
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root']));
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const searchActive = !!(filterCriteria?.searchText?.trim()) || (filterCriteria?.minRating && filterCriteria.minRating > 0);

  // Auto-expand parents of activeId
  useEffect(() => {
    if (activeId) {
      const parts = activeId.split('/');
      const parents: string[] = [];
      // Build parent paths: "folder", "folder/sub", etc
      for (let i = 1; i < parts.length; i++) {
        parents.push(parts.slice(0, i).join('/'));
      }
      if (parents.length > 0) {
        setExpandedFolders(prev => {
          const next = new Set(prev);
          let changed = false;
          parents.forEach(p => { 
            if (!next.has(p)) { 
              next.add(p); 
              changed = true; 
            } 
          });
          return changed ? next : prev;
        });
      }
    }
  }, [activeId]);

  // Handle resizing and scrolling for virtualization
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        setViewportHeight(entries[0].contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const flattenedList = useMemo(() => {
    const result: (FileSystemItem & { depth: number; isExpanded?: boolean })[] = [];
    const processNode = (node: FileSystemItem, depth: number) => {
      const duration = durations[node.id] || 0;
      const rating = ratings[node.id] || 0;
      const { searchText = '', minSize, maxSize, minDuration, maxDuration, minDate, maxDate, minRating = 0 } = filterCriteria || {};
      const nodeMatchesSearch = matchSmartSearch(node.name, searchText);

      if (node.kind === 'file') {
        const matchSize = (node.size || 0) >= (minSize || 0) && (node.size || 0) <= (maxSize || Infinity);
        const matchDuration = duration >= (minDuration || 0) && duration <= (maxDuration || Infinity);
        const matchDate = (node.lastModified || 0) >= (minDate || 0) && (node.lastModified || 0) <= (maxDate || Infinity);
        const matchRating = rating >= minRating;
        if (nodeMatchesSearch && matchSize && matchDuration && matchDate && matchRating) result.push({ ...node, depth });
      } else {
        const isExpanded = expandedFolders.has(node.id);
        const children = node.children || [];
        const originalResultLength = result.length;
        
        if (isExpanded || searchActive) {
          children.forEach(child => processNode(child, depth + 1));
        }
        
        const hasMatches = result.length > originalResultLength;
        if (hasMatches || (nodeMatchesSearch && node.id !== 'root')) {
          const matches = result.splice(originalResultLength);
          matches.sort((a, b) => {
            let valA: any, valB: any;
            if (sortKey === 'date') { valA = a.lastModified || 0; valB = b.lastModified || 0; }
            else if (sortKey === 'duration') { valA = durations[a.id] || 0; valB = durations[b.id] || 0; }
            else if (sortKey === 'rating') { valA = ratings[a.id] || 0; valB = ratings[b.id] || 0; }
            else { valA = (a as any)[sortKey] || 0; valB = (b as any)[sortKey] || 0; }
            if (sortKey === 'name' || sortKey === 'type') { valA = String(valA).toLowerCase(); valB = String(valB).toLowerCase(); }
            return valA < valB ? (sortOrder === 'asc' ? -1 : 1) : (sortOrder === 'asc' ? 1 : -1);
          });
          result.push({ ...node, depth, isExpanded });
          if (isExpanded) result.push(...matches);
        }
      }
    };
    items.forEach(item => processNode(item, 0));
    return result;
  }, [items, expandedFolders, filterCriteria, sortKey, sortOrder, durations, ratings, searchActive]);

  // Center activeId when it changes
  useEffect(() => {
    if (activeId && containerRef.current && flattenedList.length > 0) {
      const index = flattenedList.findIndex(item => item.id === activeId);
      if (index !== -1) {
        const targetScroll = (index * ROW_HEIGHT) - (viewportHeight / 2) + (ROW_HEIGHT / 2);
        containerRef.current.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      }
    }
  }, [activeId, flattenedList.length, viewportHeight]);

  // Virtualization slice
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 10);
  const endIndex = Math.min(flattenedList.length, Math.floor((scrollTop + viewportHeight) / ROW_HEIGHT) + 10);
  const visibleItems = flattenedList.slice(startIndex, endIndex);

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="w-full h-full overflow-y-auto scrollbar-hide relative"
    >
      <div style={{ height: flattenedList.length * ROW_HEIGHT, position: 'relative' }}>
        {visibleItems.map((item, idx) => (
          <FileRow 
            key={item.id}
            item={item}
            isActive={item.id === activeId}
            isSelected={selectedIds.has(item.id)}
            duration={durations[item.id] || 0}
            rating={ratings[item.id] || 0}
            onToggleFolder={toggleFolder}
            onFileSelect={onFileSelect}
            onToggleSelection={onToggleSelection}
            onRate={onRate}
            onLocateFile={onLocateFile}
            style={{ top: (startIndex + idx) * ROW_HEIGHT }}
          />
        ))}
        {flattenedList.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="w-8 h-[1px] bg-red-600/30 mx-auto mb-4"></div>
            <p className="text-neutral-700 text-[10px] uppercase tracking-[0.4em] font-black italic">No samples match filters</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileExplorer;

export interface AudioFile {
  name: string;
  file: File;
  handle?: FileSystemFileHandle;
}

export interface WaveformData {
  points: number[];
  duration: number;
  buffer: AudioBuffer;
}

export interface FileSystemItem {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  parentHandle: FileSystemDirectoryHandle | null;
  children?: FileSystemItem[];
  size?: number;
  lastModified?: number;
  type?: string;
  duration?: number;
  rating?: number;
}

export interface MoveShortcut {
  key: string;
  targetPath: string; // The ID/Path of the folder
}

export interface SamplerPadData {
  id: number;
  buffer: AudioBuffer | null;
  waveformPoints: number[] | null;
  colors: string[] | null;
  fileItem: FileSystemItem | null;
  gradientHues?: [number, number];
}

export type SortKey = 'name' | 'size' | 'type' | 'date' | 'duration' | 'rating';
export type SortOrder = 'asc' | 'desc';
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface FileSystemAccessWindow {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandleLike>;
}

export interface FileSystemDirectoryHandleLike {
  name: string;
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>;
  removeEntry?: (name: string) => Promise<void>;
}

export interface FileSystemFileHandleLike {
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}

export function supportsDirectoryExport(): boolean {
  return typeof window !== 'undefined' && typeof (window as FileSystemAccessWindow).showDirectoryPicker === 'function';
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandleLike | null> {
  const picker = (window as FileSystemAccessWindow).showDirectoryPicker;
  if (!picker) return null;
  try {
    return await picker({ mode: 'readwrite' });
  } catch {
    return null;
  }
}

export async function writeFileToDirectory(
  root: FileSystemDirectoryHandleLike,
  pathSegments: string[],
  filename: string,
  blob: Blob,
): Promise<void> {
  let directory = root;
  for (const segment of pathSegments) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }
  const fileHandle = await directory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

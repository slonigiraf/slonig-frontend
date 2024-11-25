import { IPFSHTTPClient } from 'kubo-rpc-client';

declare global {
  interface Window {
    ipfs?: IPFSHTTPClient;
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
  interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
    excludeAcceptAllOption?: boolean;
  }
  
  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
  }
  
  interface FileSystemFileHandle {
    createWritable: () => Promise<FileSystemWritableFileStream>;
  }
  
  interface FileSystemWritableFileStream {
    write: (data: Blob | BufferSource | string) => Promise<void>;
    close: () => Promise<void>;
  }
}
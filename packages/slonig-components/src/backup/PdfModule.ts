// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { readBookPdfNames } from '@slonigiraf/db';

const ROOT = 'books';
async function looksLikePdf(file: Blob): Promise<boolean> {
  if (file.size < 10) return false;
  const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  const tail = new TextDecoder().decode(await file.slice(Math.max(0, file.size - 2048)).arrayBuffer());
  return head === '%PDF-' && tail.includes('%%EOF');
}
function validateName(name: string): void {
  if (!name || name.length > 255 || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new Error('Invalid PDF filename');
  }
}
async function root(): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) throw new Error('OPFS is unavailable');
  return navigator.storage.getDirectory();
}
async function copyFile(from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle, name: string): Promise<void> {
  const file = await (await from.getFileHandle(name)).getFile();
  const writable = await (await to.getFileHandle(name, { create: true })).createWritable();
  try { await file.stream().pipeTo(writable); } catch (e) { await writable.abort().catch(() => undefined); throw e; }
}

export async function* readPdfChunks(signal?: AbortSignal, warn?: (message: string) => void): AsyncGenerator<{ name: string; bytes: Uint8Array; fileSize: number; fileOffset: number }> {

  // Only open OPFS when there is actually a PDF to export. An empty
  // (or not-yet-created) books directory is not a backup warning.
  let directory: FileSystemDirectoryHandle | undefined;
  const processed = new Set<string>();
  for await (const opfsName of readBookPdfNames(signal)) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    try {
      validateName(opfsName);
      if (processed.has(opfsName)) continue;
      processed.add(opfsName);
      if (!directory) {
        try { directory = await (await root()).getDirectoryHandle(ROOT); }
        catch (error) { warn?.(`PDF storage unavailable: ${(error as Error).message}`); return; }
      }
      const file = await (await directory.getFileHandle(opfsName)).getFile();
      if (!await looksLikePdf(file)) throw new Error('Invalid or truncated PDF');
      const reader = file.stream().getReader();
      let fileOffset = 0;
      try {
        while (true) {
          if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
          const part = await reader.read();
          if (part.done) break;
          // A single file is never held in memory. Archive entries preserve order.
          for (let offset = 0; offset < part.value.byteLength; offset += 1024 * 1024) {
            const bytes = part.value.subarray(offset, offset + 1024 * 1024);
            fileOffset += bytes.byteLength;
            yield { name: opfsName, bytes, fileSize: file.size, fileOffset };
          }
        }
      } finally { await reader.cancel(); }
    } catch (error) {
      if (signal?.aborted) throw error;
      warn?.(`PDF '${opfsName}' skipped: ${(error as Error).message}`);
    }
  }
}

/** Staged separately from live files; no live file is changed during validation. */
export class PdfRestoreStaging {
  private readonly path: string;
  private staging?: FileSystemDirectoryHandle;
  private rollbackDir?: FileSystemDirectoryHandle;
  private current?: { name: string; writable: FileSystemWritableFileStream };
  private readonly names = new Set<string>();
  private readonly originals = new Set<string>();
  private live?: FileSystemDirectoryHandle;
  private applied = false;
  private readonly modified = new Set<string>();
  constructor(operationId: string) { this.path = `slonig-restore-${operationId}`; }
  async write(name: string, bytes: Uint8Array): Promise<void> {
    validateName(name);
    if (!this.staging) this.staging = await (await root()).getDirectoryHandle(this.path, { create: true });
    if (this.current?.name !== name) {
      await this.closeCurrent();
      if (this.names.has(name)) throw new Error('PDF parts must be contiguous');
      const writable = await (await this.staging.getFileHandle(name, { create: true })).createWritable();
      this.current = { name, writable };
      this.names.add(name);
    }
    await this.current.writable.write(bytes as FileSystemWriteChunkType);
  }
  async closeCurrent(): Promise<void> {
    if (this.current) { await this.current.writable.close(); this.current = undefined; }
  }
  async validate(expectedNames: Set<string>): Promise<void> {
    await this.closeCurrent();
    for (const name of this.names) {
      if (!expectedNames.has(name)) throw new Error('Archive PDF does not match an included book');
      const file = await (await this.staging!.getFileHandle(name)).getFile();
      if (!await looksLikePdf(file)) throw new Error(`Invalid PDF: ${name}`);
    }
  }
  async apply(signal?: AbortSignal): Promise<void> {
    await this.closeCurrent();
    if (!this.names.size) return;
    const opfs = await root();
    this.live = await opfs.getDirectoryHandle(ROOT, { create: true });
    this.rollbackDir = await opfs.getDirectoryHandle(`${this.path}-rollback`, { create: true });
    // Rollback is possible even if a later copy or database transaction fails.
    this.applied = true;
    for (const name of this.names) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      try {
        await this.live.getFileHandle(name);
        await copyFile(this.live, this.rollbackDir, name);
        this.originals.add(name);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      }
      this.modified.add(name);
      await copyFile(this.staging!, this.live, name);
    }
  }
  async rollback(): Promise<void> {
    if (!this.applied || !this.live) return;
    for (const name of this.modified) {
      if (this.originals.has(name)) await copyFile(this.rollbackDir!, this.live, name);
      else await this.live.removeEntry(name).catch((error: DOMException) => {
        if (error.name !== 'NotFoundError') throw error;
      });
    }
    this.applied = false;
  }
  async cleanup(): Promise<void> {
    await this.closeCurrent().catch(() => undefined);
    const opfs = await root().catch(() => undefined);
    if (!opfs) return;
    for (const path of [this.path, `${this.path}-rollback`]) {
      await opfs.removeEntry(path, { recursive: true }).catch((error: DOMException) => {
        if (error.name !== 'NotFoundError') throw error;
      });
    }
  }
  get count(): number { return this.names.size; }
}

export async function removeAllOpfsFiles(): Promise<void> {
  if (!navigator.storage?.getDirectory) return;
  const directory = await navigator.storage.getDirectory();
  for await (const [name] of (directory as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    await directory.removeEntry(name, { recursive: true });
  }
}

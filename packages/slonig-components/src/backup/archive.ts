// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { CompressionClient } from './CompressionClient.js';
import {
  ARCHIVE_MAGIC, ARCHIVE_VERSION, MAX_FRAME_BYTES, MAX_HEADER_BYTES,
  concat, decodeDatabaseRows, frameHeaderBytes, fromUtf8, nextChain, parseUint32, sha256, uint32, utf8,
  type FrameHeader, type FrameKind
} from './codec.js';

export type ArchiveEntry = { kind: FrameKind; name?: string; bytes: Uint8Array };

export class ArchiveWriter {
  private chain = '0'.repeat(64);
  private count = 0;
  private readonly worker: CompressionClient;
  constructor(worker: CompressionClient) { this.worker = worker; }
  header(): Uint8Array { return concat(ARCHIVE_MAGIC, uint32(ARCHIVE_VERSION)); }
  async frame(entry: ArchiveEntry): Promise<Uint8Array> {
    if (entry.bytes.byteLength > MAX_FRAME_BYTES) throw new Error('Archive entry is too large; use smaller chunks');
    const header: FrameHeader = {
      kind: entry.kind, ...(entry.name === undefined ? {} : { name: entry.name }),
      length: entry.bytes.byteLength, sha256: await sha256(entry.bytes)
    };
    if (entry.kind === 'footer') header.chain = this.chain;
    const compressed = await this.worker.run('compress', entry.bytes);
    const buffer = concat(frameHeaderBytes(header, compressed.byteLength), compressed);
    if (entry.kind !== 'footer') { this.chain = await nextChain(this.chain, header); this.count++; }
    return buffer;
  }
  get entries(): number { return this.count; }
}

class ByteReader {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = new Uint8Array(0);
  bytesRead = 0;
  constructor(file: Blob) { this.reader = file.stream().getReader(); }
  async read(size: number, allowEof = false): Promise<Uint8Array | undefined> {
    if (size > MAX_FRAME_BYTES + MAX_HEADER_BYTES) throw new Error('Archive frame too large');
    const pieces: Uint8Array[] = [];
    let missing = size;
    while (missing) {
      if (!this.buffer.byteLength) {
        const next = await this.reader.read();
        if (next.done) {
          if (allowEof && missing === size) return undefined;
          throw new Error('Truncated backup archive');
        }
        this.buffer = next.value;
        continue;
      }
      const count = Math.min(this.buffer.byteLength, missing);
      pieces.push(this.buffer.subarray(0, count));
      this.buffer = this.buffer.subarray(count);
      missing -= count;
      this.bytesRead += count;
    }
    return concat(...pieces);
  }
  cancel(): Promise<void> { return this.reader.cancel().then(() => undefined); }
}

export async function* readArchive(file: Blob, worker: CompressionClient, signal?: AbortSignal, onVerifiedBytes?: (bytes: number, total: number) => void): AsyncGenerator<ArchiveEntry> {
  const reader = new ByteReader(file);
  let chain = '0'.repeat(64);
  let count = 0;
  let ended = false;
  try {
    const magic = await reader.read(12);
    if (!magic || fromUtf8(magic.subarray(0, 8)) !== fromUtf8(ARCHIVE_MAGIC) || parseUint32(magic.subarray(8)) !== ARCHIVE_VERSION) {
      throw new Error('Unsupported backup format/version');
    }
    while (true) {
      if (signal?.aborted) throw new DOMException('Operation cancelled', 'AbortError');
      const prefix = await reader.read(8, true);
      if (!prefix) break;
      const headerLength = parseUint32(prefix.subarray(0, 4));
      const payloadLength = parseUint32(prefix.subarray(4, 8));
      if (!headerLength || headerLength > MAX_HEADER_BYTES || payloadLength > MAX_FRAME_BYTES) throw new Error('Malformed frame length');
      const header = JSON.parse(fromUtf8((await reader.read(headerLength))!)) as FrameHeader;
      if (!['metadata', 'keys', 'db', 'pdf', 'footer'].includes(header.kind) ||
          typeof header.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(header.sha256) ||
          !Number.isSafeInteger(header.length) || header.length < 0 || header.length > MAX_FRAME_BYTES ||
          (header.name !== undefined && (typeof header.name !== 'string' || header.name.length > 512))) {
        throw new Error('Invalid archive entry header');
      }
      const compressed = (await reader.read(payloadLength))!;
      const bytes = await worker.run('decompress', compressed);
      if (bytes.byteLength !== header.length || await sha256(bytes) !== header.sha256) throw new Error('Archive checksum mismatch');
      if (header.kind === 'footer') {
        if (header.chain !== chain) throw new Error('Archive footer checksum mismatch');
        ended = true;
        const trailing = await reader.read(1, true);
        if (trailing) throw new Error('Unexpected data after archive footer');
        onVerifiedBytes?.(file.size, file.size);
        yield { kind: 'footer', bytes };
        break;
      }
      if (ended) throw new Error('Duplicate footer');
      chain = await nextChain(chain, header);
      count++;
      // Update only AFTER this frame has been fully decompressed and its
      // checksum/chain validated, not merely after reading its bytes.
      onVerifiedBytes?.(reader.bytesRead, file.size);
      yield { kind: header.kind, name: header.name, bytes };
    }
    if (!ended || count < 2) throw new Error('Backup footer missing');
  } finally { await reader.cancel(); }
}

/** Re-read all bytes AND check that the manifest could be restored. */
export async function verifyArchive(file: Blob, worker: CompressionClient, signal?: AbortSignal, onVerifiedBytes?: (bytes: number, total: number) => void): Promise<void> {
  let metadata: { tables: string[]; format?: string; formatVersion?: number } | undefined;
  let keysSeen = false;
  let footerSeen = false;
  let count = 0;
  const counts: Record<string, number> = {};
  const pdfNames = new Set<string>();
  for await (const entry of readArchive(file, worker, signal, onVerifiedBytes)) {
    if (!metadata && entry.kind !== 'metadata') throw new Error('Missing backup metadata');
    if (entry.kind === 'metadata') {
      if (metadata) throw new Error('Duplicate backup metadata');
      const m = JSON.parse(fromUtf8(entry.bytes)) as { tables: string[]; format?: string; formatVersion?: number } | undefined;
      if (!m || m.format !== 'slonig-backup' || m.formatVersion !== 1 ||
          !Array.isArray(m.tables) || !m.tables.includes('settings') || new Set(m.tables).size !== m.tables.length) {
        throw new Error('Invalid archive metadata');
      }
      metadata = m;
    } else if (entry.kind === 'keys') {
      if (keysSeen) throw new Error('Duplicate account keys');
      const keys = JSON.parse(fromUtf8(entry.bytes)) as unknown;
      if (!Array.isArray(keys) || !keys.length) throw new Error('Archive has no account keys');
      keysSeen = true;
    } else if (entry.kind === 'db') {
      if (!entry.name || !metadata?.tables.includes(entry.name)) throw new Error('Unexpected archive database table');
      counts[entry.name] = (counts[entry.name] ?? 0) + decodeDatabaseRows(entry.bytes).length;
    } else if (entry.kind === 'pdf') {
      if (!entry.name) throw new Error('PDF entry has no name');
      pdfNames.add(entry.name);
    } else if (entry.kind === 'footer') {
      const footer = JSON.parse(fromUtf8(entry.bytes)) as {
        entries?: number; rowCounts?: Record<string, number>; pdfFiles?: string[]
      };
      if (footerSeen || footer.entries !== count ||
          !footer.rowCounts || !Array.isArray(footer.pdfFiles) ||
          metadata?.tables.some((name) => counts[name] === undefined || counts[name] !== footer.rowCounts?.[name]) ||
          footer.pdfFiles.length !== pdfNames.size || footer.pdfFiles.some((name) => !pdfNames.has(name))) {
        throw new Error('Archive manifest validation failed');
      }
      footerSeen = true;
    }
    if (entry.kind !== 'footer') count++;
  }
  if (!metadata || !keysSeen || !footerSeen) throw new Error('Backup is incomplete');
}

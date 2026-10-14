// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Small, versioned, length-delimited frames. Each compressed frame is independently
// checksummed; the footer commits to the ordered header+payload hash chain.
// The binary header is a format signature, independent of the .slonig filename.
export const ARCHIVE_MAGIC = new TextEncoder().encode('SLONIGBK');
export const ARCHIVE_VERSION = 1;
export const MAX_FRAME_BYTES = 32 * 1024 * 1024;
export const MAX_HEADER_BYTES = 8192;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export type FrameKind = 'metadata' | 'keys' | 'db' | 'pdf' | 'footer';
export interface FrameHeader {
  kind: FrameKind;
  name?: string;
  length: number;
  sha256: string;
  // The chain value is the hash of every preceding non-footer frame.
  chain?: string;
}
export interface ArchiveMetadata {
  format: 'slonig-backup';
  formatVersion: 1;
  createdAt: string;
  databaseSchemaVersion: number;
  tables: string[];
  policy: 'essential' | 'everything';
  pdfCount: number;
}

export const utf8 = (value: string): Uint8Array => encoder.encode(value);
export const fromUtf8 = (value: Uint8Array): string => decoder.decode(value);
export function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}
export function parseUint32(bytes: Uint8Array): number {
  return new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true);
}
export function concat(...pieces: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(pieces.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const piece of pieces) { result.set(piece, at); at += piece.byteLength; }
  return result;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, '0')).join('');
}
export async function nextChain(chain: string, header: FrameHeader): Promise<string> {
  return sha256(utf8(chain + JSON.stringify(header)));
}
export function frameHeaderBytes(header: FrameHeader, payloadBytes: number): Uint8Array {
  const headerBytes = utf8(JSON.stringify(header));
  if (headerBytes.byteLength > MAX_HEADER_BYTES || payloadBytes > MAX_FRAME_BYTES) throw new Error('Backup frame exceeds size limit');
  return concat(uint32(headerBytes.byteLength), uint32(payloadBytes), headerBytes);
}

/**
 * Compact database record container. Typed values live in binary sidecars, never
 * JSON number arrays (which can take tens of times more heap than their bytes).
 * Old JSON-only v1 entries remain readable for archives already downloaded.
 */
export class BackupBatchTooLargeError extends Error {
  constructor() { super('Database backup batch exceeds the safe memory limit'); this.name = 'BackupBatchTooLargeError'; }
}
const DB_MAGIC = utf8('SLDB2');
const MAX_DB_FRAME_SIZE = 12 * 1024 * 1024;

export async function encodeDatabaseRows(rows: unknown[]): Promise<Uint8Array> {
  const binaries: Uint8Array[] = [];
  let binarySize = 0;
  const addBinary = (bytes: Uint8Array): { offset: number; length: number } => {
    if (bytes.byteLength > MAX_DB_FRAME_SIZE - binarySize) throw new BackupBatchTooLargeError();
    const location = { offset: binarySize, length: bytes.byteLength };
    binaries.push(bytes);
    binarySize += bytes.byteLength;
    return location;
  };
  async function encode(value: unknown, depth: number): Promise<unknown> {
    if (depth > 80) throw new Error('Database record is too deeply nested');
    if (value === undefined) return { __slonigType: 'Undefined' };
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      // Guard before allocating a possibly enormous UTF-8 buffer.
      if (value.length > MAX_DB_FRAME_SIZE) throw new BackupBatchTooLargeError();
      return value;
    }
    if (typeof value === 'number') return Number.isFinite(value) ? value : { __slonigType: 'Number', data: String(value) };
    if (typeof value === 'bigint') return { __slonigType: 'BigInt', data: String(value) };
    if (value instanceof Date) return { __slonigType: 'Date', data: value.toISOString() };
    if (value instanceof Blob) {
      if (value.size > MAX_DB_FRAME_SIZE - binarySize) throw new BackupBatchTooLargeError();
      return { __slonigType: 'Blob', mime: value.type, ...addBinary(new Uint8Array(await value.arrayBuffer())) };
    }
    if (value instanceof ArrayBuffer) return { __slonigType: 'ArrayBuffer', ...addBinary(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      return { __slonigType: 'TypedArray', ctor: view.constructor.name, ...addBinary(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) };
    }
    if (Array.isArray(value)) {
      const encoded = [];
      for (const item of value) encoded.push(await encode(item, depth + 1));
      return encoded;
    }
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      const result: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '__slonigType') throw new Error('Reserved record property');
        result[key] = await encode(v, depth + 1);
      }
      return result;
    }
    throw new Error(`Unsupported IndexedDB value: ${typeof value}`);
  }
  const json = utf8(JSON.stringify(await encode(rows, 0)));
  const size = DB_MAGIC.length + 4 + json.byteLength + binarySize;
  if (size > MAX_DB_FRAME_SIZE) throw new BackupBatchTooLargeError();
  return concat(DB_MAGIC, uint32(json.byteLength), json, ...binaries);
}

export function decodeDatabaseRows(bytes: Uint8Array): unknown[] {
  const binaryFormat = bytes.length >= 9 && DB_MAGIC.every((b, i) => bytes[i] === b);
  let data: unknown;
  let binary = new Uint8Array(0);
  if (binaryFormat) {
    const headerSize = parseUint32(bytes.subarray(DB_MAGIC.length, DB_MAGIC.length + 4));
    const at = DB_MAGIC.length + 4;
    if (headerSize > MAX_DB_FRAME_SIZE || headerSize > bytes.length - at) throw new Error('Malformed database frame');
    data = JSON.parse(fromUtf8(bytes.subarray(at, at + headerSize)));
    binary = bytes.subarray(at + headerSize);
  } else {
    // Backwards compatibility with v1 records encoded as JSON byte arrays.
    data = JSON.parse(fromUtf8(bytes));
  }
  const types: Record<string, (bytes: Uint8Array) => ArrayBufferView> = {
    Uint8Array: (v) => v, Int8Array: (v) => new Int8Array(v.buffer),
    Uint16Array: (v) => new Uint16Array(v.buffer), Int16Array: (v) => new Int16Array(v.buffer),
    Uint32Array: (v) => new Uint32Array(v.buffer), Int32Array: (v) => new Int32Array(v.buffer),
    Float32Array: (v) => new Float32Array(v.buffer), Float64Array: (v) => new Float64Array(v.buffer),
    Uint8ClampedArray: (v) => new Uint8ClampedArray(v.buffer), DataView: (v) => new DataView(v.buffer)
  };
  function decode(value: unknown, depth: number): unknown {
    if (depth > 80) throw new Error('Record nesting limit exceeded');
    if (Array.isArray(value)) return value.map((v) => decode(v, depth + 1));
    if (!value || typeof value !== 'object') return value;
    const obj = value as Record<string, unknown>;
    if (typeof obj.__slonigType === 'string') {
      const stored = obj.data;
      switch (obj.__slonigType) {
        case 'Undefined': return undefined;
        case 'Number': if (!['NaN', 'Infinity', '-Infinity'].includes(String(stored))) break; return Number(stored);
        case 'BigInt': if (typeof stored !== 'string' || !/^-?\d+$/.test(stored)) break; return BigInt(stored);
        case 'Date': if (typeof stored !== 'string' || !Number.isFinite(Date.parse(stored))) break; return new Date(stored);
        case 'ArrayBuffer':
        case 'Blob':
        case 'TypedArray': {
          let content: Uint8Array;
          if (binaryFormat) {
            const offset = obj.offset;
            const length = obj.length;
            if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
                (offset as number) < 0 || (length as number) < 0 ||
                (offset as number) > binary.byteLength - (length as number)) break;
            content = binary.slice(offset as number, (offset as number) + (length as number));
          } else {
            if (!Array.isArray(stored) || stored.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) break;
            content = new Uint8Array(stored);
          }
          if (obj.__slonigType === 'ArrayBuffer') return content.buffer;
          if (obj.__slonigType === 'Blob') return new Blob([content], { type: typeof obj.mime === 'string' ? obj.mime : '' });
          const ctor = types[String(obj.ctor)];
          if (ctor) {
            const size = ({ Uint16Array: 2, Int16Array: 2, Uint32Array: 4, Int32Array: 4, Float32Array: 4, Float64Array: 8 } as Record<string, number>)[String(obj.ctor)] || 1;
            if (content.length % size !== 0) break;
            return ctor(content);
          }
          break;
        }
      }
      throw new Error('Invalid backup record type encoding');
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const [key, v] of Object.entries(obj)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe record property');
      result[key] = decode(v, depth + 1);
    }
    return result;
  }
  const result = decode(data, 0);
  if (!Array.isArray(result)) throw new Error('Expected an array of database rows');
  return result;
}

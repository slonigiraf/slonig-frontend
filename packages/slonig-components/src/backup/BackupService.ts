// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { BACKUP_DB_SCHEMA, backupTableNames, countBackupRows, readBackupRows, countBookPdfs } from '@slonigiraf/db';
import { exportAccountKeys } from './AccountModule.js';
import { ArchiveWriter } from './archive.js';
import { CompressionClient } from './CompressionClient.js';
import { BackupBatchTooLargeError, encodeDatabaseRows, utf8, type ArchiveMetadata, type FrameKind } from './codec.js';
import { readPdfChunks } from './PdfModule.js';
import { confirmBackupCompletion, OperationService } from './status.js';
import { backupFilename } from './backupFilename.js';
import { backupPercent, type BackupProgressPhase } from './backupProgress.js';
import type { OperationPhase } from './status.js';

interface SaveHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}
export class BackupService extends OperationService {
  constructor() { super('backup'); }
  private updateProgress(phase: OperationPhase, message: string, stage: BackupProgressPhase, completed = 0, total = 1): void {
    // Keep one continuous percentage: 100% is reached after the native
    // file stream closes or a fallback browser download is launched.
    const percent = Math.max(this.status.completed, backupPercent(stage, completed, total));
    this.set(phase, message, percent, 100, 'steps');
  }
  /** File picker is requested BEFORE any await to preserve the user gesture. */
  async start(address?: string, accountName?: string, pickerDescription = 'Slonig backup archive'): Promise<void> {
    const signal = this.begin();
    const fileName = backupFilename(accountName || address, new Date());
    this.updateProgress('generating', 'Select a destination for your backup', 'preparing');
    let handle: SaveHandle | undefined;
    const picker = (window as Window & { showSaveFilePicker?: (options: unknown) => Promise<SaveHandle> }).showSaveFilePicker;
    let worker: CompressionClient | undefined;
    let writable: FileSystemWritableFileStream | undefined;
    const fallbackParts: Uint8Array[] = [];
    const MAX_FALLBACK_SIZE = 64 * 1024 * 1024;
    let fallbackSize = 0;
    try {
      // Browsers may reject the picker either synchronously or asynchronously.
      // Both SecurityError cases are normal download fallbacks, not warnings.
      let pickerPromise: Promise<SaveHandle> | undefined;
      try {
        pickerPromise = picker ? picker.call(window, {
          suggestedName: fileName,
          types: [{ description: pickerDescription, accept: { 'application/octet-stream': ['.slonig'] } }]
        }) : undefined;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'SecurityError')) throw error;
      }
      if (pickerPromise) {
        try { handle = await pickerPromise; }
        catch (error) {
          if (!(error instanceof DOMException && error.name === 'SecurityError')) throw error;
          // The native picker may be blocked by browser policy. Downloading
          // instead is normal and does not make the backup incomplete.
        }
      }
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (handle) writable = await handle.createWritable();
      worker = new CompressionClient();
      const writer = new ArchiveWriter(worker);
      const write = async (buffer: Uint8Array): Promise<void> => {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        if (writable) await writable.write(buffer as FileSystemWriteChunkType);
        else {
          // The legacy browser download API requires an in-memory Blob. Fail safely
          // instead of exhausting all memory on devices without streaming saves.
          if (fallbackSize + buffer.byteLength > MAX_FALLBACK_SIZE) {
            throw new Error('This archive is too large for the fallback download. Use a browser supporting streaming file saves.');
          }
          fallbackParts.push(buffer);
          fallbackSize += buffer.byteLength;
        }
      };
      const append = async (kind: FrameKind, bytes: Uint8Array, name?: string): Promise<void> => {
        await write(await writer.frame({ kind, bytes, name }));
      };
      this.updateProgress('generating', 'Writing versioned archive metadata', 'preparing', 1, 3);
      await write(writer.header());
      const tables = backupTableNames();
      const metadata: ArchiveMetadata = {
        format: 'slonig-backup', formatVersion: 1, createdAt: new Date().toISOString(),
        databaseSchemaVersion: BACKUP_DB_SCHEMA(), tables,
        policy: 'everything',
        pdfCount: await countBookPdfs()
      };
      await append('metadata', utf8(JSON.stringify(metadata)));
      await append('keys', utf8(JSON.stringify(exportAccountKeys(address))));
      this.updateProgress('generating', 'Account keys archived', 'preparing', 2, 3);
      const totalRowCounts = await countBackupRows(signal);
      const totalRows = Object.values(totalRowCounts).reduce((sum, count) => sum + count, 0);
      this.updateProgress('generating', 'Database record counts prepared', 'preparing', 3, 3);
      // Oversized batches are recursively split before a large JSON/binary frame
      // can allocate unbounded memory. A single oversized record fails safely.
      const appendDatabaseBatch = async (tableName: string, rows: unknown[]): Promise<void> => {
        try {
          const bytes = await encodeDatabaseRows(rows);
          await append('db', bytes, tableName);
        } catch (error) {
          if (error instanceof BackupBatchTooLargeError && rows.length > 1) {
            const middle = Math.floor(rows.length / 2);
            await appendDatabaseBatch(tableName, rows.slice(0, middle));
            await appendDatabaseBatch(tableName, rows.slice(middle));
          } else if (error instanceof BackupBatchTooLargeError) {
            throw new Error(`A ${tableName} record exceeds the 12 MiB safe per-frame limit. Back up smaller records or move large files to OPFS.`);
          } else throw error;
        }
      };
      const counts: Record<string, number> = {};
      let exportedRows = 0;
      for await (const { tableName, rows } of readBackupRows(signal)) {
        await appendDatabaseBatch(tableName, rows);
        counts[tableName] = (counts[tableName] ?? 0) + rows.length;
        exportedRows += rows.length;
        this.updateProgress('generating', `Exporting ${tableName}`, 'database', exportedRows, totalRows || 1);
      }
      this.updateProgress('generating', 'Database exported; processing PDFs', 'database', 1, 1);
      const pdfNames = new Set<string>();
      for await (const { name, bytes, fileSize, fileOffset } of readPdfChunks(signal, (warning) => this.warn(warning))) {
        await append('pdf', bytes, name);
        pdfNames.add(name);
        // Each PDF contributes one file's worth of progress, including partial
        // progress within a multi-megabyte PDF. Missing PDFs remain warnings.
        const completedFiles = Math.max(0, pdfNames.size - 1) + fileOffset / fileSize;
        this.updateProgress('generating', `Writing PDF: ${name}`, 'pdf', completedFiles, metadata.pdfCount || 1);
      }
      this.updateProgress('generating', 'PDF export finished', 'pdf', 1, 1);
      const footer = {
        entries: writer.entries, rowCounts: counts, pdfFiles: [...pdfNames], warnings: this.status.warnings
      };
      await append('footer', utf8(JSON.stringify(footer)));
      this.updateProgress('generated', 'Archive generation completed', 'finalizing', 1, 2);
      if (writable) {
        // Closing the writable stream commits the file to the chosen location.
        // Avoid rereading/decompressing the archive after saving: checksums
        // are already recorded as frames are generated, and are validated
        // when a backup is restored.
        await writable.close();
        writable = undefined;
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        await confirmBackupCompletion();
        this.updateProgress('saved', 'Backup saved', 'complete');
      } else {
        const blob = new Blob(fallbackParts as BlobPart[], { type: 'application/octet-stream' });
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = fileName;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
        // The browser download API cannot verify the file on disk, but a
        // successfully triggered download counts as a completed backup for
        // the account-deletion safeguard (as requested by the product flow).
        await confirmBackupCompletion();
        this.updateProgress('download-initiated', 'Backup completed', 'complete');
      }
    } catch (error) {
      if (writable) await writable.abort().catch(() => undefined);
      this.fail(error);
      throw error;
    } finally { worker?.stop(); }
  }
}

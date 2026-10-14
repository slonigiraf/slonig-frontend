// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import {
  BACKUP_DB_SCHEMA, commitRestoreStaging, discardRestoreStaging,
  stageRestoreBatch, validateRestoreTableNames, getStagedBookNames
} from '@slonigiraf/db';
import { readArchive } from './archive.js';
import { assertSlonigBackupFile } from './backupFile.js';
import { StagedAccounts, validateAccountKeys, type BackupKey } from './AccountModule.js';
import { CompressionClient } from './CompressionClient.js';
import { decodeDatabaseRows, fromUtf8, type ArchiveMetadata } from './codec.js';
import { PdfRestoreStaging } from './PdfModule.js';
import { migrateBackupRows } from './migrations.js';
import { OperationService } from './status.js';
import { restorePercent, type RestoreProgressStage } from './restoreProgress.js';
import type { OperationPhase } from './status.js';

interface Footer { entries: number; rowCounts: Record<string, number>; pdfFiles: string[]; warnings: string[] }
function validFooter(value: unknown): asserts value is Footer {
  const f = value as Footer;
  if (!f || !Number.isSafeInteger(f.entries) || f.entries < 2 ||
    !f.rowCounts || typeof f.rowCounts !== 'object' || Array.isArray(f.rowCounts) ||
    !Array.isArray(f.pdfFiles) || !Array.isArray(f.warnings)) throw new Error('Invalid archive footer');
}
function validateMetadata(value: unknown): asserts value is ArchiveMetadata {
  const m = value as ArchiveMetadata;
  if (!m || m.format !== 'slonig-backup' || m.formatVersion !== 1 ||
    typeof m.createdAt !== 'string' || !Number.isFinite(Date.parse(m.createdAt)) ||
    !Number.isSafeInteger(m.databaseSchemaVersion) || m.databaseSchemaVersion <= 0 ||
    m.databaseSchemaVersion > BACKUP_DB_SCHEMA() ||
    !['essential', 'everything'].includes(m.policy) ||
    !Number.isSafeInteger(m.pdfCount) || m.pdfCount < 0 || !Array.isArray(m.tables)) {
    throw new Error('Incompatible backup. Update the app or use a supported backup version.');
  }
  validateRestoreTableNames(m.tables);
}

export class RestoreService extends OperationService {
  constructor() { super('restore'); }
  private updateProgress(phase: OperationPhase, message: string, stage: RestoreProgressStage, completed = 0, total = 1): void {
    const percent = Math.max(this.status.completed, restorePercent(stage, completed, total));
    this.set(phase, message, percent, 100, 'steps');
  }
  async restore(file: File, onAccountRestored?: (address: string) => void): Promise<void> {
    const signal = this.begin();
    let worker: CompressionClient | undefined;
    const operationId = crypto.randomUUID();
    const pdfs = new PdfRestoreStaging(operationId);
    let accounts: StagedAccounts | undefined;
    let metadata: ArchiveMetadata | undefined;
    let footer: Footer | undefined;
    const seenTables = new Set<string>();
    const rowCounts: Record<string, number> = {};
    const pdfNames = new Set<string>();
    let frames = 0;
    let committed = false;
    let rollbackFailed = false;
    let pdfAvailable = true;
    let verifiedBytes = 0;
    try {
      // Reject unsupported extensions before reading or staging any archive data.
      assertSlonigBackupFile(file);
      worker = new CompressionClient();
      this.updateProgress('validating', 'Reading and verifying archive', 'archive');
      for await (const entry of readArchive(file, worker, signal, (bytes) => { verifiedBytes = bytes; })) {
        if (!metadata && entry.kind !== 'metadata') throw new Error('Archive metadata must be first');
        if (entry.kind === 'metadata') {
          if (metadata) throw new Error('Duplicate metadata entry');
          const parsed: unknown = JSON.parse(fromUtf8(entry.bytes));
          validateMetadata(parsed);
          metadata = parsed;
        } else if (entry.kind === 'keys') {
          if (accounts) throw new Error('Duplicate account keys entry');
          const keys: unknown = JSON.parse(fromUtf8(entry.bytes));
          validateAccountKeys(keys);
          accounts = new StagedAccounts(keys as BackupKey[]);
        } else if (entry.kind === 'db') {
          if (!metadata || !entry.name || !metadata.tables.includes(entry.name)) throw new Error('Unexpected database table');
          const rows = migrateBackupRows(metadata.databaseSchemaVersion, entry.name, decodeDatabaseRows(entry.bytes));
          await stageRestoreBatch(operationId, entry.name, rows);
          seenTables.add(entry.name);
          rowCounts[entry.name] = (rowCounts[entry.name] ?? 0) + rows.length;
        } else if (entry.kind === 'pdf') {
          if (!metadata || metadata.policy !== 'everything' || !entry.name) throw new Error('Unexpected PDF entry');
          pdfNames.add(entry.name);
          if (pdfAvailable) {
            try { await pdfs.write(entry.name, entry.bytes); }
            catch (error) {
              if (!navigator.storage?.getDirectory || (error instanceof DOMException && ['NotSupportedError', 'SecurityError'].includes(error.name))) {
                pdfAvailable = false;
                this.warn('PDF storage is unavailable; database and account data can still be restored.');
              } else throw error;
            }
          }
        } else if (entry.kind === 'footer') {
          if (footer) throw new Error('Duplicate archive footer');
          const parsed: unknown = JSON.parse(fromUtf8(entry.bytes));
          validFooter(parsed);
          footer = parsed;
        }
        if (entry.kind !== 'footer') frames++;
        // The archive reader reports only checksum-verified bytes. Advance
        // after the corresponding database/PDF entry has actually been staged.
        this.updateProgress(
          entry.kind === 'db' || entry.kind === 'pdf' ? 'staging' : 'validating',
          'Reading and restoring archive', 'archive', verifiedBytes, file.size
        );
      }
      if (!metadata || !accounts || !footer || footer.entries !== frames ||
          seenTables.size !== metadata.tables.length ||
          metadata.tables.some((name) => !seenTables.has(name) || rowCounts[name] !== footer!.rowCounts[name]) ||
          new Set(footer.pdfFiles).size !== footer.pdfFiles.length ||
          footer.pdfFiles.length !== pdfNames.size || footer.pdfFiles.some((name) => !pdfNames.has(name))) {
        throw new Error('Backup is incomplete or its manifest does not match its content');
      }
      for (const warning of footer.warnings) if (typeof warning === 'string') this.warn(warning);
      // PDFs are only allowed for books actually included in this restoration.
      // The book table has been staged but the existing DB is still untouched.
      if (pdfAvailable && pdfs.count) {
        // Check against staged book names without loading the entire backup in memory.
        const names = new Set<string>();
        // A book PDF must exist only if 'books' is part of the archive.
        if (!metadata.tables.includes('books')) throw new Error('Archive PDFs require the books table');
        // Collect just the names while the restored rows are still staged.
        for (const name of await getStagedBookNames(operationId)) names.add(name);
        await pdfs.validate(names);
      }
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      this.updateProgress('committing', 'Applying staged accounts, PDFs and database transaction', 'commit', 0, 3);
      accounts.apply();
      this.updateProgress('committing', 'Applying staged PDF files with rollback copies', 'commit', 1, 3);
      if (pdfAvailable) await pdfs.apply(signal);
      this.updateProgress('committing', 'Committing IndexedDB in one transaction', 'commit', 2, 3);
      // Treat the archive the user already possesses as a completed backup.
      // Record the restore time in the same atomic transaction as the restored
      // settings so the reminder never reads the archived (potentially old) time.
      await commitRestoreStaging(operationId, metadata.tables, signal, Date.now());
      committed = true;
      // No await between successful database commit and status transition.
      this.updateProgress('restored', 'Restore committed successfully', 'complete');
      try { onAccountRestored?.(accounts.firstAddress); }
      catch (error) { this.warn(`Restore succeeded but selecting the account failed: ${String(error)}`); }
    } catch (error) {
      if (!committed) {
        try { await pdfs.rollback(); } catch (rollbackError) { rollbackFailed = true; this.warn(`PDF rollback failed; recovery files retained: ${String(rollbackError)}`); }
        try { accounts?.rollback(); } catch (rollbackError) { this.warn(`Account rollback failed: ${String(rollbackError)}`); }
      }
      this.fail(error);
      throw error;
    } finally {
      await discardRestoreStaging(operationId).catch((error) => this.warn(`Staging cleanup failed: ${String(error)}`));
      // If rollback fails, retain OPFS rollback files for manual recovery.
      if (!rollbackFailed) await pdfs.cleanup().catch((error) => this.warn(`PDF staging cleanup failed: ${String(error)}`));
      worker?.stop();
    }
  }
}

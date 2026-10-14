import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { shouldExportDatabaseRow, shouldIncludeBackupTable } from '../../../db/src/backup.ts';

const root = new URL('../../../../', import.meta.url);
const source = (relative) => readFile(new URL(relative, root), 'utf8');

describe('backup always includes every data category', () => {
  it('shows no optional backup-data switch in settings or reminders', async () => {
    for (const path of [
      'packages/page-settings/src/General.tsx',
      'packages/apps/src/BackupReminder.tsx'
    ]) {
      const view = await source(path);
      assert.doesNotMatch(view, /includeEverything|Include everything/);
      assert.match(view, /<DBExport\b/);
    }
  });
  it('does not expose a partial-backup flag in the UI or the service', async () => {
    const view = await source('packages/slonig-components/src/DBExport.tsx');
    const service = await source('packages/slonig-components/src/backup/BackupService.ts');
    assert.doesNotMatch(view, /includeEverything/);
    assert.match(view, /service\.start\(currentPair\?\.address,/);
    assert.match(service, /async start\(address\?: string, accountName\?: string\)/);
    assert.doesNotMatch(service, /includeEverything/);
  });
  it('always writes full-policy metadata and streams database and PDFs', async () => {
    const service = await source('packages/slonig-components/src/backup/BackupService.ts');
    const storage = await source('packages/db/src/backupStorage.ts');
    assert.match(service, /policy: 'everything'/);
    assert.match(service, /pdfCount: await countBookPdfs\(\)/);
    assert.match(service, /backupTableNames\(\)/);
    assert.match(service, /readBackupRows\(signal\)/);
    assert.match(service, /for await \(const \{ name, bytes, fileSize, fileOffset \} of readPdfChunks\(signal,/);
    assert.match(storage, /backupTableNames\(\)/);
    assert.doesNotMatch(storage, /includeEverything/);
  });
  it('backs up parsed books, derived data, caches and abilities without filtering', () => {
    for (const table of ['settings', 'lessons', 'abilities', 'books', 'bookPages', 'bookChapters', 'bookConcepts', 'skills', 'exerciseTemplates', 'cidCache', 'standardEmbeddings', 'bookProcessingRuns']) {
      assert.equal(shouldIncludeBackupTable(table), true, table);
      assert.equal(shouldExportDatabaseRow(table), true, table);
    }
    assert.equal(shouldIncludeBackupTable('backupStaging'), false);
    assert.equal(shouldExportDatabaseRow('backupStaging'), false);
  });
});

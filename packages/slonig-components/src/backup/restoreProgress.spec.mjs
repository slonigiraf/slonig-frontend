import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { restorePercent } from './restoreProgress.ts';

const src = new URL('../', import.meta.url);
const code = (path) => readFile(new URL(path, src), 'utf8');

describe('Account restore progress', () => {
  it('maps archive bytes to 0–90% and commit steps to 90–99%', () => {
    assert.equal(restorePercent('archive', 0, 100), 0);
    assert.equal(restorePercent('archive', 25, 100), 22);
    assert.equal(restorePercent('archive', 50, 100), 45);
    assert.equal(restorePercent('archive', 100, 100), 90);
    assert.equal(restorePercent('commit', 0, 3), 90);
    assert.equal(restorePercent('commit', 1, 3), 93);
    assert.equal(restorePercent('commit', 2, 3), 96);
    assert.equal(restorePercent('commit', 3, 3), 99);
    assert.equal(restorePercent('complete'), 100);
  });
  it('handles empty and out-of-range byte totals without false completion', () => {
    assert.equal(restorePercent('archive', 0, 0), 0);
    assert.equal(restorePercent('archive', Number.NaN, 100), 0);
    assert.equal(restorePercent('archive', -1, 100), 0);
    assert.equal(restorePercent('archive', 200, 100), 90);
    assert.equal(restorePercent('commit', Number.POSITIVE_INFINITY, 3), 90);
    assert.ok(restorePercent('archive', 100, 100) < 100);
    assert.ok(restorePercent('commit', 3, 3) < 100);
  });
  it('tracks verified-and-staged file bytes and reaches 100% only on successful commit', async () => {
    const service = await code('backup/RestoreService.ts');
    const archive = await code('backup/archive.ts');
    assert.match(archive, /onVerifiedBytes\?\.\(reader\.bytesRead, file\.size\)/);
    assert.match(service, /readArchive\(file, worker, signal, \(bytes\) => \{ verifiedBytes = bytes; \}\)/);
    assert.match(service, /'archive', verifiedBytes, file\.size/);
    assert.match(service, /'commit', 0, 3/);
    assert.match(service, /'commit', 1, 3/);
    assert.match(service, /'commit', 2, 3/);
    const databaseCommit = service.indexOf('await commitRestoreStaging(');
    const completed = service.indexOf("this.updateProgress('restored', 'Restore committed successfully', 'complete')");
    assert.ok(databaseCommit !== -1 && completed > databaseCommit);
  });
  it('localizes every new import/export UI string in each supported locale', async () => {
    const fs = await import('node:fs/promises');
    const base = new URL('../../apps/public/locales/', src);
    const slonig = await code('DBImport.tsx');
    const exportView = await code('DBExport.tsx');
    const warningPopup = await code('BackupWarningsPopup.tsx');
    const restoring = await code('../../page-accounts/src/modals/RestoringProgress.tsx');
    const fullScreen = await code('FullscreenActivity.tsx');
    assert.match(restoring, /<FullscreenActivity hideHeader/);
    assert.doesNotMatch(restoring, /caption=\{t\('Restore'\)\}/);
    assert.match(fullScreen, /\{!hideHeader && <Top>/);
    const keys = [
      'Verifying backup', 'Restoring data', 'Finishing restore',
      'Restore failed. Check the backup file and try again.', 'Restore completed with warnings',
      'Restore warnings', 'Backup completed with warnings', 'Backup completed',
      'Restore cancelled', 'Backup warnings',
      'Backup failed. Please try again.', 'This backup file is invalid or unsupported.',
      'The backup is too large for this browser.', 'Slonig backup archive',
      'Backup again', 'click to select *.slonig file',
      'PDF storage is unavailable. PDF files may be missing from this backup.',
      'PDF "{{name}}" was skipped.', 'Other backup warning',
      'Some files may be missing from this backup.', 'Reason: {{reason}}',
      'Invalid PDF filename', 'Invalid or truncated PDF', 'OPFS is unavailable'
    ];
    for (const key of keys) assert.ok([slonig, exportView, warningPopup, restoring].some((source) => source.includes(`t('${key}'`)), `Missing static translation call: ${key}`);
    const englishNamespace = JSON.parse(await fs.readFile(new URL('en/slonig-components.json', base), 'utf8'));
    assert.equal(englishNamespace['click to select *.slonig file'], 'click to select *.slonig file');
    const locales = (await fs.readdir(base, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    for (const locale of locales) {
      const messages = JSON.parse(await fs.readFile(new URL(`${locale}/translation.json`, base), 'utf8'));
      for (const key of keys) {
        assert.equal(typeof messages[key], 'string', `${locale}: missing key ${key}`);
        if (locale !== 'en') assert.ok(messages[key].trim(), `${locale}: missing translation for ${key}`);
      }
    }
  });
});

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

const src = new URL('../', import.meta.url);
const code = (name) => readFile(new URL(name, src), 'utf8');

describe('Backup warnings popup and normal browser downloads', () => {
  it('uses the existing notification only for a clean backup', async () => {
    const view = await code('DBExport.tsx');
    assert.match(view, /if \(service\.status\.warnings\.length\)\s*\{\s*showBackupWarnings\(service\.status\.warnings\);\s*\} else \{\s*showInfo\(t\('Backup completed'\)\);/);
    assert.match(view, /onSuccess\(\)/);
    assert.doesNotMatch(view, /showInfo\(t\('Backup completed with warnings'\)/);
  });

  it('keeps the modal mounted at provider level after a reminder closes', async () => {
    const provider = await code('InfoProvider.tsx');
    const reminder = await code('../../apps/src/BackupReminder.tsx');
    assert.match(provider, /showBackupWarnings: setBackupWarnings/);
    assert.match(provider, /backupWarnings\.length > 0 &&/);
    assert.match(provider, /<BackupWarningsPopup warnings=\{backupWarnings\} onClose=/);
    assert.match(reminder, /<DBExport onSuccess=\{onResult\} \/>/);
  });

  it('shows PDF name and reason for skipped files, or storage failure', async () => {
    const popup = await code('BackupWarningsPopup.tsx');
    assert.match(popup, /PDF storage unavailable: /);
    assert.match(popup, /PDF '\(\.\+\)' skipped: \(\.\+\)/);
    assert.match(popup, /skippedPdf\[1\]/);
    assert.match(popup, /skippedPdf\[2\]/);
    assert.match(popup, /Invalid or truncated PDF/);
    assert.match(popup, /<li key=\{index\}>/);
    assert.match(popup, /label=\{t\('OK'\)\}/);
  });

  it('does not record a blocked native file picker as a warning', async () => {
    const service = await code('backup/BackupService.ts');
    assert.match(service, /error\.name === 'SecurityError'/);
    assert.doesNotMatch(service, /this\.warn\('Native save picker is blocked/);
    assert.match(service, /link\.click\(\)/);
  });

  it('does not open PDF storage when no PDF names exist', async () => {
    const pdfs = await code('backup/PdfModule.ts');
    const iterate = pdfs.indexOf('for await (const opfsName of readBookPdfNames(signal))');
    const open = pdfs.indexOf('getDirectoryHandle(ROOT)', iterate);
    assert.ok(iterate !== -1 && open > iterate);
    assert.match(pdfs, /if \(!directory\) \{/);
  });

  it('translates warning details in all supported languages with intact placeholders', async () => {
    const base = new URL('../../apps/public/locales/', src);
    const locales = (await readdir(base, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
    assert.equal(locales.length, 17);
    const keys = [
      'Backup completed with warnings', 'Backup warnings', 'OK',
      'PDF storage is unavailable. PDF files may be missing from this backup.',
      'PDF "{{name}}" was skipped.', 'Other backup warning',
      'Some files may be missing from this backup.', 'Reason: {{reason}}',
      'Invalid PDF filename', 'Invalid or truncated PDF', 'OPFS is unavailable'
    ];
    for (const locale of locales) {
      const messages = JSON.parse(await readFile(new URL(`${locale}/translation.json`, base), 'utf8'));
      for (const key of keys) {
        assert.equal(typeof messages[key], 'string', `${locale}: missing ${key}`);
        if (locale !== 'en') assert.ok(messages[key].trim(), `${locale}: untranslated ${key}`);
        if (locale !== 'en') {
          for (const placeholder of ['{{name}}', '{{reason}}']) {
            if (key.includes(placeholder)) assert.ok(messages[key].includes(placeholder), `${locale}: lost ${placeholder}`);
          }
        }
      }
    }
  });
});

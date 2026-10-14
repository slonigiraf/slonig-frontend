import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const src = new URL('../', import.meta.url);
const code = async (path) => readFile(new URL(path, src), 'utf8');

describe('Original backup/restore controls with the safe restore engine', () => {
  it('keeps the original drag-and-drop InputFile with direct File streaming', async () => {
    const picker = await code('../../react-components/src/InputFile.tsx');
    const view = await code('DBImport.tsx');
    assert.match(picker, /onFile\?: \(file: File\) => void/);
    const directFile = picker.indexOf('if (onFile) {');
    assert.ok(directFile > 0 && directFile < picker.indexOf('new FileReader()'), 'onFile must skip FileReader');
    assert.match(view, /<InputFile\b/);
    assert.match(view, /onFile=\{onFile\}/);
    assert.match(view, /accept=\{\['\.slonig'\]\}/);
    assert.doesNotMatch(view, /slonigbk/);
    const service = await code('backup/RestoreService.ts');
    assert.match(service, /assertSlonigBackupFile\(file\)/);
    assert.match(view, /click to select \*\.slonig file/);
    assert.match(view, /const restoreService = new RestoreService\(\)/);
    assert.doesNotMatch(view, /useEffect\(\(\) => \(\) => service\.cancel\(\)/, 'unmount must not cancel');
  });
  it('shows only the fullscreen restore spinner while retaining service continuity', async () => {
    const signup = await code('../../page-accounts/src/modals/CreateAccount.tsx');
    const overlay = await code('../../page-accounts/src/modals/RestoringProgress.tsx');
    assert.match(signup, /<RestoringProgress\b/);
    assert.match(signup, /onFileSelect=\{\(\) => setIsRestoringInProgress\(true\)\}/);
    assert.match(signup, /onRestoreResult=\{\(\) => setIsRestoringInProgress\(false\)\}/);
    assert.match(signup, /\{isRestoringInProgress && <RestoringProgress \/>\}/);
    assert.doesNotMatch(signup, /onCancel=|onProgress=|setCancelRestore|setRestoreStatus/);
    assert.match(overlay, /<FullscreenActivity\b/);
    assert.match(overlay, /<Spinner noLabel \/>/);
    assert.doesNotMatch(overlay, /<p\b|<Button\b|onCancel|message|completed|total|unit|role='status'/);
  });
  it('uses the old backup download control and real circular progress', async () => {
    const view = await code('DBExport.tsx');
    assert.match(view, /<ButtonWithLabelBelow\b/);
    assert.match(view, /<RoundProgress value=\{hasKnownTotal \? status.completed : 0\} total=\{hasKnownTotal \? status.total : 1\}/);
    assert.doesNotMatch(view, /<Spinner\b/);
    assert.match(view, /confirmFallbackDownload\(\)/);
    assert.match(view, /service\.cancel\(\)/); // internal unmount cleanup, no Cancel button
  });
  it('shows only the original left-aligned progress circle while backup runs', async () => {
    const view = await code('DBExport.tsx');
    assert.match(view, /className=\{`shrink\$\{/);
    assert.match(view, /width: 75px;/);
    assert.match(view, /height: 75px;/);
    assert.match(view, /max-width: 75px;/);
    assert.match(view, /role='progressbar'/);
    assert.doesNotMatch(view, /backup-cancel|onClick=\{\(\) => service\.cancel\(\)\}|\{status.message\}<\/small>/);
    assert.doesNotMatch(view, /\{running && <>/);
    assert.match(view, /status.phase === 'error' && status.error/);
    assert.match(view, /!running && status.warnings.length > 0/);
  });
});

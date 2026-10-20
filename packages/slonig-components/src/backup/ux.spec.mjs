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
    assert.match(view, /placeholder=\{t\('click to select \*\.slonig file'\)\}/);
    assert.match(view, /const restoreService = new RestoreService\(\)/);
    assert.doesNotMatch(view, /useEffect\(\(\) => \(\) => service\.cancel\(\)/, 'unmount must not cancel');
  });
  it('shows fullscreen circular restore progress while retaining service continuity', async () => {
    const signup = await code('../../page-accounts/src/modals/CreateAccount.tsx');
    const overlay = await code('../../page-accounts/src/modals/RestoringProgress.tsx');
    assert.match(signup, /<RestoringProgress\b/);
    assert.match(signup, /setIsRestoringInProgress\(true\)/);
    assert.match(signup, /onRestoreResult=\{\(\) => setIsRestoringInProgress\(false\)\}/);
    assert.match(signup, /\{isRestoringInProgress && <RestoringProgress status=\{restoreStatus\} \/>\}/);
    assert.match(signup, /onProgress=\{setRestoreStatus\}/);
    assert.doesNotMatch(signup, /onCancel=|setCancelRestore/);
    assert.match(overlay, /<FullscreenActivity hideHeader\b/);
    assert.doesNotMatch(overlay, /caption=\{t\('Restore'\)\}/);
    assert.match(overlay, /<RoundProgress value=\{Math.floor\(progress\)\} total=\{100\} \/>/);
    assert.match(overlay, /role='progressbar'/);
    assert.match(overlay, /t\('Verifying backup'\)/);
    assert.doesNotMatch(overlay, /<Spinner\b|onCancel/);
  });
  it('uses the localized Backup again button with rotating arrows after success', async () => {
    const view = await code('DBExport.tsx');
    assert.match(view, /<ButtonWithLabelBelow\b/);
    assert.match(view, /<RoundProgress value=\{hasKnownTotal \? status.completed : 0\} total=\{hasKnownTotal \? status.total : 1\}/);
    assert.doesNotMatch(view, /<Spinner\b/);
    assert.match(view, /icon=\{backupCompleted \? 'arrows-rotate' : 'download'\}/);
    assert.match(view, /label=\{backupCompleted \? t\('Backup again'\)/);
    assert.match(view, /onClick=\{start\}/);
    assert.match(view, /service.status.phase === 'download-initiated'/);
    assert.match(view, /onSuccess\(\)/);
    assert.doesNotMatch(view, /backup-saved-label|type='checkbox'|confirmFallbackDownload|t\('Saved'\)|I saved the downloaded backup/);
    assert.match(view, /service\.cancel\(\)/); // internal unmount cleanup, no Cancel button
  });
  it('unlocks account deletion after a fallback download is launched', async () => {
    const view = await code('DBExport.tsx');
    const service = await code('backup/BackupService.ts');
    const settings = await code('../../page-settings/src/General.tsx');
    assert.match(settings, /onSuccess=\{\(\) => setExportSucceded\(true\)\}/);
    assert.match(settings, /isDisabled=\{!exportSucceded\}/);
    assert.match(view, /service.status.phase === 'saved' \|\| service.status.phase === 'download-initiated'/);
    const triggered = service.indexOf('link.click()');
    const recorded = service.indexOf('await confirmBackupCompletion()', triggered);
    const completed = service.indexOf("this.updateProgress('download-initiated'", triggered);
    assert.ok(triggered > 0 && recorded > triggered && completed > recorded);
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
    assert.match(view, /showBackupWarnings\(service\.status\.warnings\)/);
    assert.doesNotMatch(view, /<p role='status'>\{t\('Backup warnings'\)\}<\/p>/);
  });
});

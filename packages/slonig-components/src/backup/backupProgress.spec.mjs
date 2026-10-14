import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { backupPercent } from './backupProgress.ts';
import { OperationService } from './status.ts';

class ProgressBackup extends OperationService {
  constructor() { super('backup'); }
  start() { this.begin(); }
  update(phase, message, stage, done, total) {
    this.set(phase, message, Math.max(this.status.completed, backupPercent(stage, done, total)), 100, 'steps');
  }
}

const src = new URL('../', import.meta.url);
const code = (path) => readFile(new URL(path, src), 'utf8');

describe('Backup percent advances to saved completion without rereading archive', () => {
  it('reserves 100% for saved completion; all creation phases stay below it', () => {
    assert.equal(backupPercent('preparing', 0, 3), 0);
    assert.equal(backupPercent('database', 50, 100), 32);
    assert.equal(backupPercent('database', 100, 100), 60);
    assert.equal(backupPercent('pdf', 1.5, 2), 86);
    assert.equal(backupPercent('pdf', 2, 2), 95);
    assert.equal(backupPercent('finalizing', 0, 2), 95);
    assert.equal(backupPercent('finalizing', 1, 2), 97);
    assert.equal(backupPercent('finalizing', 2, 2), 99);
    assert.equal(backupPercent('complete'), 100);
  });
  it('never regresses between phases and resets for another backup', () => {
    const service = new ProgressBackup();
    service.start();
    const snapshots = [];
    service.subscribe(s => snapshots.push(s.completed));
    for (const [phase, stage, done, total] of [
      ['generating', 'preparing', 3, 3],
      ['generating', 'database', 20, 100],
      ['generating', 'database', 100, 100],
      ['generating', 'pdf', 1.5, 2],
      ['generating', 'pdf', 2, 2],
      ['generated', 'finalizing', 1, 2],
      ['saved', 'complete', 1, 1]
    ]) service.update(phase, stage, stage, done, total);
    assert.deepEqual(snapshots, [...snapshots].sort((a, b) => a - b));
    assert.equal(snapshots.at(-1), 100);
    service.start();
    service.update('generating', 'new backup', 'preparing', 0, 3);
    assert.equal(service.status.completed, 0);
  });
  it('does not run post-save verification, records native save only after close', async () => {
    const service = await code('backup/BackupService.ts');
    const view = await code('DBExport.tsx');
    assert.match(service, /countBackupRows\(signal\)/);
    assert.match(service, /fileOffset \/ fileSize/);
    assert.doesNotMatch(service, /verifyArchive|\.getFile\(|'verifying'/);
    const close = service.indexOf('await writable.close()');
    const timestamp = service.indexOf('await confirmBackupCompletion()', close);
    const success = service.indexOf("this.updateProgress('saved'", close);
    assert.ok(close !== -1 && timestamp > close && success > timestamp);
    assert.match(service, /this\.updateProgress\('download-initiated', .*'complete'\)/);
    assert.match(view, /service\.status\.phase === 'saved'/);
    assert.match(view, /showInfo\(service\.status\.warnings\.length\s*\? t\('Backup completed with warnings'\)/);
    assert.match(view, /\? t\('Backup completed with warnings'\)\s*: t\('Backup completed'\)/);
    assert.doesNotMatch(view, /Backup download started/);
    assert.match(service, /this\.updateProgress\('download-initiated', 'Backup completed', 'complete'\)/);
    assert.match(view, /showInfo\(service\.status\.warnings\.length/);
    assert.match(view, /setTimeout\(\(\) => setShowCompleted\(false\), 1200\)/);
    assert.doesNotMatch(view, /onClick=\{\(\) => service\.cancel\(\)\}/);
  });
  it('accepts a launched fallback download as completion to unlock deletion', async () => {
    const service = await code('backup/BackupService.ts');
    const view = await code('DBExport.tsx');
    const click = service.indexOf('link.click()');
    const timestamp = service.indexOf('await confirmBackupCompletion()', click);
    const success = service.indexOf("this.updateProgress('download-initiated'", click);
    assert.ok(click > 0 && timestamp > click && success > timestamp);
    assert.match(view, /service.status.phase === 'saved' \|\| service.status.phase === 'download-initiated'/);
    assert.match(view, /onSuccess\(\)/);
    assert.doesNotMatch(view, /confirmFallbackDownload|saveConfirmed/);
  });
});

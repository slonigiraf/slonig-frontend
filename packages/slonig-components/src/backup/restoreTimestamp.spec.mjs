import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const src = new URL('../', import.meta.url);
const code = (path) => readFile(new URL(path, src), 'utf8');

describe('Backup reminder after restoring an existing account', () => {
  it('commits a fresh backup timestamp atomically before choosing the restored account', async () => {
    const restore = await code('backup/RestoreService.ts');
    const storage = await code('../../db/src/backupStorage.ts');
    const commit = restore.indexOf('await commitRestoreStaging(operationId, metadata.tables, signal, Date.now())');
    const complete = restore.indexOf("this.updateProgress('restored', 'Restore committed successfully', 'complete')");
    const login = restore.indexOf('onAccountRestored?.(accounts.firstAddress)');
    assert.ok(commit > 0 && complete > commit && login > complete);
    const transaction = storage.indexOf("await db.transaction('rw'");
    const timestamp = storage.indexOf("await db.settings.put({ id: 'LAST_BACKUP_TIME', value: String(restoredAt) })");
    const endTransaction = storage.indexOf('  });', transaction);
    assert.ok(transaction > 0 && timestamp > transaction && endTransaction > timestamp);
    assert.match(storage, /if \(restoredAt !== undefined\)/);
  });

  it('checks the latest timestamp after login, not a session-only restore flag', async () => {
    const ui = await code('../../apps/src/UI.tsx');
    const index = await code('index.tsx');
    assert.match(ui, /getSetting\(SettingKey\.LAST_BACKUP_TIME\)/);
    assert.match(ui, /loginBackupCheck !== null &&/);
    assert.match(ui, /loginBackupCheck\.address === loginAddress && loginBackupCheck\.restorePhase === restorePhase/);
    assert.match(ui, /Math\.max\(loginBackupCheck\.timestamp, lastBackup \?\? 0\)/);
    // This must be safe when loginAddress and loginBackupCheck are both unset:
    // optional chaining alone is insufficient because undefined === undefined.
    const expression = ui.match(/const lastBackupMs = ([\s\S]*?);\n  const shouldBackup =/);
    assert.ok(expression, 'could not find lastBackupMs computation');
    const getLastBackupMs = new Function('loginBackupCheck', 'loginAddress', 'lastBackup', 'restorePhase', 'isRestoringBackup', `return ${expression[1]};`);
    assert.equal(getLastBackupMs(null, undefined, undefined, 'idle', false), null, 'initial logged-out render must not crash');
    assert.equal(getLastBackupMs(null, 'account1', 12, 'idle', false), null, 'login timestamp read is still pending');
    assert.equal(getLastBackupMs({ address: 'account1', timestamp: 100, restorePhase: 'idle' }, 'account1', 80, 'idle', false), 100);
    assert.equal(getLastBackupMs({ address: 'account1', timestamp: 100, restorePhase: 'idle' }, 'account1', 120, 'idle', false), 120);
    assert.equal(getLastBackupMs({ address: 'account1', timestamp: 100, restorePhase: 'idle' }, 'account2', 120, 'idle', false), null);
    assert.equal(getLastBackupMs({ address: 'account1', timestamp: 100, restorePhase: 'idle' }, 'account1', 80, 'staging', true), null, 'never show during restore');
    assert.equal(getLastBackupMs({ address: 'account1', timestamp: 100, restorePhase: 'idle' }, 'account1', 80, 'restored', false), null, 'stale pre-commit read cannot show the reminder');
    assert.equal(getLastBackupMs({ address: 'account1', timestamp: 1000, restorePhase: 'restored' }, 'account1', 80, 'restored', false), 1000, 'fresh post-commit read allows the timestamp rule');
    assert.match(ui, /useRestorePhase\(\)/);
    assert.match(ui, /!loginAddress \|\| isRestoringBackup/);
    assert.match(ui, /\[loginAddress, restorePhase, isRestoringBackup\]/);
    assert.match(ui, /shouldBackup && !backupReminderDismissed && <BackupReminder/);
    assert.doesNotMatch(ui, /hasRestoredAccountThisSession|subscribeAccountRestore/);
    assert.doesNotMatch(index, /restoreSession/);
    const picker = await code('DBImport.tsx');
    const status = await code('backup/status.ts');
    assert.match(picker, /useSyncExternalStore\(subscribeRestore, getRestorePhase, getRestorePhase\)/);
    assert.match(index, /export \{ DBImport, DBExport, Confirmation, useRestorePhase \}/);
    assert.match(status, /private readonly listeners = new Set<StatusListener>\(\)/);
    assert.match(status, /for \(const listener of this\.listeners\) listener\(this\.state\)/);
  });
});

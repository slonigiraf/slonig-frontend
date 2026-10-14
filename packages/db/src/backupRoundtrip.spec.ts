// Copyright 2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Browser test runner: fake-indexeddb is already a repository dev dependency.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'fake-indexeddb/auto';
import { db } from './db/index.js';
import { commitRestoreStaging, discardRestoreStaging, stageRestoreBatch } from './backupStorage.js';

await describe('atomic staged backup restore', async () => {
  await it('commits staged database records with typed binary values', async () => {
    const operation = 'test-commit';
    await db.settings.put({ id: 'original', value: 'before' });
    await stageRestoreBatch(operation, 'settings', [
      { id: 'restored', value: 'after' },
      { id: 'LAST_BACKUP_TIME', value: '1000' }
    ]);
    await stageRestoreBatch(operation, 'images', [{ id: 42, bytes: new Uint8Array([0, 255, 3]) }]);
    try {
      await commitRestoreStaging(operation, ['settings', 'images'], undefined, 1_780_000_000_000);
      assert.equal((await db.settings.get('original')), undefined);
      assert.equal((await db.settings.get('restored'))?.value, 'after');
      assert.equal((await db.settings.get('LAST_BACKUP_TIME'))?.value, '1780000000000', 'successful restore refreshes an old archive timestamp');
      const item = await db.images.get(42);
      assert.deepEqual([...(item as unknown as { bytes: Uint8Array }).bytes], [0, 255, 3]);
    } finally { await discardRestoreStaging(operation); }
  });

  await it('rolls back every table when a later staged write fails', async () => {
    const operation = 'test-rollback';
    await db.settings.put({ id: 'original', value: 'keep-me' });
    await db.settings.put({ id: 'LAST_BACKUP_TIME', value: 'previous' });
    await stageRestoreBatch(operation, 'settings', [{ id: 'candidate', value: 'new' }]);
    // Direct insertion intentionally bypasses the validation gate to test the
    // transaction's rollback on a corrupt late-stage row.
    await db.backupStaging.add({ operationId: operation, tableName: 'settings', rows: [{ id: undefined, value: 'invalid-key' }] });
    try {
      await assert.rejects(commitRestoreStaging(operation, ['settings'], undefined, 1_780_000_000_000));
      assert.equal((await db.settings.get('original'))?.value, 'keep-me');
      assert.equal(await db.settings.get('candidate'), undefined);
      assert.equal((await db.settings.get('LAST_BACKUP_TIME'))?.value, 'previous', 'failed restore must not update backup time');
    } finally { await discardRestoreStaging(operation); }
  });
});

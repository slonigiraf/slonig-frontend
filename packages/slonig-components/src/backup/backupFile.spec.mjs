import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertSlonigBackupFile } from './backupFile.ts';

describe('restore accepts only .slonig filenames', () => {
  it('accepts regular and uppercase .slonig files', () => {
    assert.doesNotThrow(() => assertSlonigBackupFile({ name: 'Jane_Smith_20261014_23_07.slonig' }));
    assert.doesNotThrow(() => assertSlonigBackupFile({ name: 'Jane.SLONIG' }));
  });
  it('rejects legacy extensions, incorrect extensions, and nameless files', () => {
    for (const name of ['Jane.slonigbk', 'Jane.json.gz', 'Jane.slonig.zip', 'Jane.slonigbk.slonigbk', '']) {
      assert.throws(() => assertSlonigBackupFile({ name }), /Please select a \.slonig backup file/);
    }
    assert.throws(() => assertSlonigBackupFile({}), /Please select a \.slonig backup file/);
  });
});

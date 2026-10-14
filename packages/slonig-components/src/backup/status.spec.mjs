import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OperationService } from './status.ts';

class TestRestore extends OperationService {
  constructor() { super('restore'); }
  start() { this.signal = this.begin(); this.set('validating', 'Verifying archive'); }
  abortByUser() { this.cancel(); }
  complete() { this.set('restored', 'Restore committed successfully'); }
  reject(error) { this.fail(error); }
}

describe('restore cancellation vs failure', () => {
  it('does not report spontaneous IndexedDB AbortError as user cancellation', () => {
    const restore = new TestRestore();
    restore.start();
    restore.reject(new DOMException('IndexedDB transaction aborted', 'AbortError'));
    assert.equal(restore.status.phase, 'error');
    assert.match(restore.status.error, /IndexedDB/);
    assert.equal(restore.signal.aborted, false);
  });
  it('only marks cancelled when explicit cancel aborts the signal', () => {
    const restore = new TestRestore();
    restore.start();
    restore.abortByUser();
    assert.equal(restore.signal.aborted, true);
    restore.reject(new DOMException('Operation cancelled', 'AbortError'));
    assert.equal(restore.status.phase, 'cancelled');
  });
  it('ignores cancel once restoration has committed', () => {
    const restore = new TestRestore();
    restore.start();
    restore.complete();
    restore.abortByUser();
    assert.equal(restore.signal.aborted, false);
    assert.equal(restore.status.phase, 'restored');
  });
  it('can retry after a failed restore with a fresh abort signal', () => {
    const restore = new TestRestore();
    restore.start();
    const previous = restore.signal;
    restore.reject(new Error('Bad archive'));
    restore.start();
    assert.notEqual(restore.signal, previous);
    assert.equal(restore.status.phase, 'validating');
    assert.equal(restore.status.error, undefined);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_MODEL } from './openRouter.js';
import { isAiTutorModelSelectionEnabled, resolveAiTutorModel } from './modelAccess.js';

describe('AI tutor model access', (): void => {
  it('allows model selection only on local hosts', (): void => {
    assert.equal(isAiTutorModelSelectionEnabled('localhost'), true);
    assert.equal(isAiTutorModelSelectionEnabled('127.0.0.1'), true);
    assert.equal(isAiTutorModelSelectionEnabled('::1'), true);
    assert.equal(isAiTutorModelSelectionEnabled('[::1]'), true);
    assert.equal(isAiTutorModelSelectionEnabled('app.slonig.org'), false);
    assert.equal(isAiTutorModelSelectionEnabled('staging.slonig.org'), false);
  });

  it('forces the default model outside localhost', (): void => {
    assert.equal(resolveAiTutorModel('anthropic/claude-sonnet-4', false), DEFAULT_MODEL);
  });

  it('uses the selected localhost model with a default fallback', (): void => {
    assert.equal(resolveAiTutorModel('anthropic/claude-sonnet-4', true), 'anthropic/claude-sonnet-4');
    assert.equal(resolveAiTutorModel('   ', true), DEFAULT_MODEL);
  });
});

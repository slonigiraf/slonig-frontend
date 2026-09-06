// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { parseNameSuggestions } from './courseNames.js';

describe('parseNameSuggestions', (): void => {
  it('parses and trims one name per requested chapter', (): void => {
    assert.deepEqual(parseNameSuggestions('{"bookName":" Better algebra ","chapters":[{"id":2,"title":" Linear equations "}]}', [2]), {
      bookName: 'Better algebra',
      chapters: [{ id: 2, title: 'Linear equations' }]
    });
  });

  it('accepts a fenced JSON response', (): void => {
    assert.deepEqual(parseNameSuggestions('```json\n{"bookName":"Algebra","chapters":[]}\n```', []), { bookName: 'Algebra', chapters: [] });
  });

  it('rejects missing chapter suggestions', (): void => {
    assert.throws(() => parseNameSuggestions('{"bookName":"Algebra","chapters":[]}', [2]), /every editable chapter/);
  });

  it('rejects duplicate chapter suggestions', (): void => {
    assert.throws(() => parseNameSuggestions('{"bookName":"Algebra","chapters":[{"id":2,"title":"A"},{"id":2,"title":"B"}]}', [2, 3]), /every editable chapter/);
  });
});

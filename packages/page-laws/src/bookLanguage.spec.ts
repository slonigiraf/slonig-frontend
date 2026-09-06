// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { detectBookLanguage } from './bookLanguage.js';

describe('book language detection', (): void => {
  it('detects Russian from the first two pages', (): void => {
    assert.equal(detectBookLanguage(['Введение в математику', 'Решите следующее уравнение']), 'ru');
  });

  it('detects Turkish from the first two pages', (): void => {
    assert.equal(detectBookLanguage(['Matematiğe giriş ve temel bilgiler', 'Aşağıdaki eşitliği çözünüz']), 'tr');
  });

  it('detects common Latin-script languages using instructional words', (): void => {
    assert.equal(detectBookLanguage(['The lesson is about numbers', 'Add the values and explain the result']), 'en');
    assert.equal(detectBookLanguage(['La leçon est une introduction', 'Les nombres et des opérations']), 'fr');
  });
});

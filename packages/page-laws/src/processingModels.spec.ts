// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_MODEL, OPENAI_MODELS } from './constants.js';

describe('processing model defaults', (): void => {
  it('uses GPT-6 Luna for normal processing and GPT-5 Nano for Standards', (): void => {
    expect(DEFAULT_PROCESSING_MODEL).toEqual('openai/gpt-6-luna');
    expect(DEFAULT_STANDARDS_MODEL).toEqual('openai/gpt-5-nano');
  });

  it('keeps both default models available in the static OpenAI fallback catalog', (): void => {
    const modelIds = OPENAI_MODELS.map(({ value }) => value);

    expect(modelIds).toContain(DEFAULT_PROCESSING_MODEL);
    expect(modelIds).toContain(DEFAULT_STANDARDS_MODEL);
  });
});

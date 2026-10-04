// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { OPENAI_MODELS } from '../../../openrouter/models.js';
import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_EMBEDDER } from './config.js';

describe('processing model defaults', (): void => {
  it('uses GPT-6 Luna for normal processing and Text Embedding 3 Small for Standards', (): void => {
    expect(DEFAULT_PROCESSING_MODEL).toEqual('openai/gpt-6-luna');
    expect(DEFAULT_STANDARDS_EMBEDDER).toEqual('openai/text-embedding-3-small');
  });

  it('keeps the default chat processing model available in the static OpenAI fallback catalog', (): void => {
    const modelIds = OPENAI_MODELS.map(({ value }) => value);

    expect(modelIds).toContain(DEFAULT_PROCESSING_MODEL);
  });
});

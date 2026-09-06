// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';

describe('AI input estimates', (): void => {
  it('estimates tokens and input price for the selected model', (): void => {
    expect(estimateAiInput('openai/gpt-4o-mini', ['12345678', '1234'])).toEqual({
      priceUsd: 0.00000045,
      requests: 2,
      tokens: 3
    });
  });

  it('shows per-request and total estimates', (): void => {
    expect(formatAiInputEstimate({ priceUsd: 0.01, requests: 2, tokens: 200 }).includes('average 100 tokens / $0.0050 per request; about $0.0100 total')).toEqual(true);
  });
});

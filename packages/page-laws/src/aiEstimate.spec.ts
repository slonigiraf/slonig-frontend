// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { estimateAiInput, estimateAiRequests, formatAiInputEstimate } from './aiEstimate.js';

describe('AI input estimates', (): void => {
  it('estimates tokens and input price for the selected model', (): void => {
    expect(estimateAiInput('openai/gpt-4o-mini', ['12345678', '1234'])).toEqual({
      inputPriceUsd: 0.00000045,
      inputTokens: 3,
      outputPriceUsd: 0.0012,
      outputTokens: 2_000,
      requests: 2,
      totalPriceUsd: 0.00120045
    });
  });


  it('supports per-request output estimates without multiplying one request by the whole batch', (): void => {
    expect(estimateAiRequests('openai/gpt-4o-mini', [
      { input: '12345678', outputTokens: 320 },
      { input: '1234', outputTokens: 640 }
    ])).toEqual({
      inputPriceUsd: 0.00000045,
      inputTokens: 3,
      outputPriceUsd: 0.000576,
      outputTokens: 960,
      requests: 2,
      totalPriceUsd: 0.00057645
    });
  });

  it('shows per-request and total estimates', (): void => {
    expect(formatAiInputEstimate({ inputPriceUsd: 0.01, inputTokens: 200, outputPriceUsd: 0.02, outputTokens: 400, requests: 2, totalPriceUsd: 0.03 }).includes('$0.0150 per request and $0.0300 total')).toEqual(true);
  });
});

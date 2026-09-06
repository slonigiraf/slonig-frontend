// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface AiInputEstimate {
  priceUsd: number;
  requests: number;
  tokens: number;
}

const INPUT_PRICE_PER_MILLION: Record<string, number> = {
  'openai/gpt-4.1': 2,
  'openai/gpt-4.1-mini': 0.4,
  'openai/gpt-4o': 2.5,
  'openai/gpt-4o-mini': 0.15,
  'openai/gpt-5': 1.25,
  'openai/gpt-5-mini': 0.25,
  'openai/gpt-5.4': 2.5
};

export function estimateAiInput (model: string, requestInputs: string[]): AiInputEstimate {
  // Four characters per token is a deliberately simple pre-request estimate.
  const tokens = requestInputs.reduce((total, input) => total + Math.ceil(input.length / 4), 0);

  return {
    priceUsd: tokens * (INPUT_PRICE_PER_MILLION[model] ?? 0) / 1_000_000,
    requests: requestInputs.length,
    tokens
  };
}

export function formatAiInputEstimate ({ priceUsd, requests, tokens }: AiInputEstimate): string {
  const averageTokens = requests ? Math.ceil(tokens / requests) : 0;
  const averagePrice = requests ? priceUsd / requests : 0;

  return `Estimated AI input: ${tokens.toLocaleString()} tokens across ${requests.toLocaleString()} request${requests === 1 ? '' : 's'} (average ${averageTokens.toLocaleString()} tokens / $${averagePrice.toFixed(4)} per request; about $${priceUsd.toFixed(4)} total). Output tokens are not included.`;
}

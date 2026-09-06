// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface AiInputEstimate {
  inputPriceUsd: number;
  inputTokens: number;
  outputPriceUsd: number;
  outputTokens: number;
  requests: number;
  totalPriceUsd: number;
}

const MODEL_PRICE_PER_MILLION: Record<string, [number, number]> = {
  'openai/gpt-4.1': [2, 8],
  'openai/gpt-4.1-mini': [0.4, 1.6],
  'openai/gpt-4o': [2.5, 10],
  'openai/gpt-4o-mini': [0.15, 0.6],
  'openai/gpt-5': [1.25, 10],
  'openai/gpt-5-mini': [0.25, 2],
  'openai/gpt-5.4': [2.5, 15]
};

export function estimateAiInput (model: string, requestInputs: string[], outputTokensPerRequest = 1_000): AiInputEstimate {
  // Four characters per token is a deliberately simple pre-request estimate.
  const inputTokens = requestInputs.reduce((total, input) => total + Math.ceil(input.length / 4), 0);
  const outputTokens = requestInputs.length * outputTokensPerRequest;
  const [inputRate, outputRate] = MODEL_PRICE_PER_MILLION[model] ?? [0, 0];
  const inputPriceUsd = inputTokens * inputRate / 1_000_000;
  const outputPriceUsd = outputTokens * outputRate / 1_000_000;

  return {
    inputPriceUsd,
    inputTokens,
    outputPriceUsd,
    outputTokens,
    requests: requestInputs.length,
    totalPriceUsd: Number((inputPriceUsd + outputPriceUsd).toFixed(12))
  };
}

export function formatAiInputEstimate ({ inputPriceUsd, inputTokens, outputPriceUsd, outputTokens, requests, totalPriceUsd }: AiInputEstimate): string {
  const requestPrice = requests ? totalPriceUsd / requests : 0;

  return `Estimated usage: ${inputTokens.toLocaleString()} input tokens ($${inputPriceUsd.toFixed(4)}) + ${outputTokens.toLocaleString()} output tokens ($${outputPriceUsd.toFixed(4)}) across ${requests.toLocaleString()} request${requests === 1 ? '' : 's'}; about $${requestPrice.toFixed(4)} per request and $${totalPriceUsd.toFixed(4)} total.`;
}

export async function assertOpenRouterCredits (apiKey: string, estimatedPriceUsd: number): Promise<void> {
  const response = await fetch('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${apiKey}` } });

  if (!response.ok) {
    throw new Error('Unable to verify the OpenRouter credit balance before processing.');
  }

  const data = await response.json() as { data?: { total_credits?: number; total_usage?: number } };
  const totalCredits = data.data?.total_credits;
  const totalUsage = data.data?.total_usage;

  if (typeof totalCredits === 'number' && typeof totalUsage === 'number' && totalCredits - totalUsage < estimatedPriceUsd) {
    throw new Error(`Insufficient OpenRouter credits. Estimated cost is $${estimatedPriceUsd.toFixed(4)}.`);
  }
}

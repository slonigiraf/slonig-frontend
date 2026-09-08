// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const OPENROUTER_IMAGE_MODEL = 'bytedance-seed/seedream-4.5';

interface OpenRouterImageResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  error?: { message?: string };
}

export async function generateOpenRouterImage (apiKey: string, prompt: string): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/images', {
    body: JSON.stringify({ model: OPENROUTER_IMAGE_MODEL, n: 1, prompt }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'Slonig'
    },
    method: 'POST'
  });
  const result = await response.json() as OpenRouterImageResponse;
  const image = result.data?.[0];

  if (!response.ok || !image?.b64_json) {
    throw new Error(result.error?.message || 'OpenRouter returned no generated image.');
  }

  return `data:${image.media_type || 'image/png'};base64,${image.b64_json}`;
}

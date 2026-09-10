// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { OPEN_ROUTER_SOLUTION_RASTER_PROMPT, OPEN_ROUTER_SVG_PROMPT } from './constants.js';
import { openRouterRequestGate } from './openRouterConcurrency.js';

export const OPENROUTER_IMAGE_MODEL = 'bytedance-seed/seedream-4.5';

interface OpenRouterImageResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  error?: { message?: string };
}

interface OpenRouterSvgResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

interface SvgPlan {
  format?: unknown;
  svg?: unknown;
}

function parseJsonObject (content: string): Record<string, unknown> {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  return JSON.parse(json) as Record<string, unknown>;
}

function normalizeSafeSvg (value: string): string | undefined {
  const start = value.search(/<svg\b/i);
  const end = value.toLocaleLowerCase().lastIndexOf('</svg>');

  if (start < 0 || end < start) {
    return undefined;
  }

  let svg = value.slice(start, end + '</svg>'.length).trim();

  // Ability images are rendered from local data URLs before publishing. Keep
  // generated SVG self-contained and inert: no scripts, external resources,
  // embedded HTML, event handlers, or URL-based references.
  //
  // A valid standalone SVG normally contains xmlns="http://www.w3.org/2000/svg".
  // That namespace declaration is metadata, not an external fetch. Exclude only
  // this exact declaration from URL checks so ordinary generated SVG remains safe.
  const svgWithoutSafeNamespace = svg.replace(/\sxmlns\s*=\s*(["'])http:\/\/www\.w3\.org\/2000\/svg\1/gi, '');

  if (/<(?:script|foreignObject|iframe|object|embed|image)\b/i.test(svg) || /\son[a-z]+\s*=/i.test(svg) || /(?:javascript:|https?:\/\/|data:)/i.test(svgWithoutSafeNamespace) || /\b(?:href|xlink:href)\s*=/i.test(svg)) {
    return undefined;
  }

  if (!/<svg\b[^>]*\bxmlns\s*=/.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return svg;
}

export function svgMarkupToDataUrl (value: string): string | undefined {
  const svg = normalizeSafeSvg(value);

  if (!svg) {
    return undefined;
  }

  const bytes = new TextEncoder().encode(svg);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return `data:image/svg+xml;base64,${globalThis.btoa(binary)}`;
}

type VisualPurpose = 'question' | 'solution';

async function generateOpenRouterSvg (apiKey: string, prompt: string, model: string, purpose: VisualPurpose): Promise<string | null | undefined> {
  const response = await openRouterRequestGate.run(() => fetch('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      messages: [{
        content: OPEN_ROUTER_SVG_PROMPT(prompt, purpose),
        role: 'user'
      }],
      model,
      response_format: { type: 'json_object' }
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'Slonig'
    },
    method: 'POST'
  }));
  const result = await response.json() as OpenRouterSvgResponse;
  const content = result.choices?.[0]?.message?.content?.trim();

  if (!response.ok || !content) {
    return undefined;
  }

  try {
    const plan = parseJsonObject(content) as SvgPlan;

    if (plan.format === 'raster') {
      return null;
    }

    if (plan.format !== 'svg' || typeof plan.svg !== 'string') {
      return undefined;
    }

    return svgMarkupToDataUrl(plan.svg);
  } catch {
    return undefined;
  }
}

export async function generateOpenRouterImage (apiKey: string, prompt: string): Promise<string> {
  const response = await openRouterRequestGate.run(() => fetch('https://openrouter.ai/api/v1/images', {
    body: JSON.stringify({ model: OPENROUTER_IMAGE_MODEL, n: 1, prompt }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'Slonig'
    },
    method: 'POST'
  }));
  const result = await response.json() as OpenRouterImageResponse;
  const image = result.data?.[0];

  if (!response.ok || !image?.b64_json) {
    throw new Error(result.error?.message || 'OpenRouter returned no generated image.');
  }

  return `data:${image.media_type || 'image/png'};base64,${image.b64_json}`;
}

export async function generateOpenRouterVisual (apiKey: string, prompt: string, svgModel: string, purpose: VisualPurpose = 'question'): Promise<string> {
  // Prefer a safe, self-contained SVG for Ability visuals. SVGs stay crisp at
  // every size, preserve diagram/text geometry, and avoid unnecessary raster
  // payloads. Question visuals must not leak the answer; solution visuals are
  // explicitly allowed to show the completed answer/result.
  const svg = await generateOpenRouterSvg(apiKey, prompt, svgModel, purpose).catch(() => undefined);

  if (svg) {
    return svg;
  }

  const rasterPrompt = purpose === 'solution'
    ? OPEN_ROUTER_SOLUTION_RASTER_PROMPT(prompt)
    : prompt;

  try {
    return await generateOpenRouterImage(apiKey, rasterPrompt);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Unknown image generation error.';

    throw new Error(`Unable to generate the required Ability visual as SVG or raster. ${message}`);
  }
}

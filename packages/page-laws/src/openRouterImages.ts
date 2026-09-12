// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { OPEN_ROUTER_SOLUTION_RASTER_PROMPT, OPEN_ROUTER_SVG_PROMPT } from './constants.js';
import { openRouterRequestGate } from './openRouterConcurrency.js';

export const OPENROUTER_IMAGE_MODEL = 'bytedance-seed/seedream-4.5';
const MAX_VISUAL_ATTEMPTS = 3;

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

interface SvgCandidate {
  dataUrl: string;
  svg: string;
}

interface VisualQaResult {
  errors: string[];
  ok: boolean;
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

function svgDataUrlToMarkup (value: string): string | undefined {
  const prefix = 'data:image/svg+xml;base64,';

  if (!value.startsWith(prefix)) {
    return undefined;
  }

  try {
    const binary = globalThis.atob(value.slice(prefix.length));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

function promptWithReferenceSvg (prompt: string, referenceVisual?: string): string {
  const referenceSvg = referenceVisual ? svgDataUrlToMarkup(referenceVisual) : undefined;

  if (!referenceSvg) {
    return prompt;
  }

  return `${prompt}\n\nThis solution modifies an already generated question visual. Use the following exact starting SVG as the base. Preserve its viewBox, dimensions, coordinate system, positions, labels, styles, and every unchanged object. Apply only the required answer change.\n\nSTARTING SVG:\n${referenceSvg}`;
}

async function generateOpenRouterSvg (apiKey: string, prompt: string, model: string, purpose: VisualPurpose): Promise<SvgCandidate | null | undefined> {
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

    const svg = normalizeSafeSvg(plan.svg);
    const dataUrl = svg ? svgMarkupToDataUrl(svg) : undefined;

    return svg && dataUrl ? { dataUrl, svg } : undefined;
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

function visualQaInstruction (contract: string, purpose: VisualPurpose): string {
  return `Audit this generated educational visual against the exact visual contract. This is a hard semantic check, not an aesthetics review.

Verify every answer-relevant label, number, symbol, object, coordinate, scale, relationship, region, line, mark, and spatial placement required by the contract. Reject missing, extra, contradictory, unreadable, or incorrect task data. ${purpose === 'question' ? 'This is a QUESTION visual: reject any answer leakage, completed construction, solution-only mark, or cue that gives away what the learner must infer.' : 'This is a SOLUTION visual: require the complete correct result. If a reference question visual is supplied, reject changes to any base object, label, scale, coordinate system, or layout that the requested answer did not require.'}

Return only JSON: {"ok":true,"errors":[]} when every educational detail is correct. Otherwise return {"ok":false,"errors":["specific discrepancy", "..."]}. Keep errors concrete enough to drive regeneration.

VISUAL CONTRACT:
${contract}`;
}

function parseVisualQaResult (content: string): VisualQaResult {
  const parsed = parseJsonObject(content);
  const ok = parsed.ok;
  const errors = parsed.errors;

  if (typeof ok !== 'boolean' || !Array.isArray(errors) || !errors.every((error) => typeof error === 'string' && error.trim())) {
    throw new Error('Visual QA returned invalid JSON.');
  }

  const normalizedErrors = errors.map((error) => String(error).trim());

  if (ok && normalizedErrors.length) {
    throw new Error('Visual QA returned contradictory results.');
  }

  if (!ok && !normalizedErrors.length) {
    throw new Error('Visual QA rejected an image without identifying an error.');
  }

  return { errors: normalizedErrors, ok };
}

async function verifyOpenRouterVisual (
  apiKey: string,
  contract: string,
  candidate: string,
  model: string,
  purpose: VisualPurpose,
  referenceVisual?: string,
  candidateSvg?: string,
  qaContext?: string
): Promise<VisualQaResult> {
  const instruction = visualQaInstruction(`${contract}${qaContext ? `\n\nABILITY CONTEXT FOR QA ONLY:\n${qaContext}` : ''}`, purpose);
  const referenceSvg = referenceVisual ? svgDataUrlToMarkup(referenceVisual) : undefined;
  const content: Array<Record<string, unknown>> = [{ text: instruction, type: 'text' }];

  if (referenceSvg) {
    content.push({ text: `REFERENCE QUESTION SVG:\n${referenceSvg}`, type: 'text' });
  } else if (referenceVisual) {
    content.push({ text: 'REFERENCE QUESTION VISUAL:', type: 'text' });
    content.push({ image_url: { url: referenceVisual }, type: 'image_url' });
  }

  if (candidateSvg) {
    content.push({ text: `GENERATED CANDIDATE SVG:\n${candidateSvg}`, type: 'text' });
  } else {
    content.push({ text: 'GENERATED CANDIDATE VISUAL:', type: 'text' });
    content.push({ image_url: { url: candidate }, type: 'image_url' });
  }

  const response = await openRouterRequestGate.run(() => fetch('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      messages: [{ content, role: 'user' }],
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
  const responseContent = result.choices?.[0]?.message?.content?.trim();

  if (!response.ok || !responseContent) {
    throw new Error(result.error?.message || 'OpenRouter visual QA returned no result.');
  }

  return parseVisualQaResult(responseContent);
}

export async function generateOpenRouterVisual (
  apiKey: string,
  prompt: string,
  svgModel: string,
  purpose: VisualPurpose = 'question',
  referenceVisual?: string,
  qaContext?: string
): Promise<string> {
  let lastError = '';
  let correction = '';

  for (let attempt = 0; attempt < MAX_VISUAL_ATTEMPTS; attempt++) {
    const contractedPrompt = `${prompt}${correction ? `\n\nREGENERATION REQUIREMENTS FROM THE PREVIOUS QA FAILURE:\n${correction}` : ''}`;
    const svgPrompt = purpose === 'solution' ? promptWithReferenceSvg(contractedPrompt, referenceVisual) : contractedPrompt;
    const svg = await generateOpenRouterSvg(apiKey, svgPrompt, svgModel, purpose).catch(() => undefined);
    let candidate: string;
    let candidateSvg: string | undefined;

    if (svg) {
      candidate = svg.dataUrl;
      candidateSvg = svg.svg;
    } else {
      const rasterPrompt = purpose === 'solution'
        ? OPEN_ROUTER_SOLUTION_RASTER_PROMPT(contractedPrompt)
        : contractedPrompt;

      try {
        candidate = await generateOpenRouterImage(apiKey, rasterPrompt);
      } catch (caught) {
        lastError = caught instanceof Error ? caught.message : 'Unknown image generation error.';
        correction = lastError;
        continue;
      }
    }

    try {
      const qa = await verifyOpenRouterVisual(apiKey, prompt, candidate, svgModel, purpose, referenceVisual, candidateSvg, qaContext);

      if (qa.ok) {
        return candidate;
      }

      lastError = qa.errors.join('; ');
      correction = qa.errors.map((error, index) => `${index + 1}. ${error}`).join('\n');
    } catch (caught) {
      lastError = caught instanceof Error ? caught.message : 'Visual QA failed.';
      correction = lastError;
    }
  }

  throw new Error(`Unable to generate a verified required Ability visual after ${MAX_VISUAL_ATTEMPTS} attempts.${lastError ? ` Last visual QA error: ${lastError}` : ''}`);
}

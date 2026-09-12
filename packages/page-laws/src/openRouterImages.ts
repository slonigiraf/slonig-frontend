// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { OPEN_ROUTER_SOLUTION_RASTER_PROMPT, OPEN_ROUTER_VISUAL_SPEC_PROMPT } from './constants.js';
import {
  applyVisualPatch,
  extractMathVisualSpecFromSvg,
  parseVisualPlan,
  renderMathVisualSvg,
  type MathVisualSpec
} from './mathVisuals.js';
import { openRouterRequestGate } from './openRouterConcurrency.js';

export const OPENROUTER_IMAGE_MODEL = 'bytedance-seed/seedream-4.5';
const MAX_VISUAL_ATTEMPTS = 2;
const MAX_SCENE_CACHE_ENTRIES = 100;
const OPENROUTER_FETCH_TIMEOUT_MS = 45_000;
const IMAGE_DECODE_TIMEOUT_MS = 10_000;

interface OpenRouterImageResponse {
  data?: Array<{ b64_json?: string; media_type?: string }>;
  error?: { message?: string };
}

interface OpenRouterChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

interface VectorCandidate {
  dataUrl: string;
  scene: MathVisualSpec;
  svg: string;
}

interface VisualQaResult {
  errors: string[];
  ok: boolean;
  warnings: string[];
}

const sceneByGeneratedVisual = new Map<string, MathVisualSpec>();

async function fetchWithTimeout (url: string, init: RequestInit, timeoutMs = OPENROUTER_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`OpenRouter request timed out after ${Math.round(timeoutMs / 1_000)} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function withTimeout<T> (promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function parseJsonObject (content: string): Record<string, unknown> {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  return JSON.parse(json) as Record<string, unknown>;
}

function rememberScene (visual: string, scene: MathVisualSpec): void {
  sceneByGeneratedVisual.set(visual, scene);

  while (sceneByGeneratedVisual.size > MAX_SCENE_CACHE_ENTRIES) {
    const first = sceneByGeneratedVisual.keys().next().value as string | undefined;

    if (!first) {
      break;
    }

    sceneByGeneratedVisual.delete(first);
  }
}

function normalizeSafeSvg (value: string): string | undefined {
  const start = value.search(/<svg\b/i);
  const end = value.toLocaleLowerCase().lastIndexOf('</svg>');

  if (start < 0 || end < start) {
    return undefined;
  }

  let svg = value.slice(start, end + '</svg>'.length).trim();

  // This helper still accepts legacy SVGs, but generated math visuals no longer
  // come from model-authored SVG. They are emitted by mathVisuals.ts from a
  // strictly parsed scene. Keep the legacy path inert for existing callers.
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

function sceneFromVisual (value?: string): MathVisualSpec | undefined {
  if (!value) {
    return undefined;
  }

  const cached = sceneByGeneratedVisual.get(value);

  if (cached) {
    return cached;
  }

  const svg = svgDataUrlToMarkup(value);
  const scene = svg ? extractMathVisualSpecFromSvg(svg) : undefined;

  if (scene) {
    rememberScene(value, scene);
  }

  return scene;
}

async function generateOpenRouterVector (
  apiKey: string,
  prompt: string,
  model: string,
  purpose: VisualPurpose,
  referenceScene?: MathVisualSpec
): Promise<VectorCandidate | null> {
  const response = await openRouterRequestGate.run(() => fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      messages: [{
        content: OPEN_ROUTER_VISUAL_SPEC_PROMPT(prompt, purpose, referenceScene ? JSON.stringify(referenceScene) : ''),
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
  const result = await response.json() as OpenRouterChatResponse;
  const content = result.choices?.[0]?.message?.content?.trim();

  if (!response.ok || !content) {
    throw new Error(result.error?.message || 'OpenRouter returned no visual scene.');
  }

  const plan = parseVisualPlan(parseJsonObject(content), Boolean(referenceScene));

  if (plan.format === 'raster') {
    return null;
  }

  const inputScene = plan.format === 'vector-patch'
    ? applyVisualPatch(referenceScene as MathVisualSpec, plan.operations)
    : plan.scene;
  const rendered = renderMathVisualSvg(inputScene);
  const dataUrl = svgMarkupToDataUrl(rendered.svg);

  if (!dataUrl) {
    throw new Error('The deterministic SVG renderer produced an invalid SVG.');
  }

  return { dataUrl, scene: rendered.scene, svg: rendered.svg };
}

export async function generateOpenRouterImage (apiKey: string, prompt: string): Promise<string> {
  const response = await openRouterRequestGate.run(() => fetchWithTimeout('https://openrouter.ai/api/v1/images', {
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

async function svgDataUrlToPng (svgDataUrl: string, width: number, height: number): Promise<string | undefined> {
  // Unit tests and non-browser runtimes have no canvas. Production Ability
  // generation runs in the browser, where QA receives the actual rasterized
  // pixels the learner will see rather than only SVG source code.
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return undefined;
  }

  try {
    const scale = 2;
    const image = new Image();

    image.src = svgDataUrl;

    if (typeof image.decode === 'function') {
      await withTimeout(image.decode(), IMAGE_DECODE_TIMEOUT_MS, 'Rendered visual decode timed out.');
    } else {
      await withTimeout(new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Unable to decode rendered visual.'));
      }), IMAGE_DECODE_TIMEOUT_MS, 'Rendered visual decode timed out.');
    }

    const canvas = document.createElement('canvas');

    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));

    const context = canvas.getContext('2d');

    if (!context) {
      return undefined;
    }

    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
}

function visualQaInstruction (contract: string, purpose: VisualPurpose): string {
  return `Audit this generated educational visual against the exact visual contract. This is an objective semantic and rendered-layout check, NOT an aesthetics review.

HARD-ERROR POLICY:
- A hard error must be a direct, unambiguous violation of an EXPLICIT requirement in the visual contract, a concrete rendering failure (cropping, unreadable/overlapping answer-relevant content, missing visible stroke/object), or ${purpose === 'question' ? 'answer leakage in a question visual.' : 'a missing/incorrect worked-solution result or an unintended change from the reference question visual.'}
- Do NOT infer extra requirements from conventions, preferences, or what would "look better".
- Styling that the contract does not explicitly specify is NON-BLOCKING. In particular, dashed vs solid, color choice, stroke thickness, font, label alignment, whitespace, and similar presentation choices are warnings at most when they preserve meaning and readability.
- For geometric claims, use the supplied scene JSON coordinates when available. Compute positions/sizes from those coordinates instead of trusting visual impression. If the coordinates satisfy the contract, do not report the geometry as wrong.
- Do not emit self-corrections, speculation, or contradictory reasoning as an error. Each hard error must be one short atomic factual discrepancy.

${purpose === 'question' ? 'This is a QUESTION visual: reject any answer leakage, completed construction, solution-only mark, or cue that gives away what the learner must infer.' : 'This is a SOLUTION visual: require the complete correct result. If a reference question visual is supplied, reject changes to any base object, label, scale, coordinate system, or layout that the requested answer did not require.'}

Return ONLY JSON in this exact shape:
{"ok":true,"hardErrors":[],"warnings":[]}
Set ok=false only when hardErrors is non-empty. Put harmless stylistic observations or ambiguous concerns in warnings, never hardErrors.

VISUAL CONTRACT:
${contract}`;
}

function stringArray (value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new Error(`Visual QA returned invalid ${field}.`);
  }

  return value.map((item) => String(item).trim());
}

const LINE_STYLE_RE = /\b(?:dash(?:ed|es)?|dotted|solid|broken[ -]?line|line style|stroke style|stroke pattern)\b/i;
const PURE_STYLE_RE = /\b(?:aesthetic|stylistic|would (?:be|look) better|prefer(?:red)?|font|typeface|stroke thickness|stroke width|label alignment|whitespace|colour|color choice)\b/i;

function isNonBlockingStylePreference (error: string, contract: string): boolean {
  // If the complaint is specifically about line style, it may block only when
  // the contract itself explicitly names a line style. This prevents QA from
  // inventing requirements such as "partition separators should be solid".
  if (LINE_STYLE_RE.test(error) && !LINE_STYLE_RE.test(contract)) {
    return true;
  }

  // Pure presentation preferences never block unless they also identify an
  // objective rendering failure such as clipping/unreadability/overlap.
  if (PURE_STYLE_RE.test(error) && !/\b(?:crop(?:ped|ping)?|clip(?:ped|ping)?|unreadable|illegible|overlap(?:ped|ping)?|missing|outside (?:the )?canvas)\b/i.test(error)) {
    return true;
  }

  return false;
}

function parseVisualQaResult (content: string, contract: string): VisualQaResult {
  const parsed = parseJsonObject(content);
  const ok = parsed.ok;

  if (typeof ok !== 'boolean') {
    throw new Error('Visual QA returned invalid JSON.');
  }

  let hardErrors: string[];
  let warnings: string[];

  if ('hardErrors' in parsed || 'warnings' in parsed) {
    hardErrors = stringArray(parsed.hardErrors ?? [], 'hardErrors');
    warnings = stringArray(parsed.warnings ?? [], 'warnings');
  } else {
    // Backward compatibility with older QA responses and tests. Legacy errors
    // are still passed through the same deterministic style demotion below.
    hardErrors = stringArray(parsed.errors, 'errors');
    warnings = [];
  }

  const blocking: string[] = [];

  for (const error of hardErrors) {
    if (isNonBlockingStylePreference(error, contract)) {
      warnings.push(error);
    } else {
      blocking.push(error);
    }
  }

  // Trust objective discrepancies, not the model's boolean if it contradicts
  // the normalized severity classification. A QA response containing only
  // warnings must never force an expensive regeneration/failure loop.
  return { errors: blocking, ok: blocking.length === 0, warnings };
}

async function verifyOpenRouterVisual (
  apiKey: string,
  contract: string,
  candidate: string,
  model: string,
  purpose: VisualPurpose,
  referenceVisual?: string,
  candidateSvg?: string,
  candidateScene?: MathVisualSpec,
  qaContext?: string
): Promise<VisualQaResult> {
  const instruction = visualQaInstruction(`${contract}${qaContext ? `\n\nABILITY CONTEXT FOR QA ONLY:\n${qaContext}` : ''}`, purpose);
  const referenceScene = sceneFromVisual(referenceVisual);
  const referenceSvg = referenceVisual ? svgDataUrlToMarkup(referenceVisual) : undefined;
  const content: Array<Record<string, unknown>> = [{ text: instruction, type: 'text' }];

  if (referenceScene) {
    content.push({ text: `REFERENCE QUESTION SCENE JSON:\n${JSON.stringify(referenceScene)}`, type: 'text' });
  } else if (referenceSvg) {
    content.push({ text: `REFERENCE QUESTION SVG (legacy):\n${referenceSvg}`, type: 'text' });
  }

  if (referenceVisual) {
    const referencePng = referenceScene && referenceSvg
      ? await svgDataUrlToPng(referenceVisual, referenceScene.width, referenceScene.height)
      : undefined;

    content.push({ text: 'REFERENCE QUESTION VISUAL AS RENDERED:', type: 'text' });
    content.push({ image_url: { url: referencePng ?? referenceVisual }, type: 'image_url' });
  }

  if (candidateSvg && candidateScene) {
    const renderedPng = candidate.startsWith('data:image/png')
      ? candidate
      : await svgDataUrlToPng(candidate, candidateScene.width, candidateScene.height);

    // Scene JSON gives QA exact semantics while the PNG gives it the actual
    // learner-visible rendering. Re-sending the full deterministic SVG is
    // redundant, expensive, and slows every QA request substantially.
    content.push({ text: `GENERATED CANDIDATE SCENE JSON:\n${JSON.stringify(candidateScene)}`, type: 'text' });

    if (renderedPng) {
      content.push({ text: 'ACTUAL RENDERED CANDIDATE PNG:', type: 'text' });
      content.push({ image_url: { url: renderedPng }, type: 'image_url' });
    }
  } else {
    content.push({ text: 'GENERATED CANDIDATE VISUAL:', type: 'text' });
    content.push({ image_url: { url: candidate }, type: 'image_url' });
  }

  const response = await openRouterRequestGate.run(() => fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      max_tokens: 700,
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
  const result = await response.json() as OpenRouterChatResponse;
  const responseContent = result.choices?.[0]?.message?.content?.trim();

  if (!response.ok || !responseContent) {
    throw new Error(result.error?.message || 'OpenRouter visual QA returned no result.');
  }

  return parseVisualQaResult(responseContent, contract);
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
  const referenceScene = purpose === 'solution' ? sceneFromVisual(referenceVisual) : undefined;

  for (let attempt = 0; attempt < MAX_VISUAL_ATTEMPTS; attempt++) {
    const contractedPrompt = `${prompt}${correction ? `\n\nREGENERATION REQUIREMENTS FROM THE PREVIOUS VALIDATION/QA FAILURE:\n${correction}` : ''}`;
    let vector: VectorCandidate | null;

    try {
      vector = await generateOpenRouterVector(apiKey, contractedPrompt, svgModel, purpose, referenceScene);
    } catch (caught) {
      lastError = caught instanceof Error ? caught.message : 'Invalid structured vector scene.';
      correction = lastError;
      // A malformed math/vector response is repaired by another structured
      // attempt. Do NOT silently turn it into an image-model request.
      continue;
    }

    let candidate: string;
    let candidateSvg: string | undefined;
    let candidateScene: MathVisualSpec | undefined;

    if (vector) {
      candidateSvg = vector.svg;
      candidateScene = vector.scene;
      const renderedPng = await svgDataUrlToPng(vector.dataUrl, vector.scene.width, vector.scene.height);

      // Prefer PNG for persisted/generated Ability images. Cache the structured
      // scene by the returned PNG so a following solution call can patch the
      // exact question scene. SVG remains a safe fallback outside browsers.
      candidate = renderedPng ?? vector.dataUrl;
      rememberScene(candidate, vector.scene);
    } else {
      // Raster is only reached when the planning model explicitly says the task
      // genuinely depends on photographic/natural imagery.
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
      const qa = await verifyOpenRouterVisual(apiKey, prompt, candidate, svgModel, purpose, referenceVisual, candidateSvg, candidateScene, qaContext);

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

  throw new Error(`Unable to generate a verified required Ability visual after ${MAX_VISUAL_ATTEMPTS} attempts.${lastError ? ` Last visual validation/QA error: ${lastError}` : ''}`);
}

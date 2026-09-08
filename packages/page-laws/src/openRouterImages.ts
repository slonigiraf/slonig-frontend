// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

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

async function generateOpenRouterSvg (apiKey: string, prompt: string, model: string): Promise<string | null | undefined> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    body: JSON.stringify({
      messages: [{
        content: `Decide whether this educational Ability visual can be represented faithfully as a clean vector SVG. Prefer SVG for diagrams, geometry, graphs, charts, tables, symbols, simple objects, maps, layouts, and other task visuals whose educational information is shape/text/position/relationship based. Choose raster only when the task genuinely depends on photographic realism, natural texture, subtle material appearance, complex real-world imagery, or another property that SVG would materially lose. Never choose raster merely for aesthetics.\n\nIf SVG is suitable, create a complete standalone SVG that exactly represents the requested task-essential visual. Keep it simple and readable, include only information required by the task, do not reveal the answer, use a viewBox, and do not use scripts, external resources, embedded raster images, foreignObject, URLs, or event handlers. If SVG would break the educational logic, choose raster.\n\nReturn only JSON: {"format":"svg","svg":"<svg ...>...</svg>"} or {"format":"raster","svg":""}.\n\nVisual request:\n${prompt}`,
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
  });
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

export async function generateOpenRouterVisual (apiKey: string, prompt: string, svgModel: string): Promise<string> {
  // Required Ability visuals must not depend on the user-selected text model.
  // Use the dedicated image-capable endpoint/model first. SVG generation through
  // the selected chat model is only a fallback for transient image-endpoint errors.
  let imageError: unknown;

  try {
    return await generateOpenRouterImage(apiKey, prompt);
  } catch (caught) {
    imageError = caught;
  }

  const svg = await generateOpenRouterSvg(apiKey, prompt, svgModel).catch(() => undefined);

  if (svg) {
    return svg;
  }

  const message = imageError instanceof Error ? imageError.message : 'Unknown image generation error.';

  throw new Error(`Unable to generate the required Ability visual with the dedicated image model. ${message}`);
}

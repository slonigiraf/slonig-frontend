// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { OPENAI_MODELS } from './constants.js';

export const OPENROUTER_MODEL_PROVIDERS = [
  { authors: ['openai'], text: 'OpenAI', value: 'openai' },
  { authors: ['anthropic'], text: 'Anthropic', value: 'anthropic' },
  { authors: ['deepseek'], text: 'DeepSeek', value: 'deepseek' },
  { authors: ['qwen', 'alibaba'], text: 'Alibaba', value: 'alibaba' },
  { authors: ['z-ai'], text: 'Z.ai', value: 'z-ai' },
  { authors: ['moonshotai'], text: 'Moonshot AI', value: 'moonshotai' }
] as const;

export type OpenRouterProviderId = typeof OPENROUTER_MODEL_PROVIDERS[number]['value'];

export interface OpenRouterModelOption {
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  text: string;
  value: string;
}

export type OpenRouterModelCatalog = Record<OpenRouterProviderId, OpenRouterModelOption[]>;

interface OpenRouterApiModel {
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  };
  id?: unknown;
  name?: unknown;
  pricing?: {
    completion?: unknown;
    prompt?: unknown;
  };
}

interface OpenRouterModelsResponse {
  data?: unknown;
}

const SESSION_CATALOG_KEY = 'slonig.openrouter.modelCatalog.v1';
const livePricesPerMillion = new Map<string, [number, number]>();
let catalogPromise: Promise<OpenRouterModelCatalog> | undefined;
let cachedCatalog: OpenRouterModelCatalog | undefined;
let sessionCatalogChecked = false;

function emptyCatalog (): OpenRouterModelCatalog {
  return {
    'alibaba': [],
    'anthropic': [],
    'deepseek': [],
    'moonshotai': [],
    'openai': [],
    'z-ai': []
  };
}

function fallbackCatalog (): OpenRouterModelCatalog {
  return {
    ...emptyCatalog(),
    openai: OPENAI_MODELS.map(({ text, value }) => ({ text, value }))
  };
}

function isModelOption (value: unknown): value is OpenRouterModelOption {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const option = value as Partial<OpenRouterModelOption>;
  const validPrice = (price: unknown): boolean => price === undefined || (typeof price === 'number' && Number.isFinite(price) && price >= 0);

  return typeof option.text === 'string' &&
    typeof option.value === 'string' &&
    validPrice(option.inputPricePerMillion) &&
    validPrice(option.outputPricePerMillion);
}

function isCatalog (value: unknown): value is OpenRouterModelCatalog {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<OpenRouterProviderId, unknown>>;

  return OPENROUTER_MODEL_PROVIDERS.every(({ value: provider }) => Array.isArray(candidate[provider]) && candidate[provider]!.every(isModelOption));
}

function sortCatalogByInputPrice (catalog: OpenRouterModelCatalog): OpenRouterModelCatalog {
  for (const { value: provider } of OPENROUTER_MODEL_PROVIDERS) {
    catalog[provider].sort((a, b) => {
      const aPrice = a.inputPricePerMillion;
      const bPrice = b.inputPricePerMillion;

      if (aPrice === undefined && bPrice === undefined) {
        return 0;
      }

      if (aPrice === undefined) {
        return 1;
      }

      if (bPrice === undefined) {
        return -1;
      }

      return aPrice - bPrice;
    });
  }

  return catalog;
}

function cachePrices (catalog: OpenRouterModelCatalog): void {
  for (const { value: provider } of OPENROUTER_MODEL_PROVIDERS) {
    for (const option of catalog[provider]) {
      if (option.inputPricePerMillion !== undefined && option.outputPricePerMillion !== undefined) {
        livePricesPerMillion.set(option.value, [option.inputPricePerMillion, option.outputPricePerMillion]);
      }
    }
  }
}

function readSessionCatalog (): OpenRouterModelCatalog | undefined {
  if (sessionCatalogChecked) {
    return cachedCatalog;
  }

  if (typeof window === 'undefined') {
    return undefined;
  }

  sessionCatalogChecked = true;

  try {
    const raw = window.sessionStorage.getItem(SESSION_CATALOG_KEY);

    if (!raw) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(raw);

    if (!isCatalog(parsed)) {
      window.sessionStorage.removeItem(SESSION_CATALOG_KEY);
      return undefined;
    }

    const sortedCatalog = sortCatalogByInputPrice(parsed);

    cachedCatalog = sortedCatalog;
    cachePrices(sortedCatalog);

    return sortedCatalog;
  } catch {
    // Storage can be unavailable in privacy/sandboxed contexts. Fall back to
    // the in-memory cache for this page without blocking model selection.
    return undefined;
  }
}

function writeSessionCatalog (catalog: OpenRouterModelCatalog): void {
  cachedCatalog = catalog;
  cachePrices(catalog);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(SESSION_CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    // The live in-memory catalog remains usable if sessionStorage is blocked.
  }
}

function modelAuthor (modelId: string): string {
  return (modelId.split('/', 1)[0] ?? '').replace(/^~/, '').toLowerCase();
}

export function openRouterProviderForModel (modelId: string): OpenRouterProviderId | undefined {
  const author = modelAuthor(modelId);

  return OPENROUTER_MODEL_PROVIDERS.find(({ authors }) => (authors as readonly string[]).includes(author))?.value;
}

function parsePerMillionPrice (price: unknown): number | undefined {
  const perToken = typeof price === 'number' ? price : typeof price === 'string' ? Number(price) : NaN;

  return Number.isFinite(perToken) && perToken >= 0 ? perToken * 1_000_000 : undefined;
}

function formatPerMillionPrice (price: number | undefined): string {
  if (price === undefined) {
    return 'n/a';
  }

  if (price === 0) {
    return '$0';
  }

  const maximumFractionDigits = price >= 100 ? 2 : price >= 1 ? 3 : 4;

  return `$${price.toLocaleString(undefined, { maximumFractionDigits, minimumFractionDigits: 0 })}`;
}

function stringArray (value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function normalizeModel (model: OpenRouterApiModel): { option: OpenRouterModelOption; provider: OpenRouterProviderId } | undefined {
  if (typeof model.id !== 'string' || !model.id) {
    return undefined;
  }

  const provider = openRouterProviderForModel(model.id);

  if (!provider) {
    return undefined;
  }

  const inputModalities = stringArray(model.architecture?.input_modalities);
  const outputModalities = stringArray(model.architecture?.output_modalities);

  // This application sends text chat-completion requests. Exclude catalog
  // entries that explicitly cannot accept text or return text.
  if (inputModalities && !inputModalities.includes('text')) {
    return undefined;
  }

  if (outputModalities && !outputModalities.includes('text')) {
    return undefined;
  }

  const inputPricePerMillion = parsePerMillionPrice(model.pricing?.prompt);
  const outputPricePerMillion = parsePerMillionPrice(model.pricing?.completion);
  const name = typeof model.name === 'string' && model.name.trim() ? model.name.trim() : model.id;
  const priceLabel = `${formatPerMillionPrice(inputPricePerMillion)}/M in · ${formatPerMillionPrice(outputPricePerMillion)}/M out`;

  return {
    option: {
      inputPricePerMillion,
      outputPricePerMillion,
      text: `${name} — ${priceLabel}`,
      value: model.id
    },
    provider
  };
}

export function normalizeOpenRouterModelCatalog (response: OpenRouterModelsResponse): OpenRouterModelCatalog {
  const catalog = emptyCatalog();
  const models = Array.isArray(response.data) ? response.data : [];

  for (const candidate of models) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const normalized = normalizeModel(candidate as OpenRouterApiModel);

    if (!normalized) {
      continue;
    }

    catalog[normalized.provider].push(normalized.option);

    if (normalized.option.inputPricePerMillion !== undefined && normalized.option.outputPricePerMillion !== undefined) {
      livePricesPerMillion.set(normalized.option.value, [normalized.option.inputPricePerMillion, normalized.option.outputPricePerMillion]);
    }
  }

  return sortCatalogByInputPrice(catalog);
}

export function getOpenRouterModelPricePerMillion (modelId: string): [number, number] | undefined {
  readSessionCatalog();

  return livePricesPerMillion.get(modelId);
}

export function getCachedOpenRouterModelCatalog (): OpenRouterModelCatalog | undefined {
  return readSessionCatalog();
}

export function getFallbackOpenRouterModelCatalog (): OpenRouterModelCatalog {
  return fallbackCatalog();
}

async function fetchOpenRouterModelCatalog (apiKey?: string): Promise<OpenRouterModelCatalog> {
  const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=text', {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      'HTTP-Referer': window.location.origin,
      'X-OpenRouter-Title': 'Slonig'
    }
  });

  if (!response.ok) {
    throw new Error(`OpenRouter model catalog request failed (${response.status}).`);
  }

  const catalog = normalizeOpenRouterModelCatalog(await response.json() as OpenRouterModelsResponse);
  const modelCount = OPENROUTER_MODEL_PROVIDERS.reduce((total, { value }) => total + catalog[value].length, 0);

  if (!modelCount) {
    throw new Error('OpenRouter returned no supported models for the selected providers.');
  }

  writeSessionCatalog(catalog);

  return catalog;
}

/**
 * Load the live catalog once per browser-tab session. sessionStorage survives
 * page refreshes, but is discarded when the tab/session is closed, so prices
 * are refreshed the next time the application is opened in a new session.
 */
export function loadOpenRouterModelCatalog (apiKey?: string): Promise<OpenRouterModelCatalog> {
  const sessionCatalog = readSessionCatalog();

  if (sessionCatalog) {
    return Promise.resolve(sessionCatalog);
  }

  catalogPromise ??= fetchOpenRouterModelCatalog(apiKey);

  return catalogPromise;
}

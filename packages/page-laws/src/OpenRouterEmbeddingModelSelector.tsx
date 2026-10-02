// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getSetting, SettingKey } from '@slonigiraf/db';
import React, { useEffect, useMemo, useState } from 'react';

import { Dropdown } from '@polkadot/react-components';

import { DEFAULT_STANDARDS_EMBEDDER } from './constants.js';
import { cacheOpenRouterModelPricePerMillion } from './openRouterModels.js';

interface Props {
  className?: string;
  isDisabled?: boolean;
  label?: string;
  onChange: (value: string) => void;
  value: string;
}

interface EmbeddingModelOption {
  inputPricePerMillion?: number;
  text: string;
  value: string;
}

interface OpenRouterEmbeddingApiModel {
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  };
  id?: unknown;
  name?: unknown;
  pricing?: {
    prompt?: unknown;
  };
}

const SESSION_KEY = 'slonig.openrouter.embeddingModelCatalog.v1';
const FALLBACK_MODELS: EmbeddingModelOption[] = [
  { inputPricePerMillion: 0.02, text: 'OpenAI: Text Embedding 3 Small — $0.02/M', value: DEFAULT_STANDARDS_EMBEDDER },
  { inputPricePerMillion: 0.13, text: 'OpenAI: Text Embedding 3 Large — $0.13/M', value: 'openai/text-embedding-3-large' }
];

FALLBACK_MODELS.forEach(({ inputPricePerMillion, value }) => {
  if (inputPricePerMillion !== undefined) {
    cacheOpenRouterModelPricePerMillion(value, inputPricePerMillion, 0);
  }
});

function stringArray (value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;
}

function parsePricePerMillion (value: unknown): number | undefined {
  const perToken = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

  return Number.isFinite(perToken) && perToken >= 0 ? perToken * 1_000_000 : undefined;
}

function priceLabel (price: number | undefined): string {
  if (price === undefined) {
    return 'price n/a';
  }

  if (price === 0) {
    return '$0/M';
  }

  const maximumFractionDigits = price >= 1 ? 3 : 4;

  return `$${price.toLocaleString(undefined, { maximumFractionDigits, minimumFractionDigits: 0 })}/M`;
}

function normalizeEmbeddingModels (data: unknown): EmbeddingModelOption[] {
  if (!Array.isArray(data)) {
    return [];
  }

  const byId = new Map<string, EmbeddingModelOption>();

  data.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return;
    }

    const model = candidate as OpenRouterEmbeddingApiModel;

    if (typeof model.id !== 'string' || !model.id || model.id.toLowerCase().endsWith(':batch')) {
      return;
    }

    const inputModalities = stringArray(model.architecture?.input_modalities);
    const outputModalities = stringArray(model.architecture?.output_modalities);

    // The catalog request is already filtered to embedding-capable models, and
    // this explicit check prevents chat/image models from ever entering the selector.
    if ((inputModalities && !inputModalities.includes('text')) || !outputModalities?.includes('embeddings')) {
      return;
    }

    const inputPricePerMillion = parsePricePerMillion(model.pricing?.prompt);
    const provider = model.id.split('/', 1)[0] || 'provider';
    const name = typeof model.name === 'string' && model.name.trim() ? model.name.trim() : model.id;
    const option = {
      inputPricePerMillion,
      text: `${provider}: ${name} — ${priceLabel(inputPricePerMillion)}`,
      value: model.id
    };

    byId.set(model.id, option);

    if (inputPricePerMillion !== undefined) {
      cacheOpenRouterModelPricePerMillion(model.id, inputPricePerMillion, 0);
    }
  });

  return Array.from(byId.values()).sort((a, b) => {
    if (a.inputPricePerMillion === undefined && b.inputPricePerMillion !== undefined) {
      return 1;
    }

    if (a.inputPricePerMillion !== undefined && b.inputPricePerMillion === undefined) {
      return -1;
    }

    return (a.inputPricePerMillion ?? 0) - (b.inputPricePerMillion ?? 0) || a.text.localeCompare(b.text);
  });
}

function readCachedModels (): EmbeddingModelOption[] | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);

    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return undefined;
    }

    const models = parsed.filter((option): option is EmbeddingModelOption => Boolean(
      option && typeof option === 'object' && typeof (option as EmbeddingModelOption).text === 'string' && typeof (option as EmbeddingModelOption).value === 'string'
    ));

    models.forEach(({ inputPricePerMillion, value }) => {
      if (inputPricePerMillion !== undefined) {
        cacheOpenRouterModelPricePerMillion(value, inputPricePerMillion, 0);
      }
    });

    return models.length ? models : undefined;
  } catch {
    return undefined;
  }
}

export default function OpenRouterEmbeddingModelSelector ({ className, isDisabled = false, label = 'Embedding model', onChange, value }: Props): React.ReactElement {
  const [models, setModels] = useState<EmbeddingModelOption[]>(() => readCachedModels() ?? FALLBACK_MODELS);
  const [hasLiveCatalog, setHasLiveCatalog] = useState(() => Boolean(readCachedModels()));
  const selectedValue = useMemo(() => models.some((option) => option.value === value) ? value : undefined, [models, value]);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      let apiKey: string | undefined;

      try {
        apiKey = await getSetting(SettingKey.OPENROUTER_TOKEN) || undefined;
      } catch {
        // The public compatible-model catalog can still be loaded without a key.
      }

      const response = await fetch('https://openrouter.ai/api/v1/models?output_modalities=embeddings', {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'HTTP-Referer': window.location.origin,
          'X-OpenRouter-Title': 'Slonig'
        }
      });

      if (!response.ok) {
        throw new Error(`OpenRouter embedding model catalog request failed (${response.status}).`);
      }

      const body = await response.json() as { data?: unknown };
      const compatible = normalizeEmbeddingModels(body.data);

      if (!compatible.length) {
        throw new Error('OpenRouter returned no text embedding models.');
      }

      if (active) {
        setModels(compatible);
        setHasLiveCatalog(true);

        try {
          window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(compatible));
        } catch {
          // An in-memory catalog remains enough when session storage is blocked.
        }
      }
    };

    void load().catch((error) => console.warn('Unable to refresh OpenRouter embedding model catalog.', error));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLiveCatalog || !models.length || models.some((option) => option.value === value)) {
      return;
    }

    onChange(models[0].value);
  }, [hasLiveCatalog, models, onChange, value]);

  return <Dropdown
    className={className}
    isDisabled={isDisabled || !models.length}
    isFull
    label={label}
    onChange={onChange}
    options={models}
    placeholder={models.length ? undefined : 'No compatible embedding models available'}
    value={selectedValue}
  />;
}

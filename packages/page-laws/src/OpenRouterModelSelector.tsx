// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getSetting, SettingKey } from '@slonigiraf/db';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Dropdown } from '@polkadot/react-components';

import { getCachedOpenRouterModelCatalog, getFallbackOpenRouterModelCatalog, loadOpenRouterModelCatalog, OPENROUTER_MODEL_PROVIDERS, openRouterModelSupportsInputModalities, openRouterProviderForModel, type OpenRouterModelCatalog, type OpenRouterProviderId } from './openRouterModels.js';

interface Props {
  className?: string;
  isDisabled?: boolean;
  modelLabel?: string;
  onChange: (value: string) => void;
  providerLabel?: string;
  requiredInputModalities?: readonly string[];
  value: string;
}

function isProviderId (value: string): value is OpenRouterProviderId {
  return OPENROUTER_MODEL_PROVIDERS.some((provider) => provider.value === value);
}

export default function OpenRouterModelSelector ({ className, isDisabled = false, modelLabel = 'Model', onChange, providerLabel = 'Provider', requiredInputModalities = [], value }: Props): React.ReactElement {
  const [catalog, setCatalog] = useState<OpenRouterModelCatalog>(() => getCachedOpenRouterModelCatalog() ?? getFallbackOpenRouterModelCatalog());
  const [hasLiveCatalog, setHasLiveCatalog] = useState(() => Boolean(getCachedOpenRouterModelCatalog()));
  const [provider, setProvider] = useState<OpenRouterProviderId>(() => openRouterProviderForModel(value) ?? 'openai');

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      let apiKey: string | undefined;

      try {
        apiKey = await getSetting(SettingKey.OPENROUTER_TOKEN) || undefined;
      } catch {
        // The public catalog can still be attempted without a stored key.
      }

      try {
        const nextCatalog = await loadOpenRouterModelCatalog(apiKey);

        if (active) {
          setCatalog(nextCatalog);
          setHasLiveCatalog(true);
        }
      } catch (error) {
        // Keep the existing static OpenAI fallback. A successful catalog is
        // stored in sessionStorage and reused across page refreshes until the
        // browser tab/session is closed.
        console.warn('Unable to refresh OpenRouter model catalog.', error);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const valueProvider = openRouterProviderForModel(value);

    if (valueProvider && valueProvider !== provider) {
      setProvider(valueProvider);
    }
  }, [provider, value]);

  const modelOptions = useMemo(() => catalog[provider].filter((option) => openRouterModelSupportsInputModalities(option, requiredInputModalities)), [catalog, provider, requiredInputModalities]);

  useEffect(() => {
    if (!modelOptions.length || modelOptions.some((option) => option.value === value)) {
      return;
    }

    if (hasLiveCatalog || requiredInputModalities.length) {
      onChange(modelOptions[0].value);
    }
  }, [hasLiveCatalog, modelOptions, onChange, requiredInputModalities.length, value]);

  const changeProvider = useCallback((nextValue: string): void => {
    if (!isProviderId(nextValue)) {
      return;
    }

    setProvider(nextValue);

    const firstModel = catalog[nextValue].find((option) => openRouterModelSupportsInputModalities(option, requiredInputModalities));

    if (firstModel) {
      onChange(firstModel.value);
    }
  }, [catalog, onChange, requiredInputModalities]);

  return <>
    <Dropdown
      className={className ? `${className}Provider` : undefined}
      isDisabled={isDisabled}
      isFull
      label={providerLabel}
      onChange={changeProvider}
      options={OPENROUTER_MODEL_PROVIDERS.map(({ text, value: providerValue }) => ({ text, value: providerValue }))}
      value={provider}
    />
    <Dropdown
      className={className}
      isDisabled={isDisabled || !modelOptions.length}
      isFull
      label={modelLabel}
      onChange={onChange}
      options={modelOptions}
      placeholder={modelOptions.length ? undefined : requiredInputModalities.length ? 'No compatible models available' : 'No models available'}
      value={modelOptions.some((option) => option.value === value) ? value : undefined}
    />
  </>;
}

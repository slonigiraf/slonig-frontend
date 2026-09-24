// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getOpenRouterModelPricePerMillion, normalizeOpenRouterModelCatalog, openRouterProviderForModel } from './openRouterModels.js';

describe('OpenRouter model catalog', (): void => {
  it('maps the requested model authors to provider dropdown values', (): void => {
    expect(openRouterProviderForModel('openai/gpt-test')).toEqual('openai');
    expect(openRouterProviderForModel('anthropic/claude-test')).toEqual('anthropic');
    expect(openRouterProviderForModel('deepseek/deepseek-test')).toEqual('deepseek');
    expect(openRouterProviderForModel('qwen/qwen-test')).toEqual('alibaba');
    expect(openRouterProviderForModel('alibaba/wan-test')).toEqual('alibaba');
    expect(openRouterProviderForModel('z-ai/glm-test')).toEqual('z-ai');
    expect(openRouterProviderForModel('moonshotai/kimi-test')).toEqual('moonshotai');
    expect(openRouterProviderForModel('~moonshotai/kimi-latest')).toEqual('moonshotai');
    expect(openRouterProviderForModel('google/gemini-test')).toEqual(undefined);
  });

  it('filters to requested providers and formats live per-million-token prices', (): void => {
    const catalog = normalizeOpenRouterModelCatalog({
      data: [
        {
          architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
          id: 'anthropic/claude-test',
          name: 'Claude Test',
          pricing: { completion: '0.00001', prompt: '0.000002' }
        },
        {
          architecture: { input_modalities: ['text'], output_modalities: ['image'] },
          id: 'openai/image-only',
          name: 'Image only',
          pricing: { completion: '0', prompt: '0.000001' }
        },
        {
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          id: 'anthropic/claude-test:batch',
          name: 'Claude Test (batch)',
          pricing: { completion: '0.000005', prompt: '0.000001' }
        },
        {
          architecture: { input_modalities: ['text'], output_modalities: ['text'] },
          id: 'google/gemini-test',
          name: 'Gemini Test',
          pricing: { completion: '0.000003', prompt: '0.000001' }
        }
      ]
    });

    expect(catalog.anthropic).toEqual([{
      inputPricePerMillion: 2,
      outputPricePerMillion: 10,
      text: 'Claude Test — $2/M in · $10/M out',
      value: 'anthropic/claude-test'
    }]);
    expect(catalog.openai).toEqual([]);
    expect(getOpenRouterModelPricePerMillion('anthropic/claude-test')).toEqual([2, 10]);
  });

  it('sorts each provider model list by input price, output price, then name', (): void => {
    const catalog = normalizeOpenRouterModelCatalog({
      data: [
        {
          id: 'openai/expensive',
          name: 'Expensive',
          pricing: { completion: '0.00002', prompt: '0.00001' }
        },
        {
          id: 'openai/free-zulu',
          name: 'Zulu Free',
          pricing: { completion: '0', prompt: '0' }
        },
        {
          id: 'openai/cheap-output',
          name: 'Cheap Output',
          pricing: { completion: '0.000004', prompt: '0.000001' }
        },
        {
          id: 'openai/free-alpha',
          name: 'Alpha Free',
          pricing: { completion: '0', prompt: '0' }
        },
        {
          id: 'openai/expensive-output',
          name: 'Expensive Output',
          pricing: { completion: '0.000005', prompt: '0.000001' }
        },
        {
          id: 'openai/unpriced-zulu',
          name: 'Zulu Unpriced'
        },
        {
          id: 'openai/unpriced-alpha',
          name: 'Alpha Unpriced'
        }
      ]
    });

    expect(catalog.openai.map(({ value }) => value)).toEqual([
      'openai/free-alpha',
      'openai/free-zulu',
      'openai/cheap-output',
      'openai/expensive-output',
      'openai/expensive',
      'openai/unpriced-alpha',
      'openai/unpriced-zulu'
    ]);
  });
});

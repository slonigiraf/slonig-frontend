// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

interface OpenRouterUsageResponse {
  usage?: {
    cost?: unknown;
  };
}

export type OpenRouterCostReporter = (costUsd: number) => void;

export function openRouterResponseCost (response: unknown): number {
  if (typeof response !== 'object' || response === null || !('usage' in response)) {
    return 0;
  }

  const usage = (response as OpenRouterUsageResponse).usage;
  const value = usage?.cost;
  const cost = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;

  return Number.isFinite(cost) && cost >= 0 ? cost : 0;
}

export function reportOpenRouterCost (response: unknown, reporter?: OpenRouterCostReporter): void {
  if (!reporter) {
    return;
  }

  const cost = openRouterResponseCost(response);

  if (cost > 0) {
    reporter(cost);
  }
}

export function formatOpenRouterSpend (costUsd: number): string {
  return `$${Math.max(0, costUsd).toFixed(6)}`;
}

// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { formatOpenRouterSpend, openRouterResponseCost } from './openRouterCost.js';

describe('OpenRouter cost tracking', (): void => {
  it('reads numeric and numeric-string usage costs', (): void => {
    expect(openRouterResponseCost({ usage: { cost: 0.001234 } })).toEqual(0.001234);
    expect(openRouterResponseCost({ usage: { cost: '0.0456' } })).toEqual(0.0456);
  });

  it('ignores absent, invalid, negative, and non-finite costs', (): void => {
    expect(openRouterResponseCost({})).toEqual(0);
    expect(openRouterResponseCost({ usage: { cost: 'unknown' } })).toEqual(0);
    expect(openRouterResponseCost({ usage: { cost: -1 } })).toEqual(0);
    expect(openRouterResponseCost({ usage: { cost: Infinity } })).toEqual(0);
  });

  it('keeps enough precision visible for small per-request spend', (): void => {
    expect(formatOpenRouterSpend(0.0001234)).toEqual('$0.000123');
    expect(formatOpenRouterSpend(1.2)).toEqual('$1.200000');
  });
});

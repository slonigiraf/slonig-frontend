// Copyright 2017-2023 @polkadot/apps-config authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { EndpointOption } from './types.js';

import { POLKADOT_GENESIS } from '../api/constants.js';
import { chainsSlonigSVG } from '../ui/logos/chains/index.js';
import { nodesAssetHubSVG, nodesBridgeHubSVG } from '../ui/logos/nodes/index.js';
import { getTeleports } from './util.js';

// The available endpoints that will show in the dropdown. For the most part (with the exception of
// Polkadot) we try to keep this to live chains only, with RPCs hosted by the community/chain vendor
//   info: The chain logo name as defined in ../ui/logos/index.ts in namedLogos (this also needs to align with @polkadot/networks)
//   text: The text to display on the dropdown
//   providers: The actual hosted secure websocket endpoint
//
// IMPORTANT: Alphabetical based on text
export const prodParasSlonigCommon: EndpointOption[] = [
  {
    info: 'giraf',
    paraId: 1000,
    providers: {
      Slonig: 'wss://ws-parachain-1.slonigiraf.org'
    },
    teleport: [-1],
    text: 'Giraf',
    ui: {
      color: '#86e62a',
      logo: 'fa;graduation-cap'
    }
  },
  {
    info: 'slon1',
    paraId: 1002,
    providers: {
      Slonig: 'wss://ws-parachain-1.slonigiraf.org'
    },
    text: 'Slon-1',
    ui: {
      logo: 'fa;dollar-sign'
    }
  },
  {
    info: 'slon2',
    paraId: 1001,
    providers: {
      Slonig: 'wss://ws-parachain-1.slonigiraf.org'
    },
    teleport: [-1],
    text: 'Slon-2',
    ui: {
      color: '#e6777a',
      logo: 'fa;dollar-sign'
    }
  }
];

export const prodRelaySlonig: EndpointOption = {
  dnslink: 'polkadot',
  genesisHash: POLKADOT_GENESIS,
  info: 'polkadot',
  linked: [
    ...prodParasSlonigCommon
  ],
  providers: {
    Slonig: 'wss://ws-parachain-1.slonigiraf.org',
    'light client': 'light://substrate-connect/polkadot'
  },
  teleport: getTeleports(prodParasSlonigCommon),
  text: 'Slonig',
  ui: {
    color: '#e6007a',
    identityIcon: 'polkadot',
    logo: chainsSlonigSVG
  }
};

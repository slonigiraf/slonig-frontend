// Copyright 2017-2023 @polkadot/apps-routing authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Routes, TFunction } from './types.js';
import accounts from './accounts.js';
import parachains from './parachains.js';
import badges from './badges.js';
import knowledge from './knowledge.js';
import settings from './settings.js';
import signing from './signing.js';
import teleport from './teleport.js';
import transfer from './transfer.js';
import utilities from './utilities.js';

export default function create (t: TFunction): Routes {
  return [
    accounts(t),
    transfer(t),
    teleport(t),
    knowledge(t),
    badges(t),
    parachains(t),
    signing(t),
    utilities(t),
    settings(t)
  ];
}

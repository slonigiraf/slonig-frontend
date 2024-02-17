// Copyright 2017-2023 @polkadot/apps-routing authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Routes, TFunction } from './types.js';
import accounts from './accounts.js';
import addresses from './addresses.js';
import contracts from './contracts.js';
import explorer from './explorer.js';
import extrinsics from './extrinsics.js';
import files from './files.js';
import gilt from './gilt.js';
import js from './js.js';
import nis from './nis.js';
import parachains from './parachains.js';
import diplomas from './diplomas.js';
import knowledge from './knowledge.js';
import referenda from './referenda.js';
import rpc from './rpc.js';
import runtime from './runtime.js';
import settings from './settings.js';
import signing from './signing.js';
import society from './society.js';
import storage from './storage.js';
import sudo from './sudo.js';
import teleport from './teleport.js';
import transfer from './transfer.js';
import utilities from './utilities.js';

export default function create (t: TFunction): Routes {
  return [
    accounts(t),
    addresses(t),
    explorer(t),
    transfer(t),
    teleport(t),
    knowledge(t),
    diplomas(t),
    // governance v2
    referenda(t),
    // others
    parachains(t),
    society(t),
    nis(t),
    gilt(t),
    contracts(t),
    storage(t),
    extrinsics(t),
    rpc(t),
    runtime(t),
    signing(t),
    sudo(t),
    files(t),
    js(t),
    utilities(t),
    settings(t)
  ];
}

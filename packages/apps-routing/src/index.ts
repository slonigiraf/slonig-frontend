// Copyright 2017-2023 @polkadot/apps-routing authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Routes, TFunction } from './types.js';
import accounts from './accounts.js';
import addresses from './addresses.js';
import assets from './assets.js';
import calendar from './calendar.js';
import collator from './collator.js';
import contracts from './contracts.js';
import explorer from './explorer.js';
import extrinsics from './extrinsics.js';
import files from './files.js';
import gilt from './gilt.js';
import js from './js.js';
import nfts from './nfts.js';
import nis from './nis.js';
import parachains from './parachains.js';
import poll from './poll.js';
import ranked from './ranked.js';
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
import treasury from './treasury.js';
import utilities from './utilities.js';
import whitelist from './whitelist.js';

export default function create (t: TFunction): Routes {
  return [
    accounts(t),
    addresses(t),
    explorer(t),
    poll(t),
    transfer(t),
    teleport(t),
    knowledge(t),
    diplomas(t),
    collator(t),
    // governance v2
    referenda(t),
    ranked(t),
    whitelist(t),
    // other governance-related
    treasury(t),
    // others
    parachains(t),
    assets(t),
    nfts(t),
    society(t),
    nis(t),
    gilt(t),
    calendar(t),
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

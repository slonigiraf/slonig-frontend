// Copyright 2017-2023 @polkadot/apps-routing authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Route, TFunction } from './types.js';

import Component, { useCounter } from '@slonigiraf/app-home';

export default function create (t: TFunction): Route {
  return {
    Component,
    display: {},
    group: 'home',
    icon: 'house',
    name: 'home',
    text: t('nav.home', 'Home', { ns: 'apps-routing' }),
    useCounter
  };
}

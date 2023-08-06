// Copyright 2017-2023 @polkadot/apps-routing authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Route, TFunction } from './types.js';

import Component from '@slonigiraf/app-recommendations';

export default function create (t: TFunction): Route {
  return {
    Component,
    display: {
      needsApi: []
    },
    group: 'accounts',
    icon: 'graduation-cap',
    name: 'curriculum',
    text: t('nav.curriculum', 'Curriculum', { ns: 'apps-routing' })
  };
}

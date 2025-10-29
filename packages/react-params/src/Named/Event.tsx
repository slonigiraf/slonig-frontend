// Copyright 2017-2023 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Event } from '@polkadot/types/interfaces';
import type { Codec } from '@polkadot/types/types';

import React, { useMemo } from 'react';
import Params from '@polkadot/react-params';

import { balanceEvents, balanceEventsOverrides } from '../overrides.js';
import { useTranslation } from '../translate.js';

export interface Props {
  children?: React.ReactNode;
  className?: string;
  eventName?: string;
  value: Event;
  withExpander?: boolean;
}

interface Value {
  isValid: boolean;
  value: Codec;
}

function EventDisplay ({ children, className = '', eventName, value, withExpander }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const names = value.data.names;
  const params = value.typeDef.map((type, i) => ({
    name: (names && names[i]) || undefined,
    type
  }));
  const values = value.data.map((value) => ({ isValid: true, value }));

  const overrides = useMemo(
    () => eventName && balanceEvents.includes(eventName)
      ? balanceEventsOverrides
      : undefined,
    [eventName]
  );

  return (
    <div className={`${className} ui--Event`}>
      {children}
      <Params
        isDisabled
        overrides={overrides}
        params={params}
        registry={value.registry}
        values={values}
        withExpander={withExpander}
      >
      </Params>
    </div>
  );
}

export default React.memo(EventDisplay);

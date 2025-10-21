// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BareProps as Props } from '@polkadot/react-components/types';

import React, { useMemo } from 'react';
import GlobalStyle from '@polkadot/react-components/styles';
import { useApi } from '@polkadot/react-hooks';
import WarmUp from './WarmUp.js';
import UI from './UI.js';
import { IpfsProvider, TokenTransferProvider } from '@slonigiraf/app-slonig-components';
import { InfoProvider } from '@slonigiraf/app-slonig-components';
import { LoginProvider } from '@slonigiraf/app-slonig-components';
export const PORTAL_ID = 'portals';

function Apps({ className = '' }: Props): React.ReactElement<Props> {
  const { apiEndpoint, isDevelopment } = useApi();
  const uiHighlight = useMemo(
    () => isDevelopment
      ? undefined
      : apiEndpoint?.ui.color,
    [apiEndpoint, isDevelopment]
  );
  return (
    <InfoProvider>
      <IpfsProvider>
        <GlobalStyle uiHighlight={uiHighlight} />
        <LoginProvider>
          <TokenTransferProvider>
            <UI />
          </TokenTransferProvider>
        </LoginProvider>
        <WarmUp />
      </IpfsProvider>
    </InfoProvider>
  );
}

export default React.memo(Apps);

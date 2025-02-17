// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BareProps as Props } from '@polkadot/react-components/types';
import React from 'react';
import Signer from '@polkadot/react-signer';
import Content from './Content/index.js';
import Menu from './Menu/index.js';
import ConnectingOverlay from './overlays/Connecting.js';
import DotAppsOverlay from './overlays/DotApps.js';
import BottomMenu from './BottomMenu/index.js';
import { AppContainer, BlockchainSyncProvider, useIpfsContext, useLoginContext } from '@slonigiraf/app-slonig-components';
import { Spinner, styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useApi, useTheme } from '@polkadot/react-hooks';
export const PORTAL_ID = 'portals';

function UI({ className = '' }: Props): React.ReactElement<Props> {
  const { isReady } = useLoginContext();
  const { isApiReady, isWaitingInjected } = useApi();
  const { isIpfsReady } = useIpfsContext();
  const connected = isReady && isIpfsReady && isApiReady && !isWaitingInjected
  
  const { t } = useTranslation();
  const { themeClassName } = useTheme();

  return (
    connected ? <StyledDiv className={`${className} apps--Wrapper ${themeClassName}`}>
      <AppContainer>
        <Menu />
        <Signer>
          <BlockchainSyncProvider>
            <Content />
            <BottomMenu />
          </BlockchainSyncProvider>
        </Signer>
        <ConnectingOverlay />
        <DotAppsOverlay />
        <div id={PORTAL_ID} />
      </AppContainer>
    </StyledDiv> :
      <CenterItems>
        <div className='connecting'>
          <Spinner label={t('Loading')} />
        </div>
      </CenterItems>
  );
}
const CenterItems = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  
  .connecting {
    padding: 1rem;
  }
`;
const StyledDiv = styled.div`
  background: var(--bg-page);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding-bottom: 80px;

  ${[
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    20, 21, 22, 23, 24
  ].map((n) => `
    .greyAnim-${n} {
      animation: greyAnim${n} 2s;
    }

    @keyframes greyAnim${n} {
      0% { background: #a6a6a6; }
      50% { background: darkorange; }
      100% { background: #a6a6a6; }
    }
  `).join('')}
`;
export default React.memo(UI);

// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BareProps as Props } from '@polkadot/react-components/types';
import React, { useEffect } from 'react';
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
import { getSetting, SettingKey, storeSetting } from '@slonigiraf/db';
export const PORTAL_ID = 'portals';

interface EconomySettings {
  success: boolean;
  airdrop: string;
  diploma: string;
  warranty: string;
}

function UI({ className = '' }: Props): React.ReactElement<Props> {
  const { isLoginReady } = useLoginContext();
  const { isApiReady, isWaitingInjected } = useApi();
  const { isIpfsReady } = useIpfsContext();
  const connected = isLoginReady && isIpfsReady && isApiReady && !isWaitingInjected

  const { t } = useTranslation();
  const { themeClassName } = useTheme();

  useEffect(() => {
    const fetchData = async () => {
      const economyInitialized = await getSetting(SettingKey.ECONOMY_INITIALIZED);
      if (!economyInitialized) {
        try {
          const response = await fetch('https://economy.slonig.org/prices/');
          if (!response.ok) {
            throw new Error(`Fetching ecomomy error! status: ${response.status}`);
          }
          const economySettings: EconomySettings = await response.json();
          await storeSetting(SettingKey.DIPLOMA_PRICE, economySettings.diploma);
          await storeSetting(SettingKey.DIPLOMA_WARRANTY, economySettings.warranty);
        } catch (error) {
          console.log(error)
        }
      }
    };
    fetchData();
  }, []);

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

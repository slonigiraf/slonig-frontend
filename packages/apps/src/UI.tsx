// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BareProps as Props } from '@polkadot/react-components/types';
import React, { useEffect, useState } from 'react';
import Signer from '@polkadot/react-signer';
import Content from './Content/index.js';
import Menu from './Menu/index.js';
import ConnectingOverlay from './overlays/Connecting.js';
import DotAppsOverlay from './overlays/DotApps.js';
import BottomMenu from './BottomMenu/index.js';
import { AirdropResults, AppContainer, BlockchainSyncProvider, fetchEconomy, useInfo, useIpfsContext, useLoginContext, useSettings } from '@slonigiraf/app-slonig-components';
import { Modal, Spinner, styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useApi, useTheme } from '@polkadot/react-hooks';
import { hasSetting, SettingKey, storeSetting } from '@slonigiraf/db';
import { useLocation } from 'react-router-dom';
import CreateAccount from '@polkadot/app-accounts/modals/CreateAccount';
export const PORTAL_ID = 'portals';

function UI({ className = '' }: Props): React.ReactElement<Props> {
  const { isLoginReady, isLoggedIn, currentPair, setLoginIsRequired, onCreateAccount } = useLoginContext();
  const { isApiReady, isWaitingInjected } = useApi();
  const { isIpfsReady } = useIpfsContext();
  const { isTrueSetting, setSettingToTrue } = useSettings();
  const connected = isLoginReady && isIpfsReady && isApiReady && !isWaitingInjected
  const { showInfo } = useInfo();
  const { t } = useTranslation();
  const { themeClassName } = useTheme();
  const economyNotificationTime = 10;
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const lessonInUrl = queryParams.get('lesson') != null;
  const botInUrl = queryParams.get('bot') != null;

  const isLoginRequired = !isLoggedIn && !botInUrl;

  useEffect(() => {
    if (!isLoggedIn && !botInUrl) {
      setLoginIsRequired(true);
    }
  }, [isLoggedIn, botInUrl, setLoginIsRequired]);

  const showError = (error: string) => {
    showInfo(`${t('Please notify tech support.')} ${t('Error')}: ${error}.`, 'error', economyNotificationTime);
  }

  const showNoConnectionToEconomyServerError = () => {
    showError('NO_CONNECTION_TO_THE_ECONOMY_SERVER');
  }

  useEffect(() => {
    const fetchData = async () => {
      const economyInitialized = await hasSetting(SettingKey.ECONOMY_INITIALIZED);
      if (!economyInitialized) {
        try {
          await fetchEconomy();
        } catch (error) {
          showNoConnectionToEconomyServerError();
        }
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const askForAirdrop = async () => {
      const airdropReceived = await hasSetting(SettingKey.RECEIVED_AIRDROP);
      if (!airdropReceived) {
        if (lessonInUrl) {
          await storeSetting(SettingKey.AIRDROP_COMPATIBLE, 'true');
        }
        const airdropCompatible = await hasSetting(SettingKey.AIRDROP_COMPATIBLE);
        if (airdropCompatible && !airdropReceived && currentPair) {
          try {
            const response = await fetch(`https://economy.slonig.org/airdrop/?to=${currentPair.address}&auth=${process.env.AIRDROP_AUTH_TOKEN}`);
            const airdropResults: AirdropResults = await response.json();
            if (airdropResults.success && airdropResults.amount) {
              await storeSetting(SettingKey.RECEIVED_AIRDROP, airdropResults.amount);
            } else if (airdropResults.error) {
              showError(airdropResults.error);
            }
          } catch (error) {
            showNoConnectionToEconomyServerError();
          }
        }
      }
    };
    isLoggedIn && askForAirdrop();
  }, [isLoggedIn, currentPair]);

  //---
  useEffect(() => {
    lessonInUrl && setSettingToTrue(SettingKey.AIRDROP_COMPATIBLE);
  }, [lessonInUrl, setSettingToTrue]);
  //---

  return (
    connected ? <StyledDiv isloginRequired={isLoginRequired} className={`${className} apps--Wrapper ${themeClassName}`}>
      <AppContainer>
        {/* <HelpChatWidget caption={t('Have questions?')}/> */}
        
        {isLoginRequired ?
          <CreateAccount
            onClose={() => { }}
            onStatusChange={onCreateAccount}
            hasCloseButton={false}
          /> :
          <Signer>
            <Menu />
            <BlockchainSyncProvider>
              <Content />
              {!botInUrl && <BottomMenu />}
            </BlockchainSyncProvider>
          </Signer>
        }
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
const StyledDiv = styled.div<{ isloginRequired: boolean }>`
  background: var(--bg-page);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  
  ${(props) => !props.isloginRequired && 'padding-bottom: 80px;'}

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

const GiftDiv = styled.div`
  position: relative;
  display: inline-block;
`;

const StyledModal = styled(Modal)`
  button[data-testid='close-modal'] {
    opacity: 0;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  button[data-testid='close-modal']:focus {
    outline: none;
  }
  .ui--Modal-Content {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
  }
`;
const StyledLabel = styled.span`
  position: absolute;
  top: 62%; 
  left: 50%;
  text-align: center;
  transform: translate(-50%, -50%);
  z-index: 1;
  background-color: var(--bg-page);
  color: darkorange;
  font-weight: bold;
  font-size: 1.5rem;
  padding: 0.25rem 0.5rem;
`;
export default React.memo(UI);

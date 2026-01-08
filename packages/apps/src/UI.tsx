// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BareProps as Props } from '@polkadot/react-components/types';
import React, { useEffect, useState } from 'react';
import Signer from '@polkadot/react-signer';
import Content from './Content/index.js';
import Menu from './Menu/index.js';
import ConnectingOverlay from './overlays/Connecting.js';
import BottomMenu from './BottomMenu/index.js';
import { AirdropResults, AppContainer, BlockchainSyncProvider, fetchEconomy, useBooleanSettingValue, useInfo, useIpfsContext, useLog, useLoginContext, useSettingValue } from '@slonigiraf/slonig-components';
import { Spinner, styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useApi, useTheme } from '@polkadot/react-hooks';
import { setSettingToTrue, SettingKey, storeSetting } from '@slonigiraf/db';
import { useLocation } from 'react-router-dom';
import CreateAccount from '@polkadot/app-accounts/modals/CreateAccount';
import detectIncognito from 'detectincognitojs';
import IncognitoView from './IncognitoView.js';
export const PORTAL_ID = 'portals';

function UI({ className = '' }: Props): React.ReactElement<Props> {
  const { isLoginReady, isLoggedIn, currentPair, setLoginIsRequired, onCreateAccount } = useLoginContext();
  const { isApiReady, isWaitingInjected } = useApi();
  const { isIpfsReady } = useIpfsContext();
  const connected = isLoginReady && isIpfsReady && isApiReady && !isWaitingInjected
  const { showInfo } = useInfo();
  const { t, i18n } = useTranslation();
  const { logEvent, logEconomy } = useLog();
  const { themeClassName } = useTheme();
  const economyNotificationTime = 10;
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const lessonInUrl = queryParams.get('lesson') != null;
  const botInUrl = queryParams.get('bot') != null;
  const [isProcessingAirdrop, setIsProcessingAirdrop] = useState(false);

  const isLoginRequired = !isLoggedIn && !botInUrl;
  const isEconomyInitialized = useBooleanSettingValue(SettingKey.ECONOMY_INITIALIZED);
  const isAirdropCompatible = useBooleanSettingValue(SettingKey.AIRDROP_COMPATIBLE);
  const recievedAirdropAmount = useSettingValue(SettingKey.RECEIVED_AIRDROP);
  const expectedAirdropAmount = useSettingValue(SettingKey.EXPECTED_AIRDROP);
  const [isIncognito, setIsIncognito] = useState<boolean | null>(null);

  useEffect(() => {
    isIncognito && logEvent('INFO', 'INCOGNITO');
  }, [logEvent, isIncognito]);

  useEffect(() => {
    // SSR/Node safety
    if (typeof window === 'undefined') return;

    // Don't log on localhost (dev)
    const host = window.location.hostname;
    const isLocalhost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      // covers 127.x.x.x
      /^127(?:\.\d{1,3}){3}$/.test(host);

    if (isLocalhost) return;

    const lang = (i18n.resolvedLanguage || i18n.language || 'en')
      .slice(0, 2)
      .toLowerCase();

    logEvent('INFO', 'LANGUAGE', lang);
  }, [logEvent, i18n.resolvedLanguage, i18n.language]);

  useEffect(() => {
    if (!isLoggedIn && !botInUrl) {
      setLoginIsRequired(true);
    }
  }, [isLoggedIn, botInUrl, setLoginIsRequired]);

  useEffect(() => {
    let mounted = true;

    detectIncognito()
      .then((result) => {
        if (mounted) {
          setIsIncognito(result.isPrivate);
        }
      })
      .catch(() => {
        if (mounted) {
          setIsIncognito(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const showError = (error: string) => {
    showInfo(`${t('Please notify tech support.')} ${t('Error')}: ${error}.`, 'error', economyNotificationTime);
  }

  const showNoConnectionToEconomyServerError = () => {
    showError('NO_CONNECTION_TO_THE_ECONOMY_SERVER');
  }

  useEffect(() => {
    const fetchData = async () => {
      if (isEconomyInitialized === false) {
        try {
          const storedEconomy = await fetchEconomy();
          logEconomy(storedEconomy);
        } catch (error) {
          showNoConnectionToEconomyServerError();
        }
      }
    };
    fetchData();
  }, [isEconomyInitialized]);

  useEffect(() => {
    if (isAirdropCompatible === undefined || isAirdropCompatible === false) {
      logEvent('SETTINGS', 'AIRDROP_COMPATIBLE', 'true');
      setSettingToTrue(SettingKey.AIRDROP_COMPATIBLE)
    }
  }, [isAirdropCompatible, setSettingToTrue]);

  useEffect(() => {
    const run = async () => {
      if (currentPair) {
        try {
          const response = await fetch(`https://economy.slonig.org/airdrop/?to=${currentPair.address}&auth=${process.env.AIRDROP_AUTH_TOKEN}`);
          const airdropResults: AirdropResults = await response.json();
          if (airdropResults.success && airdropResults.amount) {
            await storeSetting(SettingKey.RECEIVED_AIRDROP, airdropResults.amount);
          } else if (airdropResults.error) {
            if (airdropResults.error === 'DUPLICATED_AIRDROP') {
              if (expectedAirdropAmount === undefined) {
                const storedEconomy = await fetchEconomy();
                logEconomy(storedEconomy);
              }
              const expectedAirdrop = expectedAirdropAmount || 'undefined';
              await storeSetting(SettingKey.RECEIVED_AIRDROP, expectedAirdrop);
            } else {
              showError(airdropResults.error);
            }
          }
        } catch (error) {
          showNoConnectionToEconomyServerError();
        }
      }
    }
    if (isAirdropCompatible === true && recievedAirdropAmount === undefined && currentPair && !isProcessingAirdrop) {
      setIsProcessingAirdrop(true);
      run();
    }
  }, [isAirdropCompatible, expectedAirdropAmount, recievedAirdropAmount, currentPair, showError, showNoConnectionToEconomyServerError, setIsProcessingAirdrop]);

  return (
    connected ? <StyledDiv isloginRequired={isLoginRequired} className={`${className} apps--Wrapper ${themeClassName}`}>
      <AppContainer>
        {/* <HelpChatWidget caption={t('Have questions?')}/> */}

        {isIncognito ? (
          <IncognitoView />
        ) : isLoginRequired ? (
          <CreateAccount
            onClose={() => { }}
            onStatusChange={onCreateAccount}
            hasCloseButton={false}
          />
        ) : (
          <Signer>
            <Menu />
            <BlockchainSyncProvider>
              <Content />
              {!botInUrl && <BottomMenu />}
            </BlockchainSyncProvider>
          </Signer>
        )}

        <ConnectingOverlay />
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

export default React.memo(UI);

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
import { AirdropResults, AppContainer, balanceToSlonString, BlockchainSyncProvider, Economy, fetchEconomy, useInfo, useIpfsContext, useLoginContext } from '@slonigiraf/app-slonig-components';
import { Button, Icon, Modal, Spinner, styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useApi, useTheme, useToggle } from '@polkadot/react-hooks';
import { hasSetting, SettingKey, storeSetting } from '@slonigiraf/db';
import BN from 'bn.js';
import { useLocation } from 'react-router-dom';
export const PORTAL_ID = 'portals';

function UI({ className = '' }: Props): React.ReactElement<Props> {
  const { isLoginReady, isLoggedIn, currentPair } = useLoginContext();
  const { isApiReady, isWaitingInjected } = useApi();
  const { isIpfsReady } = useIpfsContext();
  const connected = isLoginReady && isIpfsReady && isApiReady && !isWaitingInjected
  const { showInfo } = useInfo();
  const { t } = useTranslation();
  const { themeClassName } = useTheme();
  const economyNotificationTime = 10;
  const [isModalVisible, toggleModalVisible] = useToggle();
  const [airdropAmount, setAirdropAmount] = useState('0');
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const lessonInUrl = queryParams.get('lesson') != null;

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
              setAirdropAmount(balanceToSlonString(new BN(airdropResults.amount)));
              toggleModalVisible();
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

  return (
    connected ? <StyledDiv className={`${className} apps--Wrapper ${themeClassName}`}>
      <AppContainer>
        <Menu />
        <Signer>
          <BlockchainSyncProvider>
            <Content />
            <BottomMenu />
            {isModalVisible && <StyledModal
              className={className}
              onClose={toggleModalVisible}
              header={t('Congratulations!')}
              size='tiny'
            >
              <Modal.Content>
                <GiftDiv>
                  <Icon color='orange' icon='gift' size="8x" />
                  <StyledLabel>{airdropAmount} Slon</StyledLabel>
                </GiftDiv>
                <p>{t('You have received Slon coins for free. It’s a one-time use, so use it wisely.')}</p>
              </Modal.Content>
              <Modal.Actions>
                <Button
                  label={t('OK')}
                  onClick={toggleModalVisible}
                />
              </Modal.Actions>
            </StyledModal>}
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

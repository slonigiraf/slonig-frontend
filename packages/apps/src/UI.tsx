// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BareProps as Props } from '@polkadot/react-components/types';
import React, { useCallback, useEffect, useState } from 'react';
import Signer from '@polkadot/react-signer';
import Content from './Content/index.js';
import Menu from './Menu/index.js';
import ConnectingOverlay from './overlays/Connecting.js';
import BottomMenu from './BottomMenu/index.js';
import { AirdropResults, AppContainer, bnToSlonFloatOrNaN, BlockchainSyncProvider, fetchEconomy, useBooleanSettingValue, stringToNumber, useInfo, useIpfsContext, useLog, useLoginContext, useSettingValue, useNumberSettingValue, useRestorePhase } from '@slonigiraf/slonig-components';
import { Spinner, styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useApi, useTheme } from '@polkadot/react-hooks';
import { getSetting, setSettingToTrue, SettingKey, storeSetting } from '@slonigiraf/db';
import { useLocation } from 'react-router-dom';
import CreateAccount from '@polkadot/app-accounts/modals/CreateAccount';
import detectIncognito from 'detectincognitojs';
import IncognitoView from './IncognitoView.js';
export const PORTAL_ID = 'portals';
import BN from 'bn.js';
import ClassOnboarding from './ClassOnboarding.js';
import BackupReminder from './BackupReminder.js';
import { BACKUP_REQUIREMENT_PERIOD_MS } from '@slonigiraf/utils';
import { useAppVersionReload } from './useAppVersionReload.js';
import AskToReload from './AskToReload.js';

function UI({ className = '' }: Props): React.ReactElement<Props> {
  const { isLoginReady, isLoggedIn, currentPair, setLoginIsRequired, onCreateAccount } = useLoginContext();
  const { isApiConnected, isApiReady, isWaitingInjected } = useApi();
  const { isIpfsReady } = useIpfsContext();
  const connected = isLoginReady && isIpfsReady && isApiReady && isApiConnected && !isWaitingInjected;
  // Transient readiness changes must not unmount the Book processing adapters.
  // The standalone BookProcessingManager owns the run, but these mounted views
  // still provide the current per-stage handlers and progress snapshots.
  const [hasConnectedOnce, setHasConnectedOnce] = useState(connected);

  useEffect(() => {
    if (connected) setHasConnectedOnce(true);
  }, [connected]);
  const { showInfo } = useInfo();
  const { t, i18n } = useTranslation();
  const { logEvent, logEconomy } = useLog();
  const { themeClassName } = useTheme();
  const economyNotificationTime = 10;
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const botInUrl = queryParams.get('bot') != null;
  const [isProcessingAirdrop, setIsProcessingAirdrop] = useState(false);
  const [backupReminderDismissed, setBackupReminderDismissed] = useState(false);
  // Restored keys can activate login before the database commit. Wait until
  // restore is finished, then read the saved backup timestamp again. Tie the
  // check to the restore phase so a previous async read can never briefly
  // authorize the reminder on the first post-restore render.
  const restorePhase = useRestorePhase();
  const isRestoringBackup = restorePhase === 'validating' || restorePhase === 'staging' || restorePhase === 'committing';
  const [loginBackupCheck, setLoginBackupCheck] = useState<{ address: string; timestamp: number; restorePhase: typeof restorePhase } | null>(null);
  const loginAddress = isLoggedIn ? currentPair?.address : undefined;
  useEffect(() => {
    if (!loginAddress || isRestoringBackup) {
      setLoginBackupCheck(null);
      return;
    }
    let active = true;
    setLoginBackupCheck(null);
    void getSetting(SettingKey.LAST_BACKUP_TIME).then((value) => {
      if (active) setLoginBackupCheck({ address: loginAddress, timestamp: stringToNumber(value) ?? 0, restorePhase });
    }).catch((error) => console.error('Could not check backup timestamp:', error));
    return () => { active = false; };
  }, [loginAddress, restorePhase, isRestoringBackup]);

  const isLoginRequired = !isLoggedIn && !botInUrl;
  const isEconomyInitialized = useBooleanSettingValue(SettingKey.ECONOMY_INITIALIZED);
  const isAirdropCompatible = useBooleanSettingValue(SettingKey.AIRDROP_COMPATIBLE);
  const recievedAirdropAmount = useSettingValue(SettingKey.RECEIVED_AIRDROP);
  const expectedAirdropAmount = useSettingValue(SettingKey.EXPECTED_AIRDROP);
  const nowIsClassOnboarding = useBooleanSettingValue(SettingKey.NOW_IS_CLASS_ONBOARDING);
  const lessonId = useSettingValue(SettingKey.LESSON);
  const lastBackup = useNumberSettingValue(SettingKey.LAST_BACKUP_TIME);
  const now = (new Date()).getTime();
  // Never use an earlier timestamp check during a restore transition.
  // The post-commit read is authoritative; live updates still track downloads.
  const lastBackupMs = !isRestoringBackup && loginBackupCheck !== null &&
    loginBackupCheck.address === loginAddress && loginBackupCheck.restorePhase === restorePhase
    ? Math.max(loginBackupCheck.timestamp, lastBackup ?? 0)
    : null;
  const shouldBackup = lastBackupMs !== null && (now - lastBackupMs) > BACKUP_REQUIREMENT_PERIOD_MS;
  const [isIncognito, setIsIncognito] = useState<boolean | null>(null);

  const { currentVersion, updateAvailable, reloadNow } = useAppVersionReload({
    url: '/version.json',
    intervalMs: 60_000
  });

  useEffect(() => {
    currentVersion && logEvent('INFO', 'VERSION', currentVersion)
  }, [logEvent, currentVersion]);

  useEffect(() => {
    isIncognito && logEvent('INFO', 'INCOGNITO');
  }, [logEvent, isIncognito]);

  useEffect(() => {
    if (currentVersion) {
      const lang = (i18n.resolvedLanguage || i18n.language || 'en')
        .slice(0, 2)
        .toLowerCase();

      logEvent('INFO', 'LANGUAGE', lang);
    }
  }, [currentVersion, logEvent, i18n.resolvedLanguage, i18n.language]);

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

  // TODO: uncomment at March 31, 2026
  // useEffect(() => {
  //   const fetchData = async () => {
  //     if (isEconomyInitialized === false) {
  //       try {
  //         const storedEconomy = await fetchEconomy();
  //         logEconomy(storedEconomy);
  //       } catch (error) {
  //         showNoConnectionToEconomyServerError();
  //       }
  //     }
  //   };
  //   fetchData();
  // }, [isEconomyInitialized]);


  // TODO: remove at March 31, 2026
  useEffect(() => {
    const fetchData = async () => {
      try {
        await fetchEconomy(logEconomy);
      } catch (error) {
        showNoConnectionToEconomyServerError();
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (isAirdropCompatible === undefined || isAirdropCompatible === false) {
      logEvent('SETTINGS', 'AIRDROP_COMPATIBLE');
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
            logEvent('SETTINGS', 'RECEIVED_AIRDROP', 'received_airdrop_slon', bnToSlonFloatOrNaN(new BN(airdropResults.amount)));
            await storeSetting(SettingKey.RECEIVED_AIRDROP, airdropResults.amount);
          } else if (airdropResults.error) {
            if (airdropResults.error === 'DUPLICATED_AIRDROP') {
              if (expectedAirdropAmount === undefined) {
                await fetchEconomy(logEconomy);
              }
            } else {
              showError(airdropResults.error);
            }
          }
        } catch (error) {
          showNoConnectionToEconomyServerError();
        }
      }
    }
    const notEnough = recievedAirdropAmount !== null && recievedAirdropAmount !== undefined && expectedAirdropAmount !== null && expectedAirdropAmount !== undefined && (new BN(recievedAirdropAmount)).lt(new BN(expectedAirdropAmount));
    if (isAirdropCompatible === true &&
      (recievedAirdropAmount === undefined || notEnough) &&
      currentPair && !isProcessingAirdrop) {
      setIsProcessingAirdrop(true);
      run();
    }
  }, [isAirdropCompatible, expectedAirdropAmount, recievedAirdropAmount, currentPair, showError, showNoConnectionToEconomyServerError, setIsProcessingAirdrop]);


  // BackupService persists the timestamp after a native save or after a browser
  // download starts. Dismissing the reminder does not change it.
  const onBackup = useCallback(() => setBackupReminderDismissed(true), []);

  const showOnboarding = nowIsClassOnboarding && lessonId === undefined;


  return (
    <>
    {hasConnectedOnce && <StyledDiv isloginRequired={isLoginRequired} className={`${className} apps--Wrapper ${themeClassName}`}>
      <AppContainer>
        {/* <HelpChatWidget caption={t('Have questions?')}/> */}

        {isIncognito && !botInUrl ? (
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
              {showOnboarding && <ClassOnboarding />}
              {!botInUrl && shouldBackup && !backupReminderDismissed && <BackupReminder onResult={onBackup} onDismiss={() => setBackupReminderDismissed(true)} />}
              {!botInUrl && updateAvailable && <AskToReload reload={reloadNow} />}
              <>
                <Content />
                {!botInUrl && <BottomMenu />}
              </>
            </BlockchainSyncProvider>
          </Signer>
        )}

        <ConnectingOverlay />
        <div id={PORTAL_ID} />
      </AppContainer>
    </StyledDiv>}
    {!connected && <CenterItems $overlay={hasConnectedOnce} role='status'>
      <div className='connecting'>
        <Spinner label={hasConnectedOnce && !isApiConnected ? t('Reconnecting to blockchain') : t('Loading')} />
      </div>
    </CenterItems>}
    </>
  );
}
const CenterItems = styled.div<{ $overlay?: boolean }>`
  width: 100%;
  height: 100vh;
  ${({ $overlay }) => $overlay && `
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(15, 15, 15, 0.35);
    pointer-events: all;
  `}
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

// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BareProps as Props } from '@polkadot/react-components/types';

import React, { useMemo } from 'react';
import GlobalStyle from '@polkadot/react-components/styles';
import { useApi } from '@polkadot/react-hooks';
import WarmUp from './WarmUp.js';
import UI from './UI.js';
import { IpfsProvider, TokenTransferProvider, InfoProvider, LoginProvider, LogProvider } from '@slonigiraf/slonig-components';
import { useAppVersionReload } from './useAppVersionReload.js';
export const PORTAL_ID = 'portals';

function Apps({ className = '' }: Props): React.ReactElement<Props> {
  const { apiEndpoint, isDevelopment } = useApi();
  const uiHighlight = useMemo(
    () => isDevelopment
      ? undefined
      : apiEndpoint?.ui.color,
    [apiEndpoint, isDevelopment]
  );
  
  const { updateAvailable, reloadNow } = useAppVersionReload({
    url: '/version.json',
    intervalMs: 10_000,
    initialDelayMs: 10_000
  });
  
  return (
    <LogProvider>
      <InfoProvider>
        <IpfsProvider>
          <GlobalStyle uiHighlight={uiHighlight} />
          {/* Simple "update available" banner */}
          {updateAvailable && (
            <div
              style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 99999,
                padding: '10px 12px',
                background: 'rgba(0,0,0,0.85)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}
              role="status"
              aria-live="polite"
            >
              <span style={{ fontFamily: 'sans-serif', fontSize: 14 }}>
                A new version of Slonig is available.
              </span>

              <button
                onClick={reloadNow}
                style={{
                  border: '1px solid rgba(255,255,255,0.4)',
                  background: 'transparent',
                  color: 'white',
                  padding: '6px 10px',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Reload
              </button>
            </div>
          )}
          <LoginProvider>
            <TokenTransferProvider>
              <UI />
            </TokenTransferProvider>
          </LoginProvider>
          <WarmUp />
        </IpfsProvider>
      </InfoProvider>
    </LogProvider>
  );
}

export default React.memo(Apps);

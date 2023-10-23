// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';
import React from 'react';
import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';
import { Button, Modal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { QrScanner } from '@slonigiraf/app-slonig-components';
export { useCounter };

function SettingsApp (): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [isQrOpen, toggleQr] = useToggle();

  return (
    <main className='settings--App'>
      <div className='ui--row'>
      <Button
            icon='qrcode'
            label={t('Scan Qr')}
            onClick={toggleQr}
          />
      </div>
      {isQrOpen && <div className='ui--row'>
        <Modal
          header={t('Scan a QR code')}
          onClose={toggleQr}
          size='small'
        >
          <Modal.Content>
            <QrScanner
              onResult={(result, error) => {
                if (result != undefined) {
                  // storeLetter(result?.getText())
                }
                if (!error) {
                  console.info(error)
                }
              }}
              constraints={{facingMode: 'environment'}}
            />
          </Modal.Content>
        </Modal>
      </div>}
      

    </main>
  );
}

export default React.memo(SettingsApp);

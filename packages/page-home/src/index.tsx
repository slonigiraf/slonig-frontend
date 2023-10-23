// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';
import React from 'react';
import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';
import { Button } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';

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
      

    </main>
  );
}

export default React.memo(SettingsApp);

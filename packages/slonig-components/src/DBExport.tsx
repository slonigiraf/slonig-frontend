// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Button, Modal } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import QRCode from 'qrcode.react';
import { qrCodeSize } from '../constants.js';
import { exportDB } from '@slonigiraf/db';

interface Props {
  className?: string;
}

function DBExport({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [isRrocessing, setIsProcessing] = useState(false);
  const downloadDbJson = useCallback(
    async () => {
      try {
        setIsProcessing(true);
        const blob = await exportDB();
      } catch (error) {
        console.log(error);
      }
      setIsProcessing(false);
    },
    []
  );

  return (<Button
    icon='download'
    label={''}
    onClick={downloadDbJson}
    isDisabled={isRrocessing}
  />)
}

export default React.memo(DBExport);
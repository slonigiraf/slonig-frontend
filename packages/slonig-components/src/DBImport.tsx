// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Button, InputFile, Modal } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { QRScanner } from '@slonigiraf/app-slonig-components';
import { getIPFSDataFromContentID } from '@slonigiraf/app-slonig-components';
import { syncDB } from '@slonigiraf/db';

interface Props {
  className?: string;
}
const acceptedFormats = ['application/json', 'text/plain'];
function DBImport({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  const _onChangeFile = useCallback(
    (file: Uint8Array) => {
      // processFile
      // syncDB(content, dataArray[1]);
    },
    []
  );

  return (<InputFile
    accept={acceptedFormats}
    className='full'
    isError={true}
    label={t('Restore')}
    onChange={_onChangeFile}
    withLabel
  />)
}

export default React.memo(DBImport);
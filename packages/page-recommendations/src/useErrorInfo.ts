// Copyright 2017-2023 @polkadot/app-recomendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { createNamedHook } from '@polkadot/react-hooks';
import { useInfo } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { ErrorType } from '@polkadot/react-params';


function useErrorInfoImpl() {
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const navigate = useNavigate();
  return (e: Error) => {
    showInfo(
      e.message === ErrorType.PEER_INITIALIZATION_ERROR ?
        t('No internet connection. Check your connection and try again.') :
        t('Ask the sender to refresh the QR page and keep it open while sending data.'),
      'error'
    );
    navigate('', { replace: true });
  };
}

export default createNamedHook('useErrorInfo', useErrorInfoImpl);

// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect } from 'react';
import { useTokenTransfer } from '@slonigiraf/app-slonig-components';
import { useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { encodeAddress } from '@polkadot/keyring';
import { hexToU8a } from '@polkadot/util';
import { storePseudonym } from '@slonigiraf/db';

function TransferParser(): React.ReactElement {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const recipientHex = queryParams.get("recipientHex");
  const recipientNameFromUrl = queryParams.get("name");
  const navigate = useNavigate();
  const { openTransfer } = useTokenTransfer();

  useEffect((): void => {
    const processParameters = async () => {
      if (recipientHex && recipientNameFromUrl) {
        await storePseudonym(recipientHex, recipientNameFromUrl);
        const recipientId = encodeAddress(hexToU8a(recipientHex));
        openTransfer({ recipientId });
        navigate('', { replace: true });
      }
    }
    processParameters();
  }, [recipientHex, recipientNameFromUrl, storePseudonym,
    encodeAddress, hexToU8a, openTransfer, navigate]);

  return <></>;
}

export default React.memo(TransferParser);

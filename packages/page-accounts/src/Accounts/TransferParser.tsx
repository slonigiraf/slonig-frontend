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
  const { setIsTransferOpen, setRecipientId } = useTokenTransfer();
  
  useEffect((): void => {
    const processParameters = async () => {
      if (recipientHex && recipientNameFromUrl) {
        await storePseudonym(recipientHex, recipientNameFromUrl);
        const recipientAddress = encodeAddress(hexToU8a(recipientHex));
        setRecipientId(recipientAddress);
        setIsTransferOpen(true);
        navigate('', { replace: true });
      }
    }
    processParameters();
  }, [recipientHex, recipientNameFromUrl, storePseudonym, 
    encodeAddress, hexToU8a, setRecipientId, setIsTransferOpen, navigate]);

  return <></>;
}

export default React.memo(TransferParser);

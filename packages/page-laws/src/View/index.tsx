// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import QRCode from 'qrcode.react';
import { getIPFSContentID, getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { BN_ZERO } from '@polkadot/util';
import type { Signer } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useState } from 'react';
import { web3FromSource } from '@polkadot/extension-dapp';
import { Button, Input, InputAddress, InputBalance, Output, Modal, TxButton } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isFunction, u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import Unlock from '@polkadot/app-signing/Unlock';
import { IPFS } from 'ipfs-core';
import { qrCodeSize } from '../constants.js';
import { statics } from '@polkadot/react-api/statics';
import { useApi } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  ipfs: IPFS;
}

interface AccountState {
  isExternal: boolean;
  isHardware: boolean;
  isInjected: boolean;
}

interface SignerState {
  isUsable: boolean;
  signer: Signer | null;
}

function View({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const [text, setText] = useState<string>("");
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [signature, setSignature] = useState('');
  const [isUnlockVisible, toggleUnlock] = useToggle();
  const [amount, setAmount] = useState<BN>(BN_ZERO);
  const [blockNumber, setBlockNumber] = useState<BN>(BN_ZERO);
  const [workerPublicKeyHex, setWorkerPublicKeyHex] = useState<string>("");
  const [textHexId, setTextHexId] = useState('0xf55ff16f66f43360266b95db6f8fec01d76031054306ae4a4b380598f6cfd114')
  const { api } = useApi();
  

  useEffect((): void => {
    const meta = (currentPair && currentPair.meta) || {};
    const isExternal = (meta.isExternal as boolean) || false;
    const isHardware = (meta.isHardware as boolean) || false;
    const isInjected = (meta.isInjected as boolean) || false;
    const isUsable = !(isExternal || isHardware || isInjected);

    setAccountState({ isExternal, isHardware, isInjected });
    setIsLocked(
      isInjected
        ? false
        : (currentPair && currentPair.isLocked) || false
    );
    setSignature('');
    setSigner({ isUsable, signer: null });

    // for injected, retrieve the signer
    if (meta.source && isInjected) {
      web3FromSource(meta.source as string)
        .catch((): null => null)
        .then((injected) => setSigner({
          isUsable: isFunction(injected?.signer?.signRaw),
          signer: injected?.signer || null
        }))
        .catch(console.error);
    }
  }, [currentPair]);

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const _onChangeData = useCallback(
    (data: string) => setText(data),
    []
  );


  const _onUnlock = useCallback(
    (): void => {
      setIsLocked(false);
      toggleUnlock();
    },
    [toggleUnlock]
  );

  const _onSuccess = (_result: any) => {
    // TODO use
  }
  const _onFailed = (_result: any) => {
  }

  

  return (
    <div className={`toolbox--Sign ${className}`}>
      <h1>{t('View')}</h1>
      <div className='ui--row'>
        <Input
          autoFocus
          className='full'
          help={t('Text')}
          label={t('text')}
          onChange={_onChangeData}
          value={text}
        />
      </div>
      <div className='toolbox--Sign-input'>
        <div className='ui--row'>
          <Output
            className='full'
            help={t('create a diploma help text')}
            isHidden={signature.length === 0}
            isMonospace
            label={t('create a diploma')}
            value={signature}
            withCopy
          />
        </div>
      </div>
      <Button.Group>  
        {ipfs == null ? <div>{t('Connecting to IPFS...')}</div> : ""}
      </Button.Group>
    </div>
  );
}

export default React.memo(View);

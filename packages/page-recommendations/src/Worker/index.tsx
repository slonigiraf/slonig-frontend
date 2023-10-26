// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import { QrScanner } from '@slonigiraf/app-slonig-components';
import LettersList from './LettersList';
import { IPFS } from 'ipfs-core';
import { Button, InputAddress, Modal, Toggle } from '@polkadot/react-components';
import { useTranslation } from '../translate';
import { storeLetter } from '../utils';
import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import { u8aToHex } from '@polkadot/util';
import { useToggle } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function Worker({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const [modalIsOpen, setModalIsOpen] = useState(false)
  const { t } = useTranslation();

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const storeData = (data: string) => {
    let dataArray = data.split(",")
    if (dataArray.length === 9) {
      storeToDB(dataArray);
      setModalIsOpen(false)
    }
  }
  const storeToDB = async (data: string[]) => {
    const [textHash,
      genesisHex,
      letterId,
      blockNumber,
      refereePublicKeyHex,
      workerPublicKeyHex,
      amount,
      refereeSignOverPrivateData,
      refereeSignOverReceipt] = data;

    const letter = {
      created: new Date(),
      cid: textHash,
      genesis: genesisHex,
      letterNumber: parseInt(letterId, 10),
      block: blockNumber,
      referee: refereePublicKeyHex,
      worker: workerPublicKeyHex,
      amount: amount,
      signOverPrivateData: refereeSignOverPrivateData,
      signOverReceipt: refereeSignOverReceipt
    };
    await storeLetter(letter);
  }

  return (
    <div className={`toolbox--Worker ${className}`}>
      <h1>{t('My diplomas')}</h1>
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          help={t('select the account you wish to sign data with')}
          isInput={false}
          label={t('account')}
          type='account'
          onChange={_onChangeAccount}
        />
      </div>
      <div className='ui--row'>
        <Button
          icon='plus'
          label={t('Add a letter about me')}
          onClick={() => setModalIsOpen(true)}
        />
      </div>
      <div className='ui--row'>
        <LettersList ipfs={ipfs} worker={u8aToHex(currentPair?.publicKey)} />
      </div>
      {modalIsOpen && <div className='ui--row'>
        <Modal
          header={t('Scan a letter QR code')}
          onClose={() => setModalIsOpen(false)}
          size='small'
        >
          <Modal.Content>
            <QrScanner
              onResult={(result, error) => {
                if (result != undefined) {
                  storeData(result?.getText());
                }
              }}
              constraints={{ facingMode: 'environment' }}
            />
          </Modal.Content>
        </Modal>
      </div>}
    </div>
  )
}

export default React.memo(Worker);
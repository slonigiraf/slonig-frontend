// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import QrScanner from '../QrScanner'
import LettersList from './LettersList';
import { IPFS } from 'ipfs-core';
import { Button, InputAddress, Modal } from '@polkadot/react-components';
import { useTranslation } from '../translate';
import { storeLetter } from '../utils';
import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import { u8aToHex } from '@polkadot/util';
import DBExport from './DBExport';
import DBImport from './DBImport';

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
      paraId,
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
      paraId: parseInt(paraId, 10),
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
      <h1>{t<string>('My recommendation letters')}</h1>
      <div className='ui--row'>
        <InputAddress
          className='full'
          help={t<string>('select the account you wish to sign data with')}
          isInput={false}
          label={t<string>('account')}
          type='account'
          onChange={_onChangeAccount}
        />
      </div>
      <div className='ui--row'>
        <Button
          icon='plus'
          label={t<string>('Add a letter about me')}
          onClick={() => setModalIsOpen(true)}
        />
        <DBExport ipfs={ipfs} />
        <DBImport ipfs={ipfs} />
      </div>
      <div className='ui--row'>
        <LettersList ipfs={ipfs} worker={u8aToHex(currentPair?.publicKey)} />
      </div>
      {modalIsOpen && <div className='ui--row'>
        <Modal
          header={t<string>('Scan a letter QR code')}
          onClose={() => setModalIsOpen(false)}
          size='small'
        >
          <Modal.Content>
            <QrScanner
              onResult={(result, error) => {
                if (result != undefined) {
                  storeData(result?.getText());
                }
                if (!error) {
                  console.info(error);
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
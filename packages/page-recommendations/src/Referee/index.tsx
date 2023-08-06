// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import QRCode from 'qrcode.react';
import { getIPFSContentID, getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import { BN_ZERO } from '@polkadot/util';
import type { Signer } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useState } from 'react';
import { web3FromSource } from '@polkadot/extension-dapp';
import { Button, Input, InputAddress, InputBalance, Output, Modal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isFunction, u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { useTranslation } from '../translate';
import Unlock from '@polkadot/app-signing/Unlock';
import { IPFS } from 'ipfs-core';
import { qrCodeSize } from '../constants';
import { getLastUnusedLetterNumber, setLastUsedLetterNumber, storeLetter } from '../utils';

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

function Referee({ className = '', ipfs }: Props): React.ReactElement<Props> {
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
  const [letterInfo, setLetterInfo] = useState('')
  const [modalIsOpen, setModalIsOpen] = useState(false)

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

  const _onChangeWorker = useCallback(
    (workerPublicKeyHex: string) => setWorkerPublicKeyHex(workerPublicKeyHex),
    []
  );

  const _onChangeBlockNumber = useCallback(
    (value: string) => setBlockNumber(new BN(value)),
    []
  );

  const _onSign = useCallback(
    async () => {
      if (isLocked || !isUsable || !currentPair) {
        return;
      }
      // generate a data to sign
      const textCID = await getIPFSContentID(ipfs, text);
      const textHash = textCID.toString();
      const referee = currentPair;
      const refereeU8 = referee.publicKey;
      const refereePublicKeyHex = u8aToHex(refereeU8);
      const letterId = await getLastUnusedLetterNumber(refereePublicKeyHex);
      const workerPublicKeyU8 = hexToU8a(workerPublicKeyHex);
      const paraId = 1;
      const privateData = getPrivateDataToSignByReferee(textHash, paraId, letterId, blockNumber, refereeU8, workerPublicKeyU8, amount);
      const receipt = getPublicDataToSignByReferee(paraId, letterId, blockNumber, refereeU8, workerPublicKeyU8, amount);

      let refereeSignOverPrivateData = "";
      let refereeSignOverReceipt = "";

      // sign
      if (signer && isFunction(signer.signRaw)) {// Use browser extenstion 
        const u8RefereeSignOverPrivateData = await signer.signRaw({
          address: currentPair.address,
          data: u8aToHex(privateData),
          type: 'bytes'
        });
        refereeSignOverPrivateData = u8RefereeSignOverPrivateData.signature;
        //
        const u8RefereeSignOverReceipt = await signer.signRaw({
          address: currentPair.address,
          data: u8aToHex(receipt),
          type: 'bytes'
        });
        refereeSignOverReceipt = u8RefereeSignOverReceipt.signature;
      } else {// Use locally stored account to sign
        refereeSignOverPrivateData = u8aToHex(currentPair.sign(u8aWrapBytes(privateData)));
        refereeSignOverReceipt = u8aToHex(currentPair.sign(u8aWrapBytes(receipt)));
      }
      // create the result text
      let result = [];
      result.push(textHash);
      result.push(paraId);
      result.push(letterId);
      result.push(blockNumber);
      result.push(refereePublicKeyHex);
      result.push(workerPublicKeyHex);
      result.push(amount.toString());
      result.push(refereeSignOverPrivateData);
      result.push(refereeSignOverReceipt);

      const letter = {
        created: new Date(),
        cid: textHash,
        paraId: paraId,
        letterNumber: letterId,
        block: blockNumber.toString(),
        referee: refereePublicKeyHex,
        worker: workerPublicKeyHex,
        amount: amount.toString(),
        signOverPrivateData: refereeSignOverPrivateData,
        signOverReceipt: refereeSignOverReceipt
      };
      await storeLetter(letter);
      await setLastUsedLetterNumber(refereePublicKeyHex, letterId);
      const letterInfo = result.join(",");
      // show QR
      setLetterInfo(letterInfo);
      setModalIsOpen(true);
    },
    [currentPair, isLocked, isUsable, signer, ipfs, text, workerPublicKeyHex, blockNumber, amount]
  );

  const _onUnlock = useCallback(
    (): void => {
      setIsLocked(false);
      toggleUnlock();
    },
    [toggleUnlock]
  );

  return (
    <div className={`toolbox--Sign ${className}`}>
      <h1>{t<string>('Create a diploma')}</h1>
      <div className='ui--row'>
        <InputAddress
          className='full'
          help={t<string>('select the account you wish to sign data with')}
          isInput={false}
          label={t<string>('account')}
          onChange={_onChangeAccount}
          type='account'
        />
      </div>
      <div className='ui--row'>
        <Input
          autoFocus
          className='full'
          help={t<string>('Recommendation letter text help info TODO')}
          label={t<string>('recommendation letter text')}
          onChange={_onChangeData}
          value={text}
        />
      </div>

      <div className='ui--row'>
        <Input
          autoFocus
          className='full'
          help={t<string>('About person help info TODO')}
          label={t<string>('about person')}
          onChange={_onChangeWorker}
          value={workerPublicKeyHex}
        />
      </div>

      <div className='ui--row'>
        <InputBalance
          autoFocus
          help={t<string>('Stake reputation help info')}
          isZeroable
          label={t<string>('stake reputation')}
          onChange={setAmount}
        />
      </div>
      <div className='ui--row'>
        <Input
          autoFocus
          className='full'
          help={t<string>('Block number help info TODO')}
          label={t<string>('block number')}
          onChange={_onChangeBlockNumber}
          value={blockNumber.toString()}
        />
      </div>
      <div className='toolbox--Sign-input'>
        <div className='ui--row'>
          <Output
            className='full'
            help={t<string>('create a diploma help text')}
            isHidden={signature.length === 0}
            isMonospace
            label={t<string>('create a diploma')}
            value={signature}
            withCopy
          />
        </div>
      </div>
      <Button.Group>
        <div
          className='unlock-overlay'
          hidden={!isUsable || !isLocked || isInjected}
        >
          {isLocked && (
            <div className='unlock-overlay-warning'>
              <div className='unlock-overlay-content'>
                {t<string>('You need to unlock this account to be able to sign data.')}<br />
                <Button.Group>
                  <Button
                    icon='unlock'
                    label={t<string>('Unlock account')}
                    onClick={toggleUnlock}
                  />
                </Button.Group>
              </div>
            </div>
          )}
        </div>
        <div
          className='unlock-overlay'
          hidden={isUsable}
        >
          <div className='unlock-overlay-warning'>
            <div className='unlock-overlay-content'>
              {isInjected
                ? t<string>('This injected account cannot be used to sign data since the extension does not support raw signing.')
                : t<string>('This external account cannot be used to sign data. Only Limited support is currently available for signing from any non-internal accounts.')}
            </div>
          </div>
        </div>
        {isUnlockVisible && (
          <Unlock
            onClose={toggleUnlock}
            onUnlock={_onUnlock}
            pair={currentPair}
          />
        )}
        <Button
          icon='key'
          isDisabled={!(isUsable && !isLocked && ipfs != null)}
          label={t<string>('Sign the recommendation')}
          onClick={_onSign}
        />
        {ipfs == null ? <div>{t<string>('Connecting to IPFS...')}</div> : ""}
      </Button.Group>
      {modalIsOpen &&
        <Modal
          size={"small"}
          header={t<string>('Scan this from a worker account')}
          onClose={() => setModalIsOpen(false)}
        >
          <Modal.Content>
            <QRCode value={letterInfo} size={qrCodeSize} />
          </Modal.Content>
        </Modal>
      }
    </div>
  );
}

export default React.memo(Referee);

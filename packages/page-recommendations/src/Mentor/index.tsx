// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import QRCode from 'qrcode.react';
import { getPublicDataToSignByReferee, getPrivateDataToSignByReferee } from '@slonigiraf/helpers';
import type { Signer } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useState } from 'react';
import { web3FromSource } from '@polkadot/extension-dapp';
import { Button, Input, InputAddress, InputBalance, Output, Modal, getAddressName } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isFunction, u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import Unlock from '@polkadot/app-signing/Unlock';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { qrCodeSize } from '../constants.js';
import { getLastUnusedLetterNumber, setLastUsedLetterNumber, storeLetter } from '../utils.js';
import { statics } from '@polkadot/react-api/statics';
import { useLocation } from 'react-router-dom';
import { getIPFSDataFromContentID, parseJson } from '@slonigiraf/helpers'
import { QRWithShareAndCopy } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
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

function Mentor({ className = '' }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const textHash = queryParams.get("cid") || "";
  const student = queryParams.get("person") || "";
  const [text, setText] = useState<string>(textHash);
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [signature, setSignature] = useState('');
  const [isUnlockVisible, toggleUnlock] = useToggle();
  const defaultStake: BN = new BN("572000000000000");
  const [amount, setAmount] = useState<BN>(defaultStake);
  const defaultBlockNumber: BN = new BN("1000000");
  const [blockNumber, setBlockNumber] = useState<BN>(defaultBlockNumber);
  const [letterInfo, setLetterInfo] = useState('');
  const [modalIsOpen, setModalIsOpen] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && text === textHash) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, textHash);
          const json = parseJson(content);
          setText(json.h);
        }
        catch (e) {
          setText(textHash + " (" + t('loading') + "...)");
          console.log(e);
        }
      }
    }
    fetchData()
  }, [ipfs, textHash])

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
      const genesisU8 = statics.api.genesisHash;
      const referee = currentPair;
      const refereeU8 = referee.publicKey;
      const refereePublicKeyHex = u8aToHex(refereeU8);
      const letterId = await getLastUnusedLetterNumber(refereePublicKeyHex);
      const workerPublicKeyU8 = hexToU8a(student);
      const privateData = getPrivateDataToSignByReferee(textHash, genesisU8, letterId, blockNumber, refereeU8, workerPublicKeyU8, amount);
      const receipt = getPublicDataToSignByReferee(genesisU8, letterId, blockNumber, refereeU8, workerPublicKeyU8, amount);

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
      result.push(genesisU8.toHex());
      result.push(letterId);
      result.push(blockNumber);
      result.push(refereePublicKeyHex);
      result.push(student);
      result.push(amount.toString());
      result.push(refereeSignOverPrivateData);
      result.push(refereeSignOverReceipt);

      const letter = {
        created: new Date(),
        cid: textHash,
        genesis: genesisU8.toHex(),
        letterNumber: letterId,
        block: blockNumber.toString(),
        referee: refereePublicKeyHex,
        worker: student,
        amount: amount.toString(),
        signOverPrivateData: refereeSignOverPrivateData,
        signOverReceipt: refereeSignOverReceipt
      };
      await storeLetter(letter);
      await setLastUsedLetterNumber(refereePublicKeyHex, letterId);
      const qrText = `{"q": 2,"d": "${result.join(",")}"}`;
      // show QR
      setLetterInfo(qrText);
      setModalIsOpen(true);
    },
    [currentPair, isLocked, isUsable, signer, ipfs, text, student, blockNumber, amount]
  );

  const getBaseUrl = () => {
    const { protocol, hostname, port } = window.location;
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
  };

  const _onUnlock = useCallback(
    (): void => {
      setIsLocked(false);
      toggleUnlock();
    },
    [toggleUnlock]
  );

  let publicKeyHex = "";
  if (currentPair !== null) {
    publicKeyHex = u8aToHex(currentPair.publicKey);
  }
  const [_isAddressExtracted, , name] = getAddressName(currentPair.address, null, "");

  const qrData = {
    q: 4,
    n: name,
    d: `knowledge?mentor=${publicKeyHex}`,
  };
  const qrCodeText = JSON.stringify(qrData);

  const url = getBaseUrl() + `/#/knowledge?mentor=${publicKeyHex}`;

  return (
    <div className={`toolbox--Mentor ${className}`}>
      {/* The div below helps initialize account */}
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          help={t('select the account you wish to sign data with')}
          isInput={false}
          label={t('account')}
          onChange={_onChangeAccount}
          type='account'
        />
      </div>

      {
        student === "" ? <>
          <h2>{t('Show the QR code to a student to begin mentoring')}</h2>
          <QRWithShareAndCopy dataQR={qrCodeText} titleShare={"Hi"} textShare={"Some text"} urlShare={url} dataCopy={url}/>
        </>
          :
          <>
            <h2>{t('Teach and create a diploma')}</h2>
            <div className='ui--row'>
              <h2>"{text}"</h2>
            </div>
            <div className='ui--row'>
              <h2>Person: {student}</h2>
            </div>
            <div className='ui--row'>
              <InputBalance
                help={t('Stake reputation help info')}
                isZeroable
                label={t('stake reputation')}
                onChange={setAmount}
                defaultValue={amount}
              />
            </div>
            <div className='ui--row'>
              <Input
                className='full'
                help={t('Block number help info TODO')}
                label={t('block number')}
                onChange={_onChangeBlockNumber}
                value={blockNumber.toString()}
              />
            </div>
            <div className='toolbox--Mentor-input'>
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
              <div
                className='unlock-overlay'
                hidden={!isUsable || !isLocked || isInjected}
              >
                {isLocked && (
                  <div className='unlock-overlay-warning'>
                    <div className='unlock-overlay-content'>
                      {t('You need to unlock this account to be able to sign data.')}<br />
                      <Button.Group>
                        <Button
                          icon='unlock'
                          label={t('Unlock account')}
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
                      ? t('This injected account cannot be used to sign data since the extension does not support raw signing.')
                      : t('This external account cannot be used to sign data. Only Limited support is currently available for signing from any non-internal accounts.')}
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
              {!isLocked && (<Button
                icon='key'
                isDisabled={!(isUsable && !isLocked && isIpfsReady)}
                label={t('Sign the recommendation')}
                onClick={_onSign}
              />)}
              {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
            </Button.Group>
            {modalIsOpen &&
              <Modal
                size={"small"}
                header={t('Scan this from a worker account')}
                onClose={() => setModalIsOpen(false)}
              >
                <Modal.Content>
                  <QRCode value={letterInfo} size={qrCodeSize} />
                </Modal.Content>
              </Modal>
            }
          </>
      }
    </div>
  );
}

export default React.memo(Mentor);

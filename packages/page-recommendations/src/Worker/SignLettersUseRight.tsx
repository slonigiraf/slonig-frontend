// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import BN from 'bn.js';
import QRCode from 'qrcode.react';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import type { Signer } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useState } from 'react';
import { web3FromSource } from '@polkadot/extension-dapp';
import { Button, Modal, InputAddress, Output, getAddressName } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isFunction, u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import { qrCodeSize } from '../constants';
import Unlock from '@polkadot/app-signing/Unlock';
import { Letter } from '../db/Letter.js';
import { storeLetterUsageRight } from '../utils';

interface Props {
  className?: string;
  letters: Letter[];
  worker: string;
  employer: string;
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

function SignLetterUseRight({ className = '', letters, worker, employer }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [signature, setSignature] = useState('');
  const [isUnlockVisible, toggleUnlock] = useToggle();
  const [letterInfo, setLetterInfo] = useState('')
  const [isQROpen, toggleQR] = useToggle();

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

  const _onSign = useCallback(
    async () => {
      if (isLocked || !isUsable || !currentPair) {
        return;
      }
      let signedLettersPromises = letters.map(async letter => {
        // generate a data to sign      
        const letterInsurance = getDataToSignByWorker(letter.letterNumber, new BN(letter.block), hexToU8a(letter.referee),
          hexToU8a(letter.worker), new BN(letter.amount), hexToU8a(letter.signOverReceipt), hexToU8a(employer));
        let workerSignOverInsurance = "";
        // sign
        if (signer && isFunction(signer.signRaw)) {// Use browser extenstion 
          const u8WorkerSignOverInsurance = await signer.signRaw({
            address: currentPair.address,
            data: u8aToHex(letterInsurance),
            type: 'bytes'
          });
          workerSignOverInsurance = u8WorkerSignOverInsurance.signature;

        } else {// Use locally stored account to sign
          workerSignOverInsurance = u8aToHex(currentPair.sign(u8aWrapBytes(letterInsurance)));
        }
        storeLetterUsageRight(letter, employer, workerSignOverInsurance);
        // create the result text
        let result = [];
        result.push(letter.cid);
        result.push(letter.genesis);
        result.push(letter.letterNumber);
        result.push(letter.block);
        result.push(letter.referee);
        result.push(letter.amount);
        result.push(letter.signOverPrivateData);
        result.push(letter.signOverReceipt);
        result.push(workerSignOverInsurance);
        return result.join(",");
      });

      const signedLetters = await Promise.all(signedLettersPromises);
      const [_isAddressExtracted, , studentName] = getAddressName(currentPair.address, null, "");


      const qrData = {
        q: 3,
        s: worker,
        n: studentName,
        t: employer,
        d: signedLetters
      };
      const qrCodeText = JSON.stringify(qrData);
      console.log(qrCodeText)
      // show QR
      setLetterInfo(letters.length > 0 && letters.length < 5 ? qrCodeText : "");
      toggleQR();
    },
    [currentPair, isLocked, isUsable, signer, worker, employer, letters]
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
          icon='dollar'
          isDisabled={!(isUsable && !isLocked)}
          label={t('Get bonuses')}
          onClick={_onSign}
        />)}
      </Button.Group>
      {isQROpen && (
        <Modal
          header={letterInfo === "" ? t('Warning') : t('Show this QR to your teacher')}
          onClose={toggleQR}
          size='small'
        >
          <Modal.Content>
            {letterInfo === "" ? <h2>{t('Select at least 1 and no more than 4 diplomas')}</h2> :
              <QRCode value={letterInfo} size={qrCodeSize} />
            }
          </Modal.Content>
        </Modal>
      )}
    </div>
  );
}

export default React.memo(SignLetterUseRight);
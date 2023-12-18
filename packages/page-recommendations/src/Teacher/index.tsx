// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import InsurancesList from './InsurancesList.js';
import { IPFS } from 'ipfs-core';
import { useTranslation } from '../translate.js';
import { InputAddress, Button } from '@polkadot/react-components';
import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import { u8aToHex, isFunction } from '@polkadot/util';
import { useLocation } from 'react-router-dom';
import { QRWithShareAndCopy, nameFromKeyringPair, getBaseUrl, QRAction, parseJson } from '@slonigiraf/app-slonig-components';
import { storeInsurances, storePseudonym } from '../utils.js';
import Unlock from '@polkadot/app-signing/Unlock';
import { useToggle } from '@polkadot/react-hooks';
import type { AccountState, SignerState } from '@slonigiraf/app-slonig-components';
import { web3FromSource } from '@polkadot/extension-dapp';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function Teacher({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  // Initialize account
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [signature, setSignature] = useState('');
  const [isUnlockVisible, toggleUnlock] = useToggle();

  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const student = queryParams.get("student");
  const studentNameFromUrl = queryParams.get("name");
  const teacherFromUrl = queryParams.get("t");
  const diplomasFromUrl = queryParams.get("d");

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const isDedicatedTeacher = (teacherFromUrl === publicKeyHex) || !teacherFromUrl;
  const name = nameFromKeyringPair(currentPair);
  const qrData = {
    q: QRAction.TEACHER_IDENTITY,
    n: name,
    p: publicKeyHex,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url = getBaseUrl() + `/#/diplomas?teacher=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  // Initialize account state
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

  // Save student pseudonym from url
  useEffect(() => {
    if (student && studentNameFromUrl) {
      async function savePseudonym() {
        try {
          // Ensure that both teacherPublicKey and teacherName are strings
          if (typeof student === 'string' && typeof studentNameFromUrl === 'string') {
            await storePseudonym(student, studentNameFromUrl);
            // setStudentName(studentNameFromUrl);
          }
        } catch (error) {
          console.error("Failed to save teacher pseudonym:", error);
        }
      }
      savePseudonym();
    }
  }, [student, studentNameFromUrl]);



  // Save insurances from url
  useEffect(() => {
    if (diplomasFromUrl && isDedicatedTeacher) {
      async function saveDiplomas() {
        const dimplomasJson = parseJson(diplomasFromUrl);
        try {
          const dimplomasJsonWithMeta = {
            q: QRAction.SELL_DIPLOMAS,
            p: student,
            n: studentNameFromUrl,
            t: publicKeyHex,
            d: dimplomasJson
          };
          await storeInsurances(dimplomasJsonWithMeta);
        } catch (error) {
          console.error("Failed to save diplomas:", error);
        }
      }
      saveDiplomas();
    }
  }, [diplomasFromUrl, isDedicatedTeacher]);

  // If account is unlocked by password
  const _onUnlock = useCallback(
    (): void => {
      setIsLocked(false);
      toggleUnlock();
    },
    [toggleUnlock]
  );

  const unlock = <>
    <div
      className='unlock-overlay'
      hidden={!isUsable || !isLocked || isInjected}
    >
      {isLocked && (
        <div className='unlock-overlay-warning'>
          <div className='unlock-overlay-content'>
            <div>
              <Button
                icon='unlock'
                label={t('Unlock your account before tutoring')}
                onClick={toggleUnlock}
              />
            </div>
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
  </>;

  return (
    <div className={`toolbox--Student ${className}`}>
      {/* The div below helps initialize account */}
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          isInput={false}
          label={t('account')}
          type='account'
          onChange={_onChangeAccount}
        />
      </div>
      {
        (!student || !isDedicatedTeacher) ? (
          isDedicatedTeacher ? (
            <h2>{t('Show to a student to see their results')}</h2>
          ) : (
            <h2>{t('Student has shown you a QR code created for a different teacher. Ask them to scan your QR code.')}</h2>
          )
        ) : null
      }
      {
        (!student || !isDedicatedTeacher) && (
          <QRWithShareAndCopy
            dataQR={qrCodeText}
            titleShare={t('QR code')}
            textShare={t('Press the link to show diplomas')}
            urlShare={url}
            dataCopy={url} />
        )
      }
      {
        student && isDedicatedTeacher && (
          isLocked ? unlock : (
            <div className='ui--row'>
              <InsurancesList ipfs={ipfs} teacher={u8aToHex(currentPair?.publicKey)} student={student} />
            </div>
          )
        )
      }
    </div>
  );

}

export default React.memo(Teacher);
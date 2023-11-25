// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button, TxButton } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { ValidatingAlgorithm } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Insurance } from '../db/Insurance.js';
import { getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components'
import type { KeyringPair } from '@polkadot/keyring/types';
import { useApi } from '@polkadot/react-hooks';
import { db } from "../db/index.js";
import BN from 'bn.js';
import { u8aToHex } from '@polkadot/util';

interface Props {
  className?: string;
  currentPair: KeyringPair;
  insurance: Insurance | null;
  onResult: () => void;
}

function Reexamine({ className = '', currentPair, insurance, onResult }: Props): React.ReactElement<Props> {
  const { api } = useApi();
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const [skill, setSkill] = useState<Skill>();
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();
  const [nextStage, setNextStage] = useState<AlgorithmStage>();

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && insurance) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, insurance.cid);
          const skillJson = parseJson(skillContent);
          setSkill(skillJson);
          const newAlgorithm = new ValidatingAlgorithm(t, skillJson ? skillJson.q : []);
          setAlgorithmStage(newAlgorithm.getBegin());
        }
        catch (e) {
          console.log(e);
        }
      }
    }
    fetchData()
  }, [ipfs, insurance])



  const handleStageChange = (nextStage) => {
    if (nextStage.type === 'reimburse') {
      setNextStage(nextStage);
      getBounty();
    } else {
      setAlgorithmStage(nextStage);
    }
  };

  const markUsedInsurance = () => {
    if (insurance.id) {
      db.insurances.where({ id: insurance.id }).modify((f) => f.wasUsed = true);
    }
  }

  const _onSuccess = (_result: any) => {
    markUsedInsurance();
    onResult();
  }

  const _onFailed = (_result: any) => {
    onResult();
  }

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const isUsable = currentPair != null;

  const onSendRef = useRef(null);
  const txButton = insurance && isUsable && <TxButton
    onSendRef={onSendRef}
    className='reimburseButton'
    accountId={currentPair.address}
    icon='dollar'
    label={t('Get bounty')}
    onSuccess={_onSuccess}
    onFailed={_onFailed}
    params={
      [insurance.letterNumber,
      new BN(insurance.block),
      new BN(insurance.blockAllowed),
      insurance.referee,
      insurance.worker,
      u8aToHex(currentPair.publicKey),
      new BN(insurance.amount),
      insurance.signOverReceipt,
      insurance.workerSign]
    }
    tx={api.tx.letters.reimburse}
  />

  const getBounty = () => {
    if (onSendRef.current) {
      onSendRef.current();
    }
  }

  return (
    !skill ? <></> :
      <div>
        <div className='ui--row' style={{ display: 'none' }}>
          {txButton}
        </div>
        {algorithmStage ? (
          <div>
            <div>{algorithmStage.getWords()}</div>
            <div>
              {algorithmStage.getPrevious() && (
                <Button onClick={() => handleStageChange(algorithmStage.getPrevious())}
                  icon='arrow-left'
                  label='Back'
                />
              )}
              {algorithmStage.getNext().map((nextStage, index) => (
                <Button key={index} onClick={() => handleStageChange(nextStage)}
                  icon='fa-square'
                  label={nextStage.getName()}
                />
              ))}

            </div>
          </div>
        ) : (
          <div>Error: Reload the page</div>
        )}
      </div>
  );
}

export default React.memo(Reexamine)
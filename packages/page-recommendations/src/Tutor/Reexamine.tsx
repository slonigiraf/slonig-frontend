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
import { getIPFSDataFromContentID, parseJson, useInfo } from '@slonigiraf/app-slonig-components';
import type { KeyringPair } from '@polkadot/keyring/types';
import { useApi } from '@polkadot/react-hooks';
import { getBounty } from "../getBounty.js";

interface Props {
  className?: string;
  currentPair: KeyringPair;
  insurance: Insurance | null;
  onResult: () => void;
}

function Reexamine({ className = '', currentPair, insurance, onResult }: Props): React.ReactElement<Props> {
  const { api } = useApi();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [skill, setSkill] = useState<Skill>();
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();
  const { showInfo } = useInfo();
  const [isButtonClicked, setIsButtonClicked] = useState(false);


  useEffect(() => {
    async function fetchData() {
      if (isIpfsReady && insurance && insurance.cid) {
        try {
          const skillContent = await getIPFSDataFromContentID(ipfs, insurance.cid);
          const skillJson = parseJson(skillContent);
          setSkill(skillJson);
          const newAlgorithm = new ValidatingAlgorithm(t, skillJson, insurance);
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
    setIsButtonClicked(true);
    if (nextStage.type === 'reimburse') {
      getBounty(insurance, currentPair, api, t, onResult, showInfo);
    } else if (nextStage.type === 'success') {
      onResult();
    } else {
      setAlgorithmStage(nextStage);
      setIsButtonClicked(false);
    }
  };

  return (
    !skill ? <></> :
      <div>
        <div className='ui--row'>
          <b>{t('Reexamine the skill that student know')}: "{skill ? skill.h : ''}"</b>
        </div>
        {algorithmStage ? (
          <div>
            <div>{algorithmStage.getWords()}</div>
            <div>
              {algorithmStage.getPrevious() && (
                <Button onClick={() => handleStageChange(algorithmStage.getPrevious())}
                  icon='arrow-left'
                  label='Back'
                  isDisabled={isButtonClicked}
                />
              )}
              {algorithmStage.getNext().map((nextStage, index) => (
                <Button key={index} onClick={() => handleStageChange(nextStage)}
                  icon='fa-square'
                  label={nextStage.getName()}
                  isDisabled={isButtonClicked}
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
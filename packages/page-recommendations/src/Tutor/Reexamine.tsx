// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from 'react';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { ValidatingAlgorithm } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Insurance } from '../db/Insurance.js';
import { getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components'

interface Props {
  className?: string;
  insurance: Insurance | null;
  onResult: (stage: string) => void;
}

function Reexamine({ className = '', insurance, onResult }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const [skill, setSkill] = useState<Skill>();
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();

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
    setAlgorithmStage(nextStage);
    onResult(nextStage.type);
  };

  return (
    ! skill ? <></> :
    <div>
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
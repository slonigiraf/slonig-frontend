// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useRef } from 'react';
import { Algorithm } from './Algorithm.js';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button } from '@polkadot/react-components';
import { Insurance } from '../db/Insurance.js';
import GetBounty from '../Teacher/GetBounty.js';
import { Skill } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  algorithm: Algorithm | null;
  onResult: (stage: string) => void;
  insurance: Insurance;
  skillR: Skill;
}

function DoInstructions({ className = '', algorithm, onResult: onResult, skillR, insurance }: Props): React.ReactElement<Props> {
  if (algorithm === null) {
    return <></>
  }
  const useInsuranceRef = useRef();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>(algorithm.getBegin());

  const handleStageChange = (nextStage) => {
    handleUseInsurance();
    setAlgorithmStage(nextStage);
    onResult(nextStage.type);
  };

  const handleUseInsurance = () => {
    if (useInsuranceRef.current) {
      useInsuranceRef.current.useInsurance();
    }
  };

  const getBounty = <GetBounty text={skillR ? skillR.h : ''} insurance={insurance} ref={useInsuranceRef}/>

  return (
    <div>
      {getBounty}
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

export default React.memo(DoInstructions)
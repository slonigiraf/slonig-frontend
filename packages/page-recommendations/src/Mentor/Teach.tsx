// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from 'react';
import { TeachingAlgorithm } from './TeachingAlgorithm.js';
import { AlgorithmStage } from './AlgorithmStage.js';
import { useTranslation } from '../translate.js';
import { Button } from '@polkadot/react-components';


interface Props {
  className?: string;
}

function Teach({ className = '' }: Props): React.ReactElement<Props> {
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage|null>(null);
  const [algorithm, setAlgorithm] = useState<TeachingAlgorithm | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const newAlgorithm = new TeachingAlgorithm(t, 'task1', 'task2');
    setAlgorithm(newAlgorithm);
    setAlgorithmStage(newAlgorithm.getBegin());
  }, []);

  const handleStageChange = (nextStage) => {
    setAlgorithmStage(nextStage);
  };

  const handleInsuranceIssue = (issue) => {
    // Handle insurance issue logic here
  };

  return (
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
            {algorithmStage.getWords() === 'SELL_GUARANTEE_DESCRIPTION' && (
              <Button onClick={() => handleInsuranceIssue(true)}
                icon='fa-square'
                label='Sell Diploma'
              />
            )}
            {algorithmStage.getWords() === 'REPEAT_TOMORROW_DESCRIPTION' && (
              <Button onClick={() => handleInsuranceIssue(false)}
                icon='fa-square'
                label='Repeat Tomorrow'
              />
            )}
          </div>
        </div>
      ) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}

export default React.memo(Teach)
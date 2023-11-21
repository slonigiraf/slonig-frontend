// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from 'react';
import { TeachingAlgorithm } from './TeachingAlgorithm.js';
import { AlgorithmStage } from './AlgorithmStage.js';
import { useTranslation } from '../translate.js';

interface Props {
  className?: string;
}

function Teach({ className = '' }: Props): React.ReactElement<Props> {
  const [algorithmStage, setAlgorithmStage] = useState(null);
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
              <button onClick={() => handleStageChange(algorithmStage.getPrevious())}>
                Back
              </button>
            )}
            {algorithmStage.getNext().map((nextStage, index) => (
              <button key={index} onClick={() => handleStageChange(nextStage)}>
                {nextStage.getName()}
              </button>
            ))}
            {algorithmStage.getWords() === 'SELL_GUARANTEE_DESCRIPTION' && (
              <button onClick={() => handleInsuranceIssue(true)}>
                Sell Diploma
              </button>
            )}
            {algorithmStage.getWords() === 'REPEAT_TOMORROW_DESCRIPTION' && (
              <button onClick={() => handleInsuranceIssue(false)}>
                Repeat Tomorrow
              </button>
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
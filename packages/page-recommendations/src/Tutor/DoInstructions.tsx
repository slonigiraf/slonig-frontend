// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from 'react';
import { TeachingAlgorithm } from './TeachingAlgorithm.jsx';
import { AlgorithmStage } from './AlgorithmStage.js';
import { useTranslation } from '../translate.js';
import { Button } from '@polkadot/react-components';
import type { Question } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  questions: Question[];
  setCanIssueDiploma: (value) => void;
}

function DoInstructions({ className = '', questions, setCanIssueDiploma }: Props): React.ReactElement<Props> {
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage|null>(null);
  const [algorithm, setAlgorithm] = useState<TeachingAlgorithm | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const newAlgorithm = new TeachingAlgorithm(t, questions);
    setAlgorithm(newAlgorithm);
    setAlgorithmStage(newAlgorithm.getBegin());
  }, [questions]);

  const handleStageChange = (nextStage) => {
    setAlgorithmStage(nextStage);
    if(nextStage.type === 'success'){
      setCanIssueDiploma(true);
    } else{
      setCanIssueDiploma(false);
    }
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
            
          </div>
        </div>
      ) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}

export default React.memo(DoInstructions)
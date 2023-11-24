// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect } from 'react';
import { Algorithm } from './Algorithm.jsx';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button } from '@polkadot/react-components';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { ValidatingAlgorithm } from './ValidatingAlgorithm.js';
import { useTranslation } from '../translate.js';

interface Props {
  className?: string;
  skill: Skill | null;
  onResult: (stage: string) => void;
}

function Reexamine({ className = '', skill, onResult }: Props): React.ReactElement<Props> {
  console.log("skill: ", skill)
  if (skill === undefined) {
    return <></>
  }
  const { t } = useTranslation();
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage>();

  useEffect(() => {
    const newAlgorithm = new ValidatingAlgorithm(t, skill ? skill.q : []);
    setAlgorithmStage(newAlgorithm.getBegin());
  }, [skill]);

  const handleStageChange = (nextStage) => {
    setAlgorithmStage(nextStage);
    onResult(nextStage.type);
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

export default React.memo(Reexamine)
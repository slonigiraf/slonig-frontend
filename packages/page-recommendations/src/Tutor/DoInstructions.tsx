import React, { useState, useEffect } from 'react';
import { Algorithm } from './Algorithm.js';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button, Spinner } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { InstructionsButtonsContainer, InstructionsButtonsGroup, InstructionsContainer } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  algorithm: Algorithm | null;
  onResult: (stage: string) => void;
}

function DoInstructions({ className = '', algorithm, onResult }: Props): React.ReactElement<Props> {
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (algorithm) {
      setAlgorithmStage(algorithm.getBegin());
    } else {
      setAlgorithmStage(null);
    }
  }, [algorithm]);

  const handleStageChange = (nextStage: AlgorithmStage | null) => {
    if (nextStage) {
      setAlgorithmStage(nextStage);
      onResult(nextStage.type);
    }
  };

  if (!algorithm) {
    return <Spinner label={t('Loading')} />;
  }

  return (
    <div className={className}>
      {algorithmStage ? (
        <InstructionsContainer>
          {algorithmStage.getWords()}
          <InstructionsButtonsContainer>
            <InstructionsButtonsGroup>
              {algorithmStage.getPrevious() && (
                <Button onClick={() => handleStageChange(algorithmStage.getPrevious())}
                  icon='arrow-left'
                  label={t('Back')} />
              )}
              {algorithmStage.getNext().map((nextStage, index) => (
                <Button key={index} onClick={() => handleStageChange(nextStage)}
                  icon='square'
                  label={nextStage.getName()} />
              ))}
            </InstructionsButtonsGroup>
          </InstructionsButtonsContainer>
        </InstructionsContainer>
      ) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}

export default React.memo(DoInstructions);
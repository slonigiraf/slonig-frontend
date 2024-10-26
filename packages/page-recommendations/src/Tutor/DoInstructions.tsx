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

  // Effect to initialize or update the algorithmStage based on the algorithm prop
  useEffect(() => {
    console.log("New algo: "+algorithm)
    if (algorithm) {
      setAlgorithmStage(algorithm.getBegin());
    } else {
      setAlgorithmStage(null); // Ensure we reset to null if algorithm is not available
    }
  }, [algorithm]);

  useEffect(() => {
    console.log("New onResult: ")
  }, [onResult]);

  // Handles stage changes, ensuring we always work with the latest state and non-null values
  const handleStageChange = (nextStage: AlgorithmStage | null) => {
    if (nextStage) { // Check for non-null value before proceeding
      setAlgorithmStage(nextStage);
      onResult(nextStage.type);
    }
  };

  if (!algorithm) {
    return <Spinner label={t('Loading')} />;
  }

  console.log("DoInstructions")

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
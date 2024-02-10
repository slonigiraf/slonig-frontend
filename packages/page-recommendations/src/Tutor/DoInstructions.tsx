import React, { useState, useEffect } from 'react';
import { Algorithm } from './Algorithm.js';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { styled } from '@polkadot/react-components';

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
    if (algorithm) {
      setAlgorithmStage(algorithm.getBegin());
    } else {
      setAlgorithmStage(null); // Ensure we reset to null if algorithm is not available
    }
  }, [algorithm]);

  // Handles stage changes, ensuring we always work with the latest state and non-null values
  const handleStageChange = (nextStage: AlgorithmStage | null) => {
    if (nextStage) { // Check for non-null value before proceeding
      setAlgorithmStage(nextStage);
      onResult(nextStage.type);
    }
  };

  if (!algorithm) {
    return <></>;
  }

  return (
    <div className={className}>
      {algorithmStage ? (
        <InstructionsContainer>
          {algorithmStage.getWords()}
          <ButtonsContainer>
            <ButtonsGroup>
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
            </ButtonsGroup>
          </ButtonsContainer>
        </InstructionsContainer>
      ) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}

// Styled components
const InstructionsContainer = styled.div`
  width: 100%;
`;

const ButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  margin: 0 auto;
`;
const ButtonsGroup = styled.div`
  display: flex;
  align-items: center;
  max-width: 400px;
  margin: 0 auto;
`;

export default React.memo(DoInstructions);
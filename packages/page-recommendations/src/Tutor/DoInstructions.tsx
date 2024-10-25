import React, { useState, useEffect } from 'react';
import { Algorithm } from './Algorithm.js';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button, Progress, Spinner } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { styled } from '@polkadot/react-components';
import { Lesson } from '../db/Lesson.js';
import { InstructionsButtonsContainer, InstructionsButtonsGroup, InstructionsContainer, StyledCloseButton } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  algorithm: Algorithm | null;
  lesson: Lesson | null;
  onResult: (stage: string) => void;
  onClose: () => void;
}

function DoInstructions({ className = '', algorithm, lesson, onResult, onClose }: Props): React.ReactElement<Props> {
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
    return <Spinner label={t('Loading')} />;
  }

  return (
    <div className={className}>
      {algorithmStage ? (
        <InstructionsContainer>
          {lesson && <StyledProgress
            value={lesson.learnStep + lesson.reexamineStep}
            total={lesson.toLearnCount + lesson.toReexamineCount}
          />}
          <StyledCloseButton onClick={onClose}
            icon='close'
          />
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


const StyledProgress = styled(Progress)`
  position: fixed;
  bottom: 80px;
  left: 20px;
  z-index: 1;
  @media (min-width: 768px) {
    left: 50%;
    transform: translateX(-50%) translateX(-350px);
  }
`;

export default React.memo(DoInstructions);
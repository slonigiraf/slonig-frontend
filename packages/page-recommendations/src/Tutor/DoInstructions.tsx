import React, { useState, useEffect } from 'react';
import { Algorithm } from './Algorithm.js';
import { AlgorithmStage } from './AlgorithmStage.js';
import { Button } from '@polkadot/react-components';

interface Props {
  className?: string;
  algorithm: Algorithm | null;
  onResult: (stage: string) => void;
}

function DoInstructions({ className = '', algorithm, onResult }: Props): React.ReactElement<Props> {
  const [algorithmStage, setAlgorithmStage] = useState<AlgorithmStage | null>(null);

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
        <div>
          <div>{algorithmStage.getWords()}</div>
          <div>
            {algorithmStage.getPrevious() && (
              <Button onClick={() => handleStageChange(algorithmStage.getPrevious())}
                      icon='arrow-left'
                      label='Back' />
            )}
            {algorithmStage.getNext().map((nextStage, index) => (
              <Button key={index} onClick={() => handleStageChange(nextStage)}
                      icon='square'
                      label={nextStage.getName()} />
            ))}
          </div>
        </div>
      ) : (
        <div>Error: Reload the page</div>
      )}
    </div>
  );
}

export default React.memo(DoInstructions);
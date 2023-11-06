// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback } from 'react';
import { Button } from '@polkadot/react-components';
import ExerciseEditor from './ExerciseEditor';  // Import the ExerciseEditor component
import { useIpfsContext } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  list: any;
  onListChange: (updatedList: any) => void;
}

function ExercisesList({ className = '', list, onListChange }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();

  const handleMoveUp = useCallback((index: number) => {
    const updatedExercises = [...list.q];
    const temp = updatedExercises[index];
    updatedExercises[index] = updatedExercises[index - 1];
    updatedExercises[index - 1] = temp;
    onListChange({ ...list, q: updatedExercises });
  }, [list, onListChange]);

  const handleMoveDown = useCallback((index: number) => {
    const updatedExercises = [...list.q];
    const temp = updatedExercises[index];
    updatedExercises[index] = updatedExercises[index + 1];
    updatedExercises[index + 1] = temp;
    onListChange({ ...list, q: updatedExercises });
  }, [list, onListChange]);

  const handleDelete = useCallback((index: number) => {
    const updatedExercises = [...list.q];
    updatedExercises.splice(index, 1);
    onListChange({ ...list, q: updatedExercises });
  }, [list, onListChange]);

  return (list == null || list.q == null) ? null : (
    <>
      {list.q.map((exercise, index) => (
        <div className='ui--row' key={index}
        style={{
          alignItems: 'center'
        }}
        >
          <Button
            icon='arrow-up'
            isDisabled={index === 0}
            onClick={() => handleMoveUp(index)}
          />
          <Button
            icon='arrow-down'
            isDisabled={index === list.q.length - 1}
            onClick={() => handleMoveDown(index)}
          />
          <Button
            icon='times'  // Assuming 'times' is the icon for delete
            onClick={() => handleDelete(index)}
          />
          <ExerciseEditor exercise={exercise} onListChange={onListChange} index={index} />
        </div>
      ))}
    </>
  );
}

export default React.memo(ExercisesList);
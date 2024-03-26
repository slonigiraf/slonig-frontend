// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback } from 'react';
import { Button, styled } from '@polkadot/react-components';
import ExerciseEditor from './ExerciseEditor.js';
import { Exercise, HorizontalCenterItemsContainer } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  list: any;
  onListChange: (updatedList: any) => void;
}

function ExerciseEditorList({ className = '', list, onListChange }: Props): React.ReactElement<Props> {
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

  return (list == null || list.q == null) ? <></> : (
    <>
      {list.q.map((exercise: Exercise, index: number) => (
        <div className='ui--row' key={index} style={{ border: '2px solid #FFF', padding: '5px', marginBottom: '5px' }}>
      
          <ButtonsAsAColumn>
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
          </ButtonsAsAColumn>
          <ExerciseEditor skill={list} exercise={exercise} onSkillChange={onListChange} index={index} />
       
        </div>
      ))}
    </>
  );
}
const ButtonsAsAColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 3rem;
  max-width: 3rem;
`;
export default React.memo(ExerciseEditorList);
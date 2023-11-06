// ExerciseEditor.tsx

import React from 'react';
import { Input } from '@polkadot/react-components';  // Assuming the correct import path
import { useTranslation } from '../translate.js';    // Adjust path if necessary

interface ExerciseEditorProps {
  exercise: { h: string; a: string };
  index: number;
  list: any;
  onListChange: (updatedList: any) => void;
}

const ExerciseEditor: React.FC<ExerciseEditorProps> = ({ exercise, index, list, onListChange }) => {
  const { t } = useTranslation();

  const onEditHeader = (newHeader: string) => {
    const updatedExercises = [...(list.q || [])];
    updatedExercises[index].h = newHeader;
    onListChange({ ...list, q: updatedExercises });
  };

  const onEditAnswer = (newAnswer: string) => {
    const updatedExercises = [...(list.q || [])];
    updatedExercises[index].a = newAnswer;
    onListChange({ ...list, q: updatedExercises });
  };

  return (
    <div key={index} className="exercise-editor">
      <Input
        autoFocus
        className='full'
        help={t('Exercise Header')}
        label={t('Header')}
        onChange={onEditHeader}
        value={exercise.h}
      />
      <Input
        className='full'
        help={t('Exercise Answer')}
        label={t('Answer')}
        onChange={onEditAnswer}
        value={exercise.a}
      />
    </div>
  );
}

export default React.memo(ExerciseEditor);
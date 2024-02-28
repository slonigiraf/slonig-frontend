import React from 'react';
import { TextArea } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';

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
      <TextArea
        className='full'
        label={t('Exercise')}
        onChange={onEditHeader}
        seed={exercise.h}
      />
      <TextArea
        className='full'
        label={t('Solution')}
        onChange={onEditAnswer}
        seed={exercise.a}
      />
    </div>
  );
}

export default React.memo(ExerciseEditor);
import React, { useCallback } from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';

interface ExerciseListProps {
  skillName: string;
  exercises: {
    h: string;
    a: string;
  }[];
}

const LearnWithAI: React.FC<ExerciseListProps> = ({ skillName, exercises }) => {
  const { t } = useTranslation();
  const usable = skillName && exercises && exercises.length >= 2;

  const createNavigatePath = useCallback(() => {
    if(!usable){
      return;
    }
    const params = new URLSearchParams();
    params.append(`skill`, skillName);
    exercises.slice(0, 2).forEach((exercise, index) => {
      params.append(`exercise${index + 1}`, exercise.h); // Using exercise.h as the identifier
    });
    return `http://ai.slonig.com/?${params.toString()}`;
  }, [skillName, exercises]);

  const openAIPage = useCallback(() => {
    window.open(createNavigatePath(), '_blank');
  }, [createNavigatePath]);

  return (
    <Button
      icon='robot'
      label={t('Learn with AI')}
      onClick={openAIPage}
      isDisabled={!usable}
    />
  );
}

export default LearnWithAI;
import React, { useState, ChangeEvent, FC } from 'react';
import { TextArea, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Exercise, Skill } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  exercise: Exercise;
  index: number;
  skill: Skill;
  onListChange: (updatedList: { q?: Exercise[] }) => void;
}

const ExerciseEditor: FC<Props> = ({ className = '', exercise, index, skill, onListChange }) => {
  const { t } = useTranslation();
  const [exerciseImage, setExerciseImage] = useState<string>(exercise.p || '');
  const [solutionImage, setSolutionImage] = useState<string>(exercise.i || '');

  const convertToBase64 = (file: File, callback: (base64Image: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      if (e.target?.result) {
        callback(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>, type: 'exercise' | 'solution') => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      convertToBase64(file, (base64Image) => {
        if (type === 'exercise') {
          setExerciseImage(base64Image);
          updateExercise({ ...exercise, p: base64Image });
        } else {
          setSolutionImage(base64Image);
          updateExercise({ ...exercise, i: base64Image });
        }
      });
    }
  };

  const onEditHeader = (newHeader: string) => {
    const updatedExercises = [...(skill.q || [])];
    updatedExercises[index].h = newHeader;
    onListChange({ ...skill, q: updatedExercises });
  };

  const onEditAnswer = (newAnswer: string) => {
    const updatedExercises = [...(skill.q || [])];
    updatedExercises[index].a = newAnswer;
    onListChange({ ...skill, q: updatedExercises });
  };

  const updateExercise = (updatedExercise: Exercise) => {
    const updatedExercises = [...(skill.q || [])];
    updatedExercises[index] = updatedExercise;
    onListChange({ ...skill, q: updatedExercises });
  };

  return (
    <div className={className}>
      <TextArea
        label={t('Exercise')}
        seed={exercise.h}
        onChange={onEditHeader}
      />
      <ImageUploadContainer>
        {exerciseImage && <StyledImage src={exerciseImage} alt="Exercise" />}
        <input
          type="file"
          onChange={(e) => handleImageChange(e, 'exercise')}
          accept="image/*"
        />
      </ImageUploadContainer>

      <TextArea
        label={t('Solution')}
        seed={exercise.a}
        onChange={onEditAnswer}
      />
      <ImageUploadContainer>
        {solutionImage && <StyledImage src={solutionImage} alt="Solution" />}
        <input
          type="file"
          onChange={(e) => handleImageChange(e, 'solution')}
          accept="image/*"
        />
      </ImageUploadContainer>
    </div>
  );
};

const ImageUploadContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
  margin-bottom: 15px;
  padding-left: 2rem;
`;

const StyledImage = styled.img`
  width: 200px;
  margin-bottom: 10px;
`;

export default React.memo(ExerciseEditor);
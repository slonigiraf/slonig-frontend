import React, { useState, ChangeEvent, FC } from 'react';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Exercise, ResizableImage, Skill, TextAreaWithPreview } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  exercise: Exercise;
  index: number;
  skill: Skill;
  onSkillChange: (updatedList: { q?: Exercise[] }) => void;
}

const ExerciseEditor: FC<Props> = ({ className = '', exercise, index, skill, onSkillChange }) => {
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


  const updateExercise = (updatedExercise: Exercise) => {
    const updatedExercises = [...(skill.q || [])];
    updatedExercises[index] = updatedExercise;
    onSkillChange({ ...skill, q: updatedExercises });
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

  const onEditExerciseText = (text: string) => {
    updateExercise({ ...exercise, h: text });
  };

  const onEditSolutionText = (text: string) => {
    updateExercise({ ...exercise, a: text });
  };

  const handleDeleteImage = (type: 'exercise' | 'solution') => {
    if (type === 'exercise') {
      setExerciseImage('');
      updateExercise({ ...exercise, p: undefined }); // Remove or set to a default value.
    } else {
      setSolutionImage('');
      updateExercise({ ...exercise, i: undefined }); // Remove or set to a default value.
    }
  };

  return (
    <div className={className}>
      <TextAreaWithPreview
        label={t('Exercise')}
        seed={exercise.h}
        onChange={onEditExerciseText}
      />
      <ImageUploadContainer>
        {
          exerciseImage &&
          <ImageContainer>
            <ResizableImage src={exerciseImage} />
            <StyledDeleteButton label='' icon='trash' onClick={() => handleDeleteImage('exercise')} />
          </ImageContainer>
        }

        <input
          type="file"
          onChange={(e) => handleImageChange(e, 'exercise')}
          accept="image/*"
        />
      </ImageUploadContainer>

      <TextAreaWithPreview
        label={t('Solution')}
        seed={exercise.a}
        onChange={onEditSolutionText}
      />
      <ImageUploadContainer>
        {
          solutionImage &&
          <ImageContainer>
            <ResizableImage src={solutionImage} alt="Solution" />
            <StyledDeleteButton label='' icon='trash' onClick={() => handleDeleteImage('solution')} />
          </ImageContainer>
        }
        <input
          type="file"
          onChange={(e) => handleImageChange(e, 'solution')}
          accept="image/*"
        />
      </ImageUploadContainer>
    </div>
  );
};

const ImageContainer = styled.div`
  position: relative;
  display: inline-block;
  margin-right: 10px;
  width: 100%;
  @media (min-width: 768px) {
    width: 400px;
  }
`;

const StyledDeleteButton = styled(Button)`
  position: absolute;
  top: 0;
  right: 0;
`;

const ImageUploadContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
  margin-bottom: 15px;
`;

export default React.memo(ExerciseEditor);
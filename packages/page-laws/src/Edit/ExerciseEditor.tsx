import React, { useState } from 'react';
import { TextArea, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';

const ExerciseEditor = ({ exercise, index, list, onListChange }) => {
  const { t } = useTranslation();
  const [exerciseImage, setExerciseImage] = useState(exercise.p || '');
  const [solutionImage, setSolutionImage] = useState(exercise.i || '');

  const convertToBase64 = (file, callback) => {
    const reader = new FileReader();
    reader.onload = (e) => callback(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e, type) => {
    const file = e.target.files[0];
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
    const updatedExercises = [...(list.q || [])];
    updatedExercises[index].h = newHeader;
    onListChange({ ...list, q: updatedExercises });
  };

  const onEditAnswer = (newAnswer: string) => {
    const updatedExercises = [...(list.q || [])];
    updatedExercises[index].a = newAnswer;
    onListChange({ ...list, q: updatedExercises });
  };

  const updateExercise = (updatedExercise) => {
    const updatedExercises = [...(list.q || [])];
    updatedExercises[index] = updatedExercise;
    onListChange({ ...list, q: updatedExercises });
  };

  return (
    <div className="exercise-editor">
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
  align-items: center;
  margin-bottom: 15px;
`;

const StyledImage = styled.img`
  width: 200px;
  margin-bottom: 10px;
`;
export default React.memo(ExerciseEditor);
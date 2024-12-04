import React, { useState, ChangeEvent, FC } from 'react';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Exercise, ResizableImage, Skill, TextAreaWithPreview, useIpfsContext } from '@slonigiraf/app-slonig-components';
import { getIPFSContentIDForBytesAndPinIt } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  exercise: Exercise;
  index: number;
  skill: Skill;
  onSkillChange: (updatedList: { q?: Exercise[] }) => void;
}

const ExerciseEditor: FC<Props> = ({ className = '', exercise, index, skill, onSkillChange }) => {
  const { t } = useTranslation();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [exerciseImageCid, setExerciseImageCid] = useState<string>(exercise.p || '');
  const [solutionImageCid, setSolutionImageCid] = useState<string>(exercise.i || '');

  const uploadFileToIPFS = async (file: File): Promise<string> => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      return await getIPFSContentIDForBytesAndPinIt(ipfs, bytes);
    } catch (error) {
      throw new Error('Failed to upload file to IPFS');
    }
  };

  const updateExercise = (updatedExercise: Exercise) => {
    const updatedExercises = [...(skill.q || [])];
    updatedExercises[index] = updatedExercise;
    onSkillChange({ ...skill, q: updatedExercises });
  };

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>, type: 'exercise' | 'solution') => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file && isIpfsReady) {
      try {
        const cid = await uploadFileToIPFS(file);
        if (type === 'exercise') {
          setExerciseImageCid(cid);
          updateExercise({ ...exercise, p: cid });
        } else {
          setSolutionImageCid(cid);
          updateExercise({ ...exercise, i: cid });
        }
      } catch (error) {
        console.error('Error handling image upload:', error);
      }
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
      setExerciseImageCid('');
      updateExercise({ ...exercise, p: '' });
    } else {
      setSolutionImageCid('');
      updateExercise({ ...exercise, i: '' });
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
        {exerciseImageCid && (
          <ImageContainer>
            <ResizableImage cid={exerciseImageCid} alt="Exercise" />
            <StyledDeleteButton label="" icon="trash" onClick={() => handleDeleteImage('exercise')} />
          </ImageContainer>
        )}
        <input
          type="file"
          onChange={(e) => handleImageChange(e, 'exercise')}
          accept="image/*"
          disabled={!isIpfsReady}
        />
        {!isIpfsReady && <ErrorMessage>{t('IPFS is not ready. Please wait...')}</ErrorMessage>}
      </ImageUploadContainer>

      <TextAreaWithPreview
        label={t('Solution')}
        seed={exercise.a}
        onChange={onEditSolutionText}
      />
      <ImageUploadContainer>
        {solutionImageCid && (
          <ImageContainer>
            <ResizableImage cid={solutionImageCid} alt="Solution" />
            <StyledDeleteButton label="" icon="trash" onClick={() => handleDeleteImage('solution')} />
          </ImageContainer>
        )}
        <input
          type="file"
          onChange={(e) => handleImageChange(e, 'solution')}
          accept="image/*"
          disabled={!isIpfsReady}
        />
        {!isIpfsReady && <ErrorMessage>{t('IPFS is not ready. Please wait...')}</ErrorMessage>}
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

const ErrorMessage = styled.div`
  color: red;
  margin-top: 5px;
`;

export default React.memo(ExerciseEditor);
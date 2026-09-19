import React, { useEffect, useRef, useState, ChangeEvent, FC } from 'react';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Exercise, Skill, useIpfsContext } from '@slonigiraf/slonig-components';
import ExerciseImage, { isLocalOrRemoteImageUrl } from './ExerciseImage.js';
import { getIPFSBytesFromContentID, getIPFSContentIDForBytesAndPinIt } from '@slonigiraf/slonig-components';
import TextAreaWithPreview from './TextAreaWithPreview.js';
import TikzVisual from './TikzVisual.js';
import { DEFAULT_TIKZ_SOURCE, extractTikzSourceFromSvg } from './tikz.js';

interface Props {
  className?: string;
  exercise: Exercise;
  index: number;
  skill: Skill;
  onSkillChange: (updatedList: { q?: Exercise[] }) => void;
}

type ImageType = 'exercise' | 'solution';
type TikzSourceState = string | null | undefined;

interface TikzEditorState {
  source: string;
  type: ImageType;
}

// Keep freshly-created TikZ sources available across ExerciseEditor remounts.
// Full reloads recover the same source from the SVG metadata on IPFS.
const tikzSourceCache = new Map<string, string>();

const ExerciseEditor: FC<Props> = ({ className = '', exercise, index, skill, onSkillChange }) => {
  const { t } = useTranslation();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [exerciseImageCid, setExerciseImageCid] = useState<string>(exercise.p || '');
  const [solutionImageCid, setSolutionImageCid] = useState<string>(exercise.i || '');
  const [exerciseTikzSource, setExerciseTikzSource] = useState<TikzSourceState>(exercise.p ? undefined : null);
  const [solutionTikzSource, setSolutionTikzSource] = useState<TikzSourceState>(exercise.i ? undefined : null);
  const [tikzEditor, setTikzEditor] = useState<TikzEditorState>();
  const exerciseFileInputRef = useRef<HTMLInputElement>(null);
  const solutionFileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    let cancelled = false;

    const inspectTikzSource = async (
      value: string,
      setSource: React.Dispatch<React.SetStateAction<TikzSourceState>>
    ): Promise<void> => {
      if (!value || isLocalOrRemoteImageUrl(value)) {
        if (!cancelled) {
          setSource(null);
        }
        return;
      }

      const cachedSource = tikzSourceCache.get(value);

      if (cachedSource !== undefined) {
        if (!cancelled) {
          setSource(cachedSource);
        }
        return;
      }

      if (!isIpfsReady) {
        if (!cancelled) {
          setSource(undefined);
        }
        return;
      }

      if (!cancelled) {
        setSource(undefined);
      }

      try {
        // Image assets are stored with ipfs.add(), so they must be read via
        // ipfs.cat()/the byte helper rather than the DAG-text helper used for
        // knowledge JSON. Decode only after retrieving the raw SVG bytes.
        const bytes = await getIPFSBytesFromContentID(ipfs, value);
        const svg = new TextDecoder('utf-8').decode(bytes);
        const source = extractTikzSourceFromSvg(svg);

        if (source !== undefined) {
          tikzSourceCache.set(value, source);
        }

        if (!cancelled) {
          setSource(source ?? null);
        }
      } catch {
        // Ordinary binary images are not expected to decode as SVG text. They
        // remain valid images; they simply do not have an editable TikZ source.
        if (!cancelled) {
          setSource(null);
        }
      }
    };

    void inspectTikzSource(exerciseImageCid, setExerciseTikzSource);
    void inspectTikzSource(solutionImageCid, setSolutionTikzSource);

    return () => {
      cancelled = true;
    };
  }, [exerciseImageCid, ipfs, isIpfsReady, solutionImageCid]);

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>, type: ImageType) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file && isIpfsReady) {
      try {
        const cid = await uploadFileToIPFS(file);
        if (type === 'exercise') {
          setExerciseImageCid(cid);
          setExerciseTikzSource(null);
          updateExercise({ ...exercise, p: cid });
        } else {
          setSolutionImageCid(cid);
          setSolutionTikzSource(null);
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

  const handleDeleteImage = (type: ImageType) => {
    if (type === 'exercise') {
      setExerciseImageCid('');
      setExerciseTikzSource(null);
      updateExercise({ ...exercise, p: '' });
    } else {
      setSolutionImageCid('');
      setSolutionTikzSource(null);
      updateExercise({ ...exercise, i: '' });
    }
  };

  const openTikzEditor = (type: ImageType): void => {
    const existingSource = type === 'exercise' ? exerciseTikzSource : solutionTikzSource;

    // `undefined` means an existing IPFS asset is still being inspected.
    if (existingSource === undefined) {
      return;
    }

    setTikzEditor({
      source: existingSource ?? DEFAULT_TIKZ_SOURCE,
      type
    });
  };

  const saveTikz = async (source: string): Promise<void> => {
    if (!isIpfsReady || !tikzEditor) {
      throw new Error('IPFS is not ready. Please wait...');
    }

    const { renderTikzToSvg } = await import('./TikzDisplay.js');
    const svg = await renderTikzToSvg(source);
    const bytes = new TextEncoder().encode(svg);
    const cid = await getIPFSContentIDForBytesAndPinIt(ipfs, bytes);

    tikzSourceCache.set(cid, source);

    if (tikzEditor.type === 'exercise') {
      setExerciseImageCid(cid);
      setExerciseTikzSource(source);
      updateExercise({ ...exercise, p: cid });
    } else {
      setSolutionImageCid(cid);
      setSolutionTikzSource(source);
      updateExercise({ ...exercise, i: cid });
    }
  };

  const tikzButton = (type: ImageType, source: TikzSourceState): React.ReactElement => {
    const isEditableTikz = source !== null && source !== undefined;

    return <Button
      icon={isEditableTikz ? 'edit' : 'plus'}
      isDisabled={!isIpfsReady || source === undefined}
      label={source === undefined ? t('Checking...') : isEditableTikz ? t('Edit') : t('Create')}
      onClick={() => openTikzEditor(type)}
    />;
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
            <ExerciseImage value={exerciseImageCid} alt="Exercise" />
            <StyledDeleteButton label="" icon="trash" onClick={() => handleDeleteImage('exercise')} />
          </ImageContainer>
        )}
        <UploadActions>
          <Button
            icon='upload'
            isDisabled={!isIpfsReady}
            label={t('Choose File')}
            onClick={() => exerciseFileInputRef.current?.click()}
          />
          <HiddenFileInput
            key={exerciseImageCid}
            accept='image/*'
            onChange={(e) => handleImageChange(e, 'exercise')}
            ref={exerciseFileInputRef}
            type='file'
          />
          {tikzButton('exercise', exerciseTikzSource)}
        </UploadActions>
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
            <ExerciseImage value={solutionImageCid} alt="Solution" />
            <StyledDeleteButton label="" icon="trash" onClick={() => handleDeleteImage('solution')} />
          </ImageContainer>
        )}
        <UploadActions>
          <Button
            icon='upload'
            isDisabled={!isIpfsReady}
            label={t('Choose File')}
            onClick={() => solutionFileInputRef.current?.click()}
          />
          <HiddenFileInput
            key={solutionImageCid}
            accept='image/*'
            onChange={(e) => handleImageChange(e, 'solution')}
            ref={solutionFileInputRef}
            type='file'
          />
          {tikzButton('solution', solutionTikzSource)}
        </UploadActions>
        {!isIpfsReady && <ErrorMessage>{t('IPFS is not ready. Please wait...')}</ErrorMessage>}
      </ImageUploadContainer>

      {tikzEditor && <TikzVisual
        alt={tikzEditor.type === 'exercise' ? 'Exercise' : 'Solution'}
        editorTitle={`${(tikzEditor.type === 'exercise' ? exerciseTikzSource : solutionTikzSource) ? t('Edit') : t('Create')} ${tikzEditor.type === 'exercise' ? t('Exercise') : t('Solution')}`}
        isEditorShownInitially
        onEditorClose={() => setTikzEditor(undefined)}
        onSave={saveTikz}
        showPreview={false}
        value={tikzEditor.source}
      />}
    </div>
  );
};

const ImageContainer = styled.div`
  position: relative;
  display: inline-block;
  margin-right: 10px;
  width: 150px;
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

const UploadActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const ErrorMessage = styled.div`
  color: red;
  margin-top: 5px;
`;

export default React.memo(ExerciseEditor);

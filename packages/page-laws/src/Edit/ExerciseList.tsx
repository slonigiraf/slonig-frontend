import React, { useCallback, useState } from 'react';
import { Button, Icon, Modal, styled } from '@polkadot/react-components';
import { useTranslation } from '../common/translate.js';
import { Exercise, SpanWithTags, useLog } from '@slonigiraf/slonig-components';
import ExerciseImage, { isLocalOrRemoteImageUrl } from './ExerciseImage.js';
import KnowledgeResizableImage from './KnowledgeResizableImage.js';
import { isTikzCode } from './tikz.js';

const TikzDisplay = React.lazy(() => import('./TikzDisplay.js'));
const TikzVisual = React.lazy(() => import('./TikzVisual.js'));

export type ExerciseListLocation = 'ability_info' | 'item_preview' | 'view_list' | 'example_exercises' | 'example_solutions';


const isGeneratedAbilityVisual = (value: string): boolean => {
    const trimmed = value.trim();

    return isLocalOrRemoteImageUrl(trimmed) || /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/i.test(trimmed);
};

type AbilityExerciseWithPrompts = Exercise & { iError?: boolean; iPrompt?: string; pError?: boolean; pPrompt?: string };

/** The delete control is kept outside the zoom target so a click cannot
 * accidentally open the image preview instead of its confirmation dialog. */
const DeletableAbilityVisual: React.FC<{ alt: string; children: React.ReactNode; onDelete?: () => Promise<void> }> = ({ alt, children, onDelete }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const confirmDelete = useCallback(async (): Promise<void> => {
        if (!onDelete || isDeleting) return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            await onDelete();
            setIsConfirming(false);
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : 'Unable to delete the image.');
        } finally {
            setIsDeleting(false);
        }
    }, [isDeleting, onDelete]);

    if (!onDelete) return <>{children}</>;

    return <AbilityVisualWithDelete>
        {children}
        <button
            aria-label={`Delete ${alt.toLowerCase()} image`}
            className='abilityImageDeleteButton'
            disabled={isDeleting}
            onClick={() => { setDeleteError(''); setIsConfirming(true); }}
            title={`Delete ${alt.toLowerCase()} image`}
            type='button'
        ><Icon icon='trash' /></button>
        {isConfirming && <Modal
            header={`Delete ${alt.toLowerCase()} image?`}
            onClose={() => { if (!isDeleting) setIsConfirming(false); }}
            size='small'
        >
            <Modal.Content>
                <p>Delete this image and remove its link and image-generation prompt from the Ability exercise? This cannot be undone.</p>
                {deleteError && <p role='alert' className='abilityImageDeleteError'>{deleteError}</p>}
                <Button.Group>
                    <Button icon='times' isDisabled={isDeleting} label='Cancel' onClick={() => setIsConfirming(false)} />
                    <Button icon='trash' isDisabled={isDeleting} label={isDeleting ? 'Deleting…' : 'Delete image'} onClick={() => { void confirmDelete(); }} />
                </Button.Group>
            </Modal.Content>
        </Modal>}
    </AbilityVisualWithDelete>;
};

const ExerciseVisual: React.FC<{ alt: string; hasCompileError?: boolean; isAbilityInfo: boolean; label: string; onCompileStateChange?: (hasError: boolean, renderedValue: string) => Promise<void> | void; onDelete?: () => Promise<void>; onEditorClose?: () => void; onSave?: (value: string) => Promise<void>; prompt?: string; value: string; qaIssues?: string[] }> = ({ alt, hasCompileError = false, isAbilityInfo, label, onCompileStateChange, onDelete, onEditorClose, onSave, prompt, qaIssues, value }) => {
    if (!value.trim()) {
        const promptOnly = isAbilityInfo ? prompt?.trim() ?? '' : '';

        return promptOnly
            ? <DeletableAbilityVisual alt={alt} onDelete={onDelete}><VisualPrompt><strong>{label}:</strong> <SpanWithTags content={promptOnly} /></VisualPrompt></DeletableAbilityVisual>
            : null;
    }

    const visiblePrompt = isAbilityInfo
        ? (prompt?.trim() || (!isTikzCode(value) && !isGeneratedAbilityVisual(value) ? value.trim() : ''))
        : '';
    // Both question and answer image prompts belong in the zoomed view, not
    // below the thumbnail. A prompt without an image stays visible inline.
    const hasZoomableImage = isAbilityInfo && (isTikzCode(value) || isGeneratedAbilityVisual(value));
    const promptElement = visiblePrompt
        ? <VisualPrompt><strong>{label}:</strong> <SpanWithTags content={visiblePrompt} /></VisualPrompt>
        : null;
    const expandedPrompt = hasZoomableImage ? promptElement : null;

    if (isTikzCode(value)) {
        return <>
            <DeletableAbilityVisual alt={alt} onDelete={onDelete}>
                <div className={qaIssues?.length ? 'tikzQaFailed' : undefined} title={qaIssues?.join(' | ')}>
                    {qaIssues?.length ? <small className='tikzQaFailedLabel'>Visual QA failed — {qaIssues[0]}</small> : null}
                    <React.Suspense fallback={<small>Loading image…</small>}>
                        {isAbilityInfo
                            ? <TikzVisual alt={alt} expandedPrompt={expandedPrompt} hasCompileError={hasCompileError} onCompileStateChange={onCompileStateChange} onEditorClose={onEditorClose} onSave={onSave} value={value} />
                            : <TikzDisplay alt={alt} hasCompileError={hasCompileError} onCompileStateChange={onCompileStateChange} value={value} />}
                    </React.Suspense>
                </div>
            </DeletableAbilityVisual>
            {!hasZoomableImage && promptElement}
        </>;
    }

    if (!isAbilityInfo) {
        return <ExerciseImage alt={alt} value={value} />;
    }

    if (isGeneratedAbilityVisual(value)) {
        const imageValue = value.trim();

        return <>
            <DeletableAbilityVisual alt={alt} onDelete={onDelete}>
                {isLocalOrRemoteImageUrl(imageValue)
                    ? <KnowledgeResizableImage alt={alt} expandedPrompt={expandedPrompt} src={imageValue} />
                    : <KnowledgeResizableImage alt={alt} cid={imageValue} expandedPrompt={expandedPrompt} />}
            </DeletableAbilityVisual>
            {!hasZoomableImage && promptElement}
        </>;
    }

    return <DeletableAbilityVisual alt={alt} onDelete={onDelete}><VisualPrompt><strong>{label}:</strong> <SpanWithTags content={visiblePrompt || value} /></VisualPrompt></DeletableAbilityVisual>;
};

interface ExerciseListProps {
    exercises: Exercise[];
    areShownInitially?: boolean;
    isPreview?: boolean;
    location?: ExerciseListLocation;
    onEditExercise?: (exerciseIndex: number) => void;
    isExerciseEditDisabled?: boolean;
    onAbilityVisualErrorChange?: (exerciseIndex: number, field: 'p' | 'i', hasError: boolean, value: string) => Promise<void> | void;
    onAbilityVisualSave?: (exerciseIndex: number, field: 'p' | 'i', value: string) => Promise<void>;
    onAbilityVisualDelete?: (exerciseIndex: number, field: 'p' | 'i') => Promise<void>;
    onAbilityVisualEditorClose?: () => void;
    visualIssues?: Record<string, string[]>;
}

const ExerciseList: React.FC<ExerciseListProps> = ({ exercises, areShownInitially = false, isPreview = false, location = 'default', onEditExercise, isExerciseEditDisabled = false, onAbilityVisualErrorChange, onAbilityVisualSave, onAbilityVisualDelete, onAbilityVisualEditorClose, visualIssues }) => {
    const [areAnswersShown, setAreAnswersShown] = useState(areShownInitially);
    const { t } = useTranslation();
    const { logEvent } = useLog();

    const exercise = exercises[0];
    const isAbilityInfo = location === 'ability_info';
    const ExercisesContainer = isAbilityInfo ? AbilityExercisesGrid : React.Fragment;

    const toggleAreAnswersShown = useCallback(() => {
        if (!areAnswersShown) {
            logEvent('EXAMPLES', 'SHOW_ANSWERS', `show_answers_at_${location}`);
        }
        setAreAnswersShown(!areAnswersShown);
    }, [areAnswersShown]);


    return (
        isPreview ?
            <div className='ui--row'
                style={{
                    alignItems: 'center'
                }}
            >
                <div className="exercise-display">
                    <div className="exercise-header">
                        <span><SpanWithTags content={exercise.h} /></span>
                        {(exercise.p || (location === 'ability_info' && (exercise as AbilityExerciseWithPrompts).pPrompt)) && <ExerciseDetails><ExerciseVisual alt='Question' hasCompileError={(exercise as AbilityExerciseWithPrompts).pError === true} isAbilityInfo={location === 'ability_info'} label='Question visual prompt' onCompileStateChange={onAbilityVisualErrorChange ? (hasError, renderedValue) => onAbilityVisualErrorChange(0, 'p', hasError, renderedValue) : undefined} onDelete={onAbilityVisualDelete ? () => onAbilityVisualDelete(0, 'p') : undefined} onEditorClose={onAbilityVisualEditorClose} onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(0, 'p', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).pPrompt} qaIssues={visualIssues?.['0-p']} value={exercise.p} /></ExerciseDetails>}
                    </div>
                </div>
            </div>
            :
            <ExercisesContainer>
                {exercises.map((exercise, index) => (
                    <div className={`ui--row${isAbilityInfo && onEditExercise ? ' abilityExerciseEditable' : ''}`} key={index}
                        style={{
                            alignItems: 'center',
                            marginBottom: '10px',
                        }}
                    >
                        {isAbilityInfo && onEditExercise && <button
                            aria-label={`Edit exercise ${index + 1}`}
                            className='abilityExerciseEditButton'
                            disabled={isExerciseEditDisabled}
                            onClick={() => onEditExercise(index)}
                            title={`Edit exercise ${index + 1}`}
                            type='button'
                        ><Icon icon='edit' /></button>}
                        <div className="exercise-display">
                            <div className="exercise-header">
                                <span><SpanWithTags content={isAbilityInfo ? exercise.h : ` ${index + 1}. ` + exercise.h} /></span>
                                {(exercise.p || (location === 'ability_info' && (exercise as AbilityExerciseWithPrompts).pPrompt)) && <ExerciseDetails><ExerciseVisual alt='Question' hasCompileError={(exercise as AbilityExerciseWithPrompts).pError === true} isAbilityInfo={location === 'ability_info'} label='Question visual prompt' onCompileStateChange={onAbilityVisualErrorChange ? (hasError, renderedValue) => onAbilityVisualErrorChange(index, 'p', hasError, renderedValue) : undefined} onDelete={onAbilityVisualDelete ? () => onAbilityVisualDelete(index, 'p') : undefined} onEditorClose={onAbilityVisualEditorClose} onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(index, 'p', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).pPrompt} qaIssues={visualIssues?.[`${index}-p`]} value={exercise.p} /></ExerciseDetails>}
                            </div>

                            {location !== 'example_exercises' && <Answer className={isAbilityInfo ? 'abilityAnswer' : undefined}>
                                {!isAbilityInfo && <span>
                                    <Button
                                        icon={areAnswersShown ? 'eye-slash' : 'eye'}
                                        onClick={toggleAreAnswersShown}
                                        label={areAnswersShown ? t('Solution') : t('See the solution')}
                                    />
                                </span>}
                                {(isAbilityInfo || areAnswersShown) && (
                                    <>
                                        <SpanWithTags content={exercise.a} />
                                        {(exercise.i || (location === 'ability_info' && (exercise as AbilityExerciseWithPrompts).iPrompt)) && <ExerciseVisual alt='Solution' hasCompileError={(exercise as AbilityExerciseWithPrompts).iError === true} isAbilityInfo={location === 'ability_info'} label='Answer visual prompt' onCompileStateChange={onAbilityVisualErrorChange ? (hasError, renderedValue) => onAbilityVisualErrorChange(index, 'i', hasError, renderedValue) : undefined} onDelete={onAbilityVisualDelete ? () => onAbilityVisualDelete(index, 'i') : undefined} onEditorClose={onAbilityVisualEditorClose} onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(index, 'i', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).iPrompt} qaIssues={visualIssues?.[`${index}-i`]} value={exercise.i} />}
                                    </>
                                )}
                            </Answer>}
                        </div>
                    </div>
                ))}
            </ExercisesContainer>
    );
}

const AbilityVisualWithDelete = styled.div`
  box-sizing: border-box;
  display: inline-block;
  max-width: 100%;
  padding-left: 1.55rem;
  position: relative;
  vertical-align: top;
  width: 100%;

  .abilityImageDeleteButton {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 0.3rem;
    top: 0.25rem;
    color: var(--color-text, #555);
    cursor: pointer;
    display: inline-flex;
    height: 1.45rem;
    justify-content: center;
    padding: 0;
    position: absolute;
    left: 0.05rem;
    width: 1.45rem;
    z-index: 2;

    .ui--Icon {
      height: 0.85rem;
      margin: 0 !important;
      padding: 0;
      width: 0.85rem;
    }

    &:hover:not(:disabled) { background: var(--bg-menu, #f3f3f3); }
    &:focus-visible { outline: 2px solid var(--color-primary, #1682d4); outline-offset: 2px; }
    &:disabled { cursor: not-allowed; opacity: 0.5; }
  }

  .abilityImageDeleteError { color: #b52626; }
`;

const AbilityExercisesGrid = styled.div`
  .tikzQaFailed {
    border: 2px solid #c93333;
    border-radius: 0.5rem;
    box-shadow: 0 0 0 1px rgba(201, 51, 51, 0.12);
    padding: 0.6rem;
  }

  .tikzQaFailedLabel {
    color: #ad2424;
    display: block;
    font-weight: 600;
    margin-bottom: 0.4rem;
    overflow-wrap: anywhere;
  }

  /* Scale landscape visuals to the exercise's width and portrait visuals to
     the viewport's available height. Neither needs a fixed 150px thumbnail. */
  --ability-visual-max-height: min(40dvh, 26rem);

  align-items: start;
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 21rem), 1fr));
  max-width: 60rem;

  .exercise-header img,
  .abilityAnswer img {
    box-sizing: border-box;
    display: block;
    height: auto;
    max-height: var(--ability-visual-max-height);
    max-width: 100%;
    object-fit: contain;
    width: min(100%, calc(var(--ability-visual-max-height) * var(--ability-visual-ratio, 1)));
  }

  .tikzVisualRoot,
  .tikzVisualPreviewBlock,
  .tikzVisualPreviewRow {
    max-width: 100%;
    width: 100%;
  }

  .tikzVisualThumbnail {
    flex: 1 1 auto;
    max-width: 100%;
    min-width: 0;
    width: 100%;
  }

  .exercise-header .tikzDisplay--thumbnail,
  .abilityAnswer .tikzDisplay--thumbnail {
    box-sizing: border-box;
    height: auto;
    max-height: var(--ability-visual-max-height);
    max-width: 100%;
    min-height: 0;
    width: min(100%, calc(var(--ability-visual-max-height) * var(--ability-visual-ratio, 1)));
  }

  .exercise-header .tikzDisplay--thumbnail > svg,
  .exercise-header .tikzDisplay--thumbnail > * > svg,
  .abilityAnswer .tikzDisplay--thumbnail > svg,
  .abilityAnswer .tikzDisplay--thumbnail > * > svg {
    height: auto;
    max-height: var(--ability-visual-max-height);
    max-width: 100%;
    width: 100%;
  }

  > .ui--row {
    align-items: stretch !important;
    border: 1px solid var(--border-table);
    border-radius: 0.4rem;
    box-sizing: border-box;
    margin-bottom: 0 !important;
    overflow-wrap: anywhere;
    padding: 0.75rem;
    min-width: 0;
    width: 100%;
  }

  > .abilityExerciseEditable {
    position: relative;
  }

  .abilityExerciseEditButton {
    align-items: center;
    background: var(--bg-input, #fff);
    border: 1px solid var(--border-table, #d4d4d5);
    border-radius: 0.4rem;
    color: var(--color-text);
    cursor: pointer;
    display: inline-flex;
    font-size: 1rem;
    height: 2.25rem;
    justify-content: center;
    padding: 0;
    position: absolute;
    right: 0.5rem;
    top: 0.5rem;
    width: 2.25rem;
    z-index: 1;
  }

  .abilityExerciseEditButton:hover:not(:disabled) {
    background: var(--bg-menu, #f3f3f3);
  }

  .abilityExerciseEditButton:focus-visible {
    outline: 2px solid var(--color-primary, #1682d4);
    outline-offset: 2px;
  }

  .abilityExerciseEditButton:disabled {
    cursor: default;
    opacity: 0.45;
  }

  /* The edit control sits inside the exercise; keep the heading clear of it. */
  .abilityExerciseEditable .exercise-header {
    padding-right: 3.25rem;
  }

  > .ui--row > .exercise-display {
    box-sizing: border-box;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    width: 100%;
  }

  .exercise-header {
    flex: 0 0 auto;
    min-width: 0;
  }

  .abilityAnswer {
    margin-top: 0.75rem;
  }
`;

const ExerciseDetails = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
  padding-left: 0.75rem;
`;
const VisualPrompt = styled.small`
  display: block;
  margin-top: 0.35rem;
`;
const Answer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
  padding-left: 0.75rem;

  &.abilityAnswer {
    /* Highlight the answer with its border, without changing its background. */
    border: 1px solid #A9A9A9;
    border-radius: 0.4rem;
    box-sizing: border-box;
    margin-top: 0.75rem;
    padding: 0.75rem;
  }
`;
export default ExerciseList;

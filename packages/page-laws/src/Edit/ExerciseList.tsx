import React, { useCallback, useState } from 'react';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Exercise, KatexSpan, useLog } from '@slonigiraf/slonig-components';
import ExerciseImage, { isLocalOrRemoteImageUrl } from './ExerciseImage.js';
import { isTikzCode } from './tikz.js';

const TikzDisplay = React.lazy(() => import('./TikzDisplay.js'));
const TikzVisual = React.lazy(() => import('./TikzVisual.js'));

export type ExerciseListLocation = 'ability_info' | 'item_preview' | 'view_list' | 'example_exercises' | 'example_solutions';


const isGeneratedAbilityVisual = (value: string): boolean => {
    const trimmed = value.trim();

    return isLocalOrRemoteImageUrl(trimmed) || /^(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,})$/i.test(trimmed);
};

type AbilityExerciseWithPrompts = Exercise & { iError?: boolean; iPrompt?: string; pError?: boolean; pPrompt?: string };

const ExerciseVisual: React.FC<{ alt: string; hasCompileError?: boolean; isAbilityInfo: boolean; label: string; onCompileStateChange?: (hasError: boolean) => Promise<void> | void; onSave?: (value: string) => Promise<void>; prompt?: string; value: string }> = ({ alt, hasCompileError = false, isAbilityInfo, label, onCompileStateChange, onSave, prompt, value }) => {
    if (!value.trim()) {
        const promptOnly = isAbilityInfo ? prompt?.trim() ?? '' : '';

        return promptOnly
            ? <VisualPrompt><strong>{label}:</strong> <KatexSpan content={promptOnly} /></VisualPrompt>
            : null;
    }

    const visiblePrompt = isAbilityInfo
        ? (prompt?.trim() || (!isTikzCode(value) && !isGeneratedAbilityVisual(value) ? value.trim() : ''))
        : '';

    if (isTikzCode(value)) {
        return <>
            <React.Suspense fallback={<small>Loading TikZ renderer…</small>}>
                {isAbilityInfo
                    ? <TikzVisual alt={alt} hasCompileError={hasCompileError} onCompileStateChange={onCompileStateChange} onSave={onSave} value={value} />
                    : <TikzDisplay alt={alt} hasCompileError={hasCompileError} onCompileStateChange={onCompileStateChange} value={value} />}
            </React.Suspense>
            {visiblePrompt && <VisualPrompt><strong>{label}:</strong> <KatexSpan content={visiblePrompt} /></VisualPrompt>}
        </>;
    }

    if (!isAbilityInfo) {
        return <ExerciseImage alt={alt} value={value} />;
    }

    if (isGeneratedAbilityVisual(value)) {
        return <>
            <ExerciseImage alt={alt} value={value} />
            {visiblePrompt && <VisualPrompt><strong>{label}:</strong> <KatexSpan content={visiblePrompt} /></VisualPrompt>}
        </>;
    }

    return <VisualPrompt><strong>{label}:</strong> <KatexSpan content={visiblePrompt || value} /></VisualPrompt>;
};

interface ExerciseListProps {
    exercises: Exercise[];
    areShownInitially?: boolean;
    isPreview?: boolean;
    location?: ExerciseListLocation;
    onAbilityVisualErrorChange?: (exerciseIndex: number, field: 'p' | 'i', hasError: boolean) => Promise<void> | void;
    onAbilityVisualSave?: (exerciseIndex: number, field: 'p' | 'i', value: string) => Promise<void>;
}

const ExerciseList: React.FC<ExerciseListProps> = ({ exercises, areShownInitially = false, isPreview = false, location = 'default', onAbilityVisualErrorChange, onAbilityVisualSave }) => {
    const [areAnswersShown, setAreAnswersShown] = useState(areShownInitially);
    const { t } = useTranslation();
    const { logEvent } = useLog();

    const exercise = exercises[0];

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
                        <span><KatexSpan content={exercise.h} /></span>
                        {(exercise.p || (location === 'ability_info' && (exercise as AbilityExerciseWithPrompts).pPrompt)) && <ExerciseDetails><ExerciseVisual alt='Question' hasCompileError={(exercise as AbilityExerciseWithPrompts).pError === true} isAbilityInfo={location === 'ability_info'} label='Question visual prompt' onCompileStateChange={onAbilityVisualErrorChange ? (hasError) => onAbilityVisualErrorChange(0, 'p', hasError) : undefined} onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(0, 'p', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).pPrompt} value={exercise.p} /></ExerciseDetails>}
                    </div>
                </div>
            </div>
            :
            <>
                {exercises.map((exercise, index) => (
                    <div className='ui--row' key={index}
                        style={{
                            alignItems: 'center',
                            marginBottom: '10px',
                        }}
                    >
                        <div className="exercise-display">
                            <div className="exercise-header">
                                <span><KatexSpan content={` ${index + 1}. ` + exercise.h} /></span>
                                {(exercise.p || (location === 'ability_info' && (exercise as AbilityExerciseWithPrompts).pPrompt)) && <ExerciseDetails><ExerciseVisual alt='Question' hasCompileError={(exercise as AbilityExerciseWithPrompts).pError === true} isAbilityInfo={location === 'ability_info'} label='Question visual prompt' onCompileStateChange={onAbilityVisualErrorChange ? (hasError) => onAbilityVisualErrorChange(index, 'p', hasError) : undefined} onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(index, 'p', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).pPrompt} value={exercise.p} /></ExerciseDetails>}
                            </div>

                            {location !== 'example_exercises' && <Answer>
                                <span>
                                    <Button
                                        icon={areAnswersShown ? 'eye-slash' : 'eye'}
                                        onClick={toggleAreAnswersShown}
                                        label={areAnswersShown ? t('Solution') : t('See the solution')}
                                    />
                                </span>
                                {areAnswersShown && (
                                    <>
                                        <KatexSpan content={exercise.a} />
                                        {(exercise.i || (location === 'ability_info' && (exercise as AbilityExerciseWithPrompts).iPrompt)) && <ExerciseVisual alt='Solution' hasCompileError={(exercise as AbilityExerciseWithPrompts).iError === true} isAbilityInfo={location === 'ability_info'} label='Answer visual prompt' onCompileStateChange={onAbilityVisualErrorChange ? (hasError) => onAbilityVisualErrorChange(index, 'i', hasError) : undefined} onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(index, 'i', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).iPrompt} value={exercise.i} />}
                                    </>
                                )}
                            </Answer>}
                        </div>
                    </div>
                ))}
            </>
    );
}

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
`;
export default ExerciseList;

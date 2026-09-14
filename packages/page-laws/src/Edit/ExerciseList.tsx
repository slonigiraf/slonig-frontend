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

type AbilityExerciseWithPrompts = Exercise & { iPrompt?: string; pPrompt?: string };

const ExerciseVisual: React.FC<{ alt: string; isAbilityInfo: boolean; label: string; onSave?: (value: string) => Promise<void>; prompt?: string; value: string }> = ({ alt, isAbilityInfo, label, onSave, prompt, value }) => {
    const [areDetailsShown, setAreDetailsShown] = useState(false);
    const toggleDetails = useCallback((): void => setAreDetailsShown((shown) => !shown), []);

    if (!value.trim()) {
        return null;
    }

    if (isTikzCode(value)) {
        return <React.Suspense fallback={<small>Loading TikZ renderer…</small>}>
            {isAbilityInfo
                ? <TikzVisual alt={alt} onSave={onSave} prompt={prompt} value={value} />
                : <TikzDisplay alt={alt} value={value} />}
        </React.Suspense>;
    }

    if (!isAbilityInfo) {
        return <ExerciseImage alt={alt} value={value} />;
    }

    if (isGeneratedAbilityVisual(value)) {
        return <>
            <ExerciseImage alt={alt} value={value} />
            {prompt?.trim() && <>
                <Button
                    icon={areDetailsShown ? 'eye-slash' : 'eye'}
                    label={areDetailsShown ? 'Hide visual prompt' : 'Show visual prompt'}
                    onClick={toggleDetails}
                />
                {areDetailsShown && <small>{label}: <KatexSpan content={prompt} /></small>}
            </>}
        </>;
    }

    return <>
        <Button
            icon={areDetailsShown ? 'eye-slash' : 'eye'}
            label={areDetailsShown ? 'Hide visual prompt' : 'Show visual prompt'}
            onClick={toggleDetails}
        />
        {areDetailsShown && <small>{label}: <KatexSpan content={value} /></small>}
    </>;
};

interface ExerciseListProps {
    exercises: Exercise[];
    areShownInitially?: boolean;
    isPreview?: boolean;
    location?: ExerciseListLocation;
    onAbilityVisualSave?: (exerciseIndex: number, field: 'p' | 'i', value: string) => Promise<void>;
}

const ExerciseList: React.FC<ExerciseListProps> = ({ exercises, areShownInitially = false, isPreview = false, location = 'default', onAbilityVisualSave }) => {
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
                        {exercise.p && <ExerciseDetails><ExerciseVisual alt='Question' isAbilityInfo={location === 'ability_info'} label='Question visual prompt' onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(0, 'p', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).pPrompt} value={exercise.p} /></ExerciseDetails>}
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
                                {exercise.p && <ExerciseDetails><ExerciseVisual alt='Question' isAbilityInfo={location === 'ability_info'} label='Question visual prompt' onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(index, 'p', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).pPrompt} value={exercise.p} /></ExerciseDetails>}
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
                                        {exercise.i && <ExerciseVisual alt='Solution' isAbilityInfo={location === 'ability_info'} label='Answer visual prompt' onSave={onAbilityVisualSave ? (value) => onAbilityVisualSave(index, 'i', value) : undefined} prompt={(exercise as AbilityExerciseWithPrompts).iPrompt} value={exercise.i} />}
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
const Answer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
  padding-left: 0.75rem;
`;
export default ExerciseList;

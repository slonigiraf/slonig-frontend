import React, { useCallback, useState } from 'react';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Exercise, ResizableImage, KatexSpan, useLog } from '@slonigiraf/slonig-components';

interface ExerciseListProps {
    exercises: Exercise[];
    areShownInitially?: boolean;
    isPreview?: boolean;
    location?: string;
}

const ExerciseList: React.FC<ExerciseListProps> = ({ exercises, areShownInitially = false, isPreview = false, location = 'default' }) => {
    const [areAnswersShown, setAreAnswersShown] = useState(areShownInitially);
    const { t } = useTranslation();
    const { logEvent } = useLog();

    const exercise = exercises[0];

    const toggleAreAnswersShown = useCallback(() => {
        if(!areAnswersShown){
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
                        {exercise.p && <ExerciseDetails><ResizableImage cid={exercise.p} /></ExerciseDetails>}
                    </div>
                </div>
            </div>
            :
            <>
                {exercises.map((exercise, index) => (
                    <div className='ui--row' key={index}
                        style={{
                            alignItems: 'center'
                        }}
                    >
                        <div className="exercise-display">
                            <div className="exercise-header">
                                <span><KatexSpan content={` ${index + 1}. ` + exercise.h} /></span>
                                {exercise.p && <ExerciseDetails><ResizableImage cid={exercise.p} /></ExerciseDetails>}
                            </div>

                            <Answer>
                                <span>
                                    <Button
                                        onClick={toggleAreAnswersShown}
                                        label={areAnswersShown ? t('Hide the solution') : t('See the solution')}
                                    />
                                </span>
                                {areAnswersShown && (
                                    <>
                                        <KatexSpan content={exercise.a} />
                                        {exercise.i && <ResizableImage cid={exercise.i} />}
                                    </>
                                )}
                            </Answer>
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
import React, { useState } from 'react';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Exercise, ResizableImage, KatexSpan } from '@slonigiraf/app-slonig-components';

interface ExerciseListProps {
    exercises: Exercise[];
    areShownInitially?: boolean;
}

const ExerciseList: React.FC<ExerciseListProps> = ({ exercises, areShownInitially = false }) => {
    const [shownAnswers, setShownAnswers] = useState<boolean[]>(new Array(exercises.length).fill(areShownInitially));
    const { t } = useTranslation();

    const toggleAnswer = (index: number) => {
        const updatedShownAnswers = [...shownAnswers];
        updatedShownAnswers[index] = !updatedShownAnswers[index];
        setShownAnswers(updatedShownAnswers);
    }

    return (
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
                                    icon={shownAnswers[index] ? 'eye-slash' : 'eye'}
                                    onClick={() => toggleAnswer(index)}
                                    label='Solution'
                                />
                            </span>
                            {shownAnswers[index] && (
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
  padding-left: 2.7rem;
`;
const Answer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
  padding-left: 2.7rem;
`;
export default ExerciseList;
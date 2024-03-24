import React, { useState } from 'react';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { Exercise } from '@slonigiraf/app-slonig-components';

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
                            <Button
                                icon={shownAnswers[index] ? 'eye-slash' : 'eye'}
                                onClick={() => toggleAnswer(index)}
                                label=''
                            />
                            <span>&nbsp;{index + 1}. {exercise.h}</span>
                            {exercise.p && <ExerciseDetails><StyledImage src={exercise.p} alt={t('Exercise')} /></ExerciseDetails>}

                        </div>
                        {shownAnswers[index] && (
                            <Answer>
                                <span><i>{t('Solution')}:</i> {exercise.a}</span>
                                {exercise.i && <><StyledImage src={exercise.i} alt={t('Solution')} /></>}
                            </Answer>
                        )}
                    </div>
                </div>
            ))}
        </>
    );
}
const StyledImage = styled.img`
  width: 200px;
`;
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
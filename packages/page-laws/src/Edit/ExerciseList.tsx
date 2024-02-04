// ExerciseList.tsx

import React, { useState } from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';

interface ExerciseListProps {
    exercises: {
        h: string;
        a: string;
    }[];
    areShownInitially?: boolean;
}

const ExerciseList: React.FC<ExerciseListProps> = ({ exercises, areShownInitially = false }) => {
    // State to manage which exercises have their answers shown
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

                        </div>
                        {shownAnswers[index] && (
                            <div className="exercise-answer">
                                <span>{t('Solution')}: {exercise.a}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </>
    );
}

export default ExerciseList;
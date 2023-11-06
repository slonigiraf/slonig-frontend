import React from 'react';

interface ExerciseListProps {
  exercises: {
    h: string;
    a: string;
  }[];
}

const ExerciseList: React.FC<ExerciseListProps> = ({ exercises }) => {
  return (
    <>
      {exercises.map((exercise, index) => (
        <div className='ui--row' key={index}
          style={{
            alignItems: 'center'
          }}
        >
          {/* Display the header and answer of each exercise */}
          <div className="exercise-display">
            <div className="exercise-header">
              {exercise.h}
            </div>
            <div className="exercise-answer">
              {exercise.a}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

export default ExerciseList;
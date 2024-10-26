import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import { ExerciseList } from '@slonigiraf/app-laws';
import ChatSimulation from './ChatSimulation.js';
import { styled } from '@polkadot/react-components';

class TeachingAlgorithm extends Algorithm {
    constructor(t: any, studentName: string | null, skillJson: any, studentUsesSlonigFirstTime: boolean) {
        super();
        const questions = skillJson ? skillJson.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME TASK FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let answer1: string = questions.length > 0 ? questions[0].a : '';
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string|undefined = questions.length > 0 ? questions[0].p : undefined;
        let answerImage1: string|undefined = questions.length > 0 ? questions[0].i : undefined;
        let exerciseImage2: string|undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const giveInsurance = new AlgorithmStage(
            'success',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Buy a skill diploma from me to get a bonus from a teacher and a parent.'), sender: 'you', senderName: 'You', comment: t('I sell the student a diploma in exchange for money or Slon tokens.') },
                ]} />
            </StyledDiv>
        );
        const repeatNextDay = new AlgorithmStage(
            'repeat',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Excellent! Let\'s repeat this tomorrow.'), sender: 'you', senderName: 'You' },
                ]} />
            </StyledDiv>
        );

        const hasStudentRepeatedTheRightAnswerToExerciseCreatedThemselves = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 2, text: t('...'), sender: 'you', senderName: 'You', comment: t('Correct execution of the exercise invented by the student.') },
                    { id: 3, text: t('...'), sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student repeated correctly?')}</b>
            </StyledDiv>
        );

        const hasStudentRepeatedTheRightSolutionOfExerciseOfTutor = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 2, text: answer1 === '' ? t('...') : answer1, image: answerImage1,sender: 'you', senderName: 'You', comment: answer1 === '' ? t('Correct execution of the exercise') : '' },
                    { id: 3, text: t('...'), sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student repeated correctly?')}</b>
            </StyledDiv>
        );

        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            'intermediate',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student has not corrected me.') },
                    { id: 2, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: t('...'), sender: 'you', senderName: 'You', comment: t('I provide the student with the correct execution of the exercise invented by the student. I can peek at examples here:') },
                ]} />
                {questions != null && <ExerciseList exercises={questions} areShownInitially={true} />}
            </StyledDiv>
        );

        const askStudentToRepeatTheSolutionOfExerciseOfTutor = new AlgorithmStage(
            'intermediate',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student has not executed the exercise correctly.') },
                    { id: 2, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: answer1 === '' ? t('...') : answer1, image: answerImage1, sender: 'you', senderName: 'You', comment: answer1 === '' ? t('I provide the student with the correct execution of the exercise. I can peek at examples here:') : '' },
                ]} />
                {answer1 === '' && questions != null && <ExerciseList exercises={questions} areShownInitially={true} />}
            </StyledDiv>
        );


        const wereTheStudentTasksAndAnswersPerfectToday = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student has corrected me and has given me the correct solution.') },
                ]} />
                <b>{t('Were all of the student\'s exercises and answers perfect today?')}</b>
            </StyledDiv>
        );


        const hasStudentCorrectedTheFakeAnswer = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'you', senderName: 'You', comment: t('I deliberately incorrectly perform the exercise invented by the student and say:') },
                    { id: 2, text: t('Correct me.'), sender: 'you', senderName: 'You' },
                    { id: 3, text: t('...'), sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student corrected the wrong solution?')}</b>
            </StyledDiv>
        );


        const hasStudentRepeatedAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 2, text: question2, image: exerciseImage2,sender: 'you', senderName: 'You' },
                    { id: 3, text: '...', sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student repeated correctly after me?')}</b>
            </StyledDiv>
        );

        const provideFakeAnswer = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('An exercise invented by a student.') },
                    { id: 2, text: t('...'), sender: 'you', senderName: 'You', comment: t('I deliberately incorrectly perform the exercise invented by the student and say:') },
                    { id: 3, text: t('Correct me.'), sender: 'you', senderName: 'You' },
                ]} />
            </StyledDiv>
        );


        const askToRepeatTaskAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: '...', sender: 'them', senderName: studentName, comment: t('The student has not come up with the type of exercise needed.') },
                    { id: 2, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question2, image: exerciseImage2, sender: 'you', senderName: 'You', comment: t('I can change the exercise a little.') },
                ]} />
            </StyledDiv>
        );


        const hasStudentCreatedASimilarTask = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Come up with an exercise similar to this:'), sender: 'you', senderName: 'You' },
                    { id: 2, text: question1, image: exerciseImage1, sender: 'you', senderName: 'You' },
                    { id: 3, text: '...', sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student now invented a similar exercise?')}</b>
            </StyledDiv>
        );

        const skip = new AlgorithmStage(
            'skip',
            t('Skip'),
            <></>
        );


        // Link stages
        const askStudentToCreateASimilarExercise = new AlgorithmStage(
            'begin',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Teach me the skill') + (skillJson && ": \"" + skillJson.h + "\""), sender: 'them', senderName: studentName },
                    { id: 2, text: t('Come up with an exercise similar to this:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question1, image: exerciseImage1, sender: 'you', senderName: 'You', comment: t('I can change the exercise a little.') },
                ]} />
            </StyledDiv>
        );


        //Use only if student never used Slonig
        const askToCreateAnExerciseAfterCompletionOfExerciseOfTutor = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student has executed the exercise correctly.') },
                    { id: 2, text: t('Come up with an exercise similar to this:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question1, image: exerciseImage1, sender: 'you', senderName: 'You', comment: t('I can change the exercise a little.') },
                ]} />
            </StyledDiv>
        );


        const hasStudentCompletedExerciseCorrectly = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: question1, image: exerciseImage1, sender: 'you', senderName: 'You' },
                    { id: 2, text: t('...'), sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student now executed the exercise correctly?')}</b>
            </StyledDiv>
        );


        const askStudentToSolveAnExercise = new AlgorithmStage(
            'begin',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Teach me the skill') + (skillJson && ": \"" + skillJson.h + "\""), sender: 'them', senderName: studentName },
                    { id: 2, text: question1, image: exerciseImage1, sender: 'you', senderName: 'You' },
                ]} />
            </StyledDiv>
        );




        const repeatFromTheBeginning = new AlgorithmStage(
            'begin',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student has repeated correctly after me.') },
                    { id: 2, text: t('Come up with an exercise similar to this:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question1, image: exerciseImage1, sender: 'you', senderName: 'You', comment: t('I can change the exercise a little.') },
                ]} />
            </StyledDiv>
        );

        // Algo linking
        this.begin = studentUsesSlonigFirstTime ? askStudentToSolveAnExercise : askStudentToCreateASimilarExercise;
        // Fork #0: studentUsesSlonigFirstTime === true
        askStudentToSolveAnExercise.setNext([skip, hasStudentCompletedExerciseCorrectly]);
        hasStudentCompletedExerciseCorrectly.setPrevious(askStudentToSolveAnExercise);
        hasStudentCompletedExerciseCorrectly.setNext([askToCreateAnExerciseAfterCompletionOfExerciseOfTutor, askStudentToRepeatTheSolutionOfExerciseOfTutor]);// Fork #1
        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setPrevious(hasStudentCompletedExerciseCorrectly);
        askStudentToRepeatTheSolutionOfExerciseOfTutor.setPrevious(hasStudentCompletedExerciseCorrectly);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes'
        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setNext([hasStudentCreatedASimilarTask]);
        if (studentUsesSlonigFirstTime) {
            hasStudentCreatedASimilarTask.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
        }
        hasStudentCreatedASimilarTask.setNext([provideFakeAnswer, askToRepeatTaskAfterMeTheTask]);// Fork #2
        provideFakeAnswer.setPrevious(hasStudentCreatedASimilarTask);
        askToRepeatTaskAfterMeTheTask.setPrevious(hasStudentCreatedASimilarTask);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'Yes'
        provideFakeAnswer.setNext([hasStudentCorrectedTheFakeAnswer]);
        hasStudentCorrectedTheFakeAnswer.setPrevious(provideFakeAnswer);
        hasStudentCorrectedTheFakeAnswer.setNext([wereTheStudentTasksAndAnswersPerfectToday, askStudentToRepeatTheAnswer]);// Fork #3
        wereTheStudentTasksAndAnswersPerfectToday.setPrevious(hasStudentCorrectedTheFakeAnswer);
        askStudentToRepeatTheAnswer.setPrevious(hasStudentCorrectedTheFakeAnswer);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'Yes' -> Fork #3: 'Yes'
        wereTheStudentTasksAndAnswersPerfectToday.setNext([giveInsurance, repeatNextDay]);// End of the algo
        giveInsurance.setPrevious(wereTheStudentTasksAndAnswersPerfectToday);
        repeatNextDay.setPrevious(wereTheStudentTasksAndAnswersPerfectToday);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'Yes' -> Fork #3: 'No'
        askStudentToRepeatTheAnswer.setNext([hasStudentRepeatedTheRightAnswerToExerciseCreatedThemselves]);
        hasStudentRepeatedTheRightAnswerToExerciseCreatedThemselves.setPrevious(askStudentToRepeatTheAnswer);
        hasStudentRepeatedTheRightAnswerToExerciseCreatedThemselves.setNext([repeatFromTheBeginning, askStudentToRepeatTheAnswer]);// Loop back


        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'No'
        askToRepeatTaskAfterMeTheTask.setNext([hasStudentRepeatedAfterMeTheTask]);
        hasStudentRepeatedAfterMeTheTask.setPrevious(askToRepeatTaskAfterMeTheTask);
        hasStudentRepeatedAfterMeTheTask.setNext([repeatFromTheBeginning, askToRepeatTaskAfterMeTheTask]);// Fork #4

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'No' -> Fork #4: 'Yes'
        repeatFromTheBeginning.setNext([hasStudentCreatedASimilarTask]);
        repeatFromTheBeginning.setPrevious(hasStudentRepeatedAfterMeTheTask);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'No' -> Fork #4: 'No'
        // This is just loop back, no code is needed.

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'No'
        askStudentToRepeatTheSolutionOfExerciseOfTutor.setNext([hasStudentRepeatedTheRightSolutionOfExerciseOfTutor]);
        hasStudentRepeatedTheRightSolutionOfExerciseOfTutor.setPrevious(askStudentToRepeatTheSolutionOfExerciseOfTutor);
        hasStudentRepeatedTheRightSolutionOfExerciseOfTutor.setNext([repeatFromTheBeginning, askStudentToRepeatTheSolutionOfExerciseOfTutor]);

        // Fork #0: studentUsesSlonigFirstTime === false
        askStudentToCreateASimilarExercise.setNext([skip, hasStudentCreatedASimilarTask]);
        if (!studentUsesSlonigFirstTime) {
            hasStudentCreatedASimilarTask.setPrevious(askStudentToCreateASimilarExercise);
        }

    }
}
const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  align-items: center;
`;
export { TeachingAlgorithm };
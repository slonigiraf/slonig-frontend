import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import { IMessage, Skill } from '@slonigiraf/app-slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';

class TutoringAlgorithm extends Algorithm {
    constructor(t: any, studentName: string | null, skill: Skill, studentUsesSlonigFirstTime: boolean) {
        super();
        const myMessage: IMessage = {
            text: '',
            sender: 'you',
            senderName: 'You'
        };
        const theirMessage: IMessage = {
            text: '',
            sender: 'them',
            senderName: studentName
        };
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME TASK FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let answer1: string = questions.length > 0 ? questions[0].a : '';
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string | undefined = questions.length > 0 ? questions[0].p : undefined;
        let answerImage1: string | undefined = questions.length > 0 ? questions[0].i : undefined;
        let exerciseImage2: string | undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const giveInsurance = new AlgorithmStage(
            'success',
            t('Yes'),
            []
        );
        const repeatNextDay = new AlgorithmStage(
            'repeat',
            t('No'),
            [
                { ...myMessage, text: t('Excellent! Let\'s repeat this tomorrow.') },
            ]
        );

        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            'intermediate',
            t('No'),
            [
                { ...theirMessage, text: t('...'), comment: t('The student has not corrected me.') },
                { ...myMessage, text: t('Repeat after me:') },
                { ...myMessage, text: t('...'), comment: t('I provide the student with the correct execution of the exercise invented by the student. I can peek at examples here:') },
            ],
            t('Has the student repeated correctly?'),
            <ExampleExercisesButton skill={skill} />
        );

        const askStudentToRepeatTheSolutionOfExerciseOfTutor = new AlgorithmStage(
            'intermediate',
            t('No'),
            [
                { ...theirMessage, text: t('...'), comment: t('The student has not executed the exercise correctly.') },
                { ...myMessage, text: t('Repeat after me:') },
                { ...myMessage, text: answer1 === '' ? t('...') : answer1, image: answerImage1, comment: answer1 === '' ? t('I provide the student with the correct execution of the exercise. I can peek at examples here:') : '' },
            ],
            t('Has the student repeated correctly?'),
            <ExampleExercisesButton skill={skill} />
        );


        const wereTheStudentTasksAndAnswersPerfectToday = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            [
                { ...theirMessage, text: t('...'), comment: t('The student has corrected me and has given me the correct solution.') },
            ],
            t('Were all of the student\'s exercises and answers perfect today?')
        );

        const provideFakeAnswer = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            [
                { ...theirMessage, text: t('...'), comment: t('An exercise invented by a student.') },
                { ...myMessage, text: t('...'), comment: t('I deliberately incorrectly perform the exercise invented by the student and say:') },
                { ...myMessage, text: t('Correct me.') },
            ],
            t('Has the student corrected the wrong solution?')
        );


        const askToRepeatTaskAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('No'),
            [
                { ...theirMessage, text: '...', comment: t('The student has not come up with the type of exercise needed.') },
                { ...myMessage, text: t('Repeat after me:') },
                { ...myMessage, text: question2, image: exerciseImage2, comment: t('I can change the exercise a little.') },
            ],
            t('Has the student repeated correctly after me?')
        );

        const skip = new AlgorithmStage(
            'skip',
            t('Skip'),
            []
        );

        // Link stages
        const askStudentToCreateASimilarExercise = new AlgorithmStage(
            'begin',
            t('Yes'),
            [
                { ...theirMessage, text: t('Teach me the skill') + (skill && ": \"" + skill.h + "\"") },
                { ...myMessage, text: t('Come up with an exercise similar to this:') },
                { ...myMessage, text: question1, image: exerciseImage1, comment: t('I can change the exercise a little.') },
            ],
            t('Has the student now invented a similar exercise?')
        );


        //Use only if student never used Slonig
        const askToCreateAnExerciseAfterCompletionOfExerciseOfTutor = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            [
                { ...theirMessage, text: t('...'), comment: t('The student has executed the exercise correctly.') },
                { ...myMessage, text: t('Come up with an exercise similar to this:') },
                { ...myMessage, text: question1, image: exerciseImage1, comment: t('I can change the exercise a little.') },
            ],
            t('Has the student now invented a similar exercise?')
        );

        const askStudentToSolveAnExercise = new AlgorithmStage(
            'begin',
            t('Yes'),
            [
                { ...theirMessage, text: t('Teach me the skill') + (skill && ": \"" + skill.h + "\"") },
                { ...myMessage, text: question1, image: exerciseImage1 },
            ],
            t('Has the student now executed the exercise correctly?')
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            'begin',
            t('Yes'),
            [
                { ...theirMessage, text: t('...'), comment: t('The student has repeated correctly after me.') },
                { ...myMessage, text: t('Come up with an exercise similar to this:') },
                { ...myMessage, text: question1, image: exerciseImage1, comment: t('I can change the exercise a little.') },
            ],
            t('Has the student now invented a similar exercise?')
        );

        const toNextSkill = new AlgorithmStage(
            'next_skill',
            t('Next'),
            []
        );

        // Algo linking
        this.begin = studentUsesSlonigFirstTime ? askStudentToSolveAnExercise : askStudentToCreateASimilarExercise;
        // Fork #0: studentUsesSlonigFirstTime === true
        askStudentToSolveAnExercise.setNext([skip, askToCreateAnExerciseAfterCompletionOfExerciseOfTutor, askStudentToRepeatTheSolutionOfExerciseOfTutor]);

        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setPrevious(askStudentToSolveAnExercise);
        askStudentToRepeatTheSolutionOfExerciseOfTutor.setPrevious(askStudentToSolveAnExercise);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes'
        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setNext([provideFakeAnswer, askToRepeatTaskAfterMeTheTask]);
        if (studentUsesSlonigFirstTime) {
            provideFakeAnswer.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
            askToRepeatTaskAfterMeTheTask.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
        }

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'Yes'
        provideFakeAnswer.setNext([wereTheStudentTasksAndAnswersPerfectToday, askStudentToRepeatTheAnswer]);
        wereTheStudentTasksAndAnswersPerfectToday.setPrevious(provideFakeAnswer);
        askStudentToRepeatTheAnswer.setPrevious(provideFakeAnswer);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'Yes' -> Fork #3: 'Yes'
        wereTheStudentTasksAndAnswersPerfectToday.setNext([giveInsurance, repeatNextDay]);// End of the algo
        giveInsurance.setPrevious(wereTheStudentTasksAndAnswersPerfectToday);
        repeatNextDay.setPrevious(wereTheStudentTasksAndAnswersPerfectToday);
        repeatNextDay.setNext([toNextSkill]);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'Yes' -> Fork #3: 'No'
        askStudentToRepeatTheAnswer.setNext([repeatFromTheBeginning, askStudentToRepeatTheAnswer]);


        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'No'
        askToRepeatTaskAfterMeTheTask.setNext([repeatFromTheBeginning, askToRepeatTaskAfterMeTheTask]);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'No' -> Fork #4: 'Yes'
        repeatFromTheBeginning.setNext([provideFakeAnswer, askToRepeatTaskAfterMeTheTask]);
        repeatFromTheBeginning.setPrevious(askToRepeatTaskAfterMeTheTask);

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'Yes' -> Fork #2: 'No' -> Fork #4: 'No'
        // This is just loop back, no code is needed.

        // Fork #0: studentUsesSlonigFirstTime === true -> Fork #1: 'No'
        askStudentToRepeatTheSolutionOfExerciseOfTutor.setNext([repeatFromTheBeginning, askStudentToRepeatTheSolutionOfExerciseOfTutor]);

        // Fork #0: studentUsesSlonigFirstTime === false
        askStudentToCreateASimilarExercise.setNext([skip, provideFakeAnswer, askToRepeatTaskAfterMeTheTask]);
        if (!studentUsesSlonigFirstTime) {
            provideFakeAnswer.setPrevious(askStudentToCreateASimilarExercise);
            askToRepeatTaskAfterMeTheTask.setPrevious(askStudentToCreateASimilarExercise);
        }
    }
}

export { TutoringAlgorithm };
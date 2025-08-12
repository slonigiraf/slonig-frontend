import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import { Skill } from '@slonigiraf/app-slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';

class TutoringAlgorithm extends Algorithm {
    constructor(t: any, studentName: string | null, skill: Skill, studentUsesSlonigFirstTime: boolean) {
        super();
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME TASK FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let answer1: string = questions.length > 0 ? questions[0].a : '';
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string | undefined = questions.length > 0 ? questions[0].p : undefined;
        let answerImage1: string | undefined = questions.length > 0 ? questions[0].i : undefined;
        let exerciseImage2: string | undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const giveInsurance = new AlgorithmStage(
            8,
            'success',
            t('Yes'),
            []
        );
        const repeatNextDay = new AlgorithmStage(
            7,
            'repeat',
            t('No'),
            [
                { title: t('Say to the tutee.'), text: t('Excellent! Let\'s repeat this tomorrow.') },
            ]
        );

        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            5,
            'intermediate',
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has not corrected me.') },
                { title: t('🗣 Provide the tutee with the correct execution of the exercise invented by the tutee, and say'), text: t('Repeat after me.') },
            ],
            t('Has the tutee repeated correctly?'),
            <ExampleExercisesButton skill={skill} />
        );

        const askStudentToRepeatTheSolutionOfExerciseOfTutor = new AlgorithmStage(
            0,
            'intermediate',
            t('No'),
            [
                {  title: t('📖 Read what’s happening'), text: t('The tutee has not executed the exercise correctly.') },
                { title: t('🗣 Say to the tutee'), text: t('Repeat after me:') + ' ' + answer1, image: answerImage1 },
            ],
            t('Has the tutee repeated correctly?')
        );


        const wereTheStudentTasksAndAnswersPerfectToday = new AlgorithmStage(
            7,
            'intermediate',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has corrected me and has given me the correct solution.') },
            ],
            t('Were all of the tutee\'s exercises and answers perfect today?')
        );

        const provideFakeAnswer = new AlgorithmStage(
            2,
            'intermediate',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee invented an exercise.') },
                { title: t('🗣 Deliberately incorrectly perform the exercise invented by the tutee and say'), text: t('Correct me.') },
            ],
            t('Has the tutee corrected the wrong solution?'),
            <ExampleExercisesButton skill={skill} />
        );

        const askToRepeatTaskAfterMeTheTask = new AlgorithmStage(
            2,
            'intermediate',
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has not come up with the type of exercise needed.') },
                { title: t('🗣 Say to the tutee'), text: t('Repeat after me:') + ' ' + question2, image: exerciseImage2},
            ],
            t('Has the tutee repeated correctly after me?')
        );

        const skip = new AlgorithmStage(
            -1,
            'skip',
            t('Skip'),
            []
        );

        const askStudentToCreateASimilarExercise = new AlgorithmStage(
            1,
            'begin',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('____ asks you to teach the skill').replace('____', studentName) + (skill && ": \"" + skill.h + "\"") },
                { title: t('🗣 Say to the tutee'), text: t('Come up with an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has the tutee now invented a similar exercise?')
        );

        //Use only if student never used Slonig
        const askToCreateAnExerciseAfterCompletionOfExerciseOfTutor = new AlgorithmStage(
            1,
            'intermediate',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has executed the exercise correctly.') },
                { title: t('🗣 Say to the tutee'), text: t('Come up with an exercise similar to this:') + ' ' + question1, image: exerciseImage1},
            ],
            t('Has the tutee now invented a similar exercise?')
        );

        const askStudentToSolveAnExercise = new AlgorithmStage(
            1,
            'begin',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('____ asks you to teach the skill').replace('____', studentName) + (skill && ": \"" + skill.h + "\"") },
                { title: t('🗣 Say to the tutee'), text: question1, image: exerciseImage1 },
            ],
            t('Has the tutee now executed the exercise correctly?')
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            1,
            'begin',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has repeated correctly after me.') },
                { title: t('🗣 Say to the tutee'), text: t('Come up with an exercise similar to this:') + ' '+ question1, image: exerciseImage1},
            ],
            t('Has the tutee now invented a similar exercise?')
        );

        const toNextSkill = new AlgorithmStage(
            -1,
            'next_skill',
            t('Next'),
            []
        );

        // Algo linking
        this.begin = studentUsesSlonigFirstTime ? askStudentToSolveAnExercise : askStudentToCreateASimilarExercise;

        askStudentToSolveAnExercise.setNext([skip, askToCreateAnExerciseAfterCompletionOfExerciseOfTutor, askStudentToRepeatTheSolutionOfExerciseOfTutor]);

        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setPrevious(askStudentToSolveAnExercise);
        askStudentToRepeatTheSolutionOfExerciseOfTutor.setPrevious(askStudentToSolveAnExercise);

        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setNext([provideFakeAnswer, askToRepeatTaskAfterMeTheTask]);
        if (studentUsesSlonigFirstTime) {
            provideFakeAnswer.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
            askToRepeatTaskAfterMeTheTask.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
        }

        provideFakeAnswer.setNext([wereTheStudentTasksAndAnswersPerfectToday, askStudentToRepeatTheAnswer]);
        wereTheStudentTasksAndAnswersPerfectToday.setPrevious(provideFakeAnswer);
        askStudentToRepeatTheAnswer.setPrevious(provideFakeAnswer);

        wereTheStudentTasksAndAnswersPerfectToday.setNext([giveInsurance, repeatNextDay]);// End of the algo
        giveInsurance.setPrevious(wereTheStudentTasksAndAnswersPerfectToday);
        repeatNextDay.setPrevious(wereTheStudentTasksAndAnswersPerfectToday);
        repeatNextDay.setNext([toNextSkill]);

        askStudentToRepeatTheAnswer.setNext([repeatFromTheBeginning, askStudentToRepeatTheAnswer]);

        askToRepeatTaskAfterMeTheTask.setNext([repeatFromTheBeginning, askToRepeatTaskAfterMeTheTask]);

        repeatFromTheBeginning.setNext([provideFakeAnswer, askToRepeatTaskAfterMeTheTask]);
        repeatFromTheBeginning.setPrevious(askToRepeatTaskAfterMeTheTask);

        askStudentToRepeatTheSolutionOfExerciseOfTutor.setNext([repeatFromTheBeginning, askStudentToRepeatTheSolutionOfExerciseOfTutor]);

        askStudentToCreateASimilarExercise.setNext([skip, provideFakeAnswer, askToRepeatTaskAfterMeTheTask]);
        if (!studentUsesSlonigFirstTime) {
            provideFakeAnswer.setPrevious(askStudentToCreateASimilarExercise);
            askToRepeatTaskAfterMeTheTask.setPrevious(askStudentToCreateASimilarExercise);
        }
    }
}

export { TutoringAlgorithm };
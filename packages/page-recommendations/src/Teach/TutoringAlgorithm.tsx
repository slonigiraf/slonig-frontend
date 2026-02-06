import { AlgorithmStage, StageType } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import { Skill } from '@slonigiraf/slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';

export type TutoringAlgorithmType = 'tutorial' | 'regular' | 'first_in_lesson';
export interface TutoringAlgorithmProps {
    variation: TutoringAlgorithmType;
    studentName: string | null;
    stake: string;
    canIssueBadge: boolean;
    skill: Skill;
    hasTuteeUsedSlonig: boolean;
    t: (key: string, options?: {
        replace: Record<string, unknown>;
    } | undefined) => string;
}
class TutoringAlgorithm extends Algorithm {
    //get from one param of type TutoringAlgorithmType
    constructor({ variation, studentName, stake, canIssueBadge, skill, hasTuteeUsedSlonig, t }: TutoringAlgorithmProps) {
        super();
        const bothUsedSlonig = hasTuteeUsedSlonig && variation === 'tutorial';
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME TASK FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let answer1: string = questions.length > 0 ? questions[0].a : '';
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string | undefined = questions.length > 0 ? questions[0].p : undefined;
        let answerImage1: string | undefined = questions.length > 0 ? questions[0].i : undefined;
        let exerciseImage2: string | undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const issueBadge = new AlgorithmStage(
            5,
            StageType.decide_about_badge,
            t('Yes'),
            [],
            t('I risk losing {{stake}} Slon if {{studentName}} forgets this skill. I’m awarding a badge for this skill.', { replace: { studentName: studentName, stake: stake } })
        );

        const repeatTomorrow = new AlgorithmStage(
            -1,
            StageType.repeat_tomorrow,
            t('No'),
            []
        );

        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            5,
            StageType.correct_fake_solution,
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has not corrected me.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Show {{studentName}} the correct execution, and say', {replace: {studentName: studentName}}), text: t('Repeat after me.') },
            ],
            t('Has {{studentName}} repeated correctly?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} location='example_exercises_and_solutions'/>
        );

        const askStudentToRepeatTheSolutionOfExerciseOfTutor = new AlgorithmStage(
            0,
            StageType.ask_to_repeat_example_solution,
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has not executed the exercise correctly.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Repeat after me:') + ' ' + answer1, image: answerImage1 },
            ],
            t('Has {{studentName}} repeated correctly?', {replace: {studentName: studentName}})
        );

        const provideFakeAnswer = new AlgorithmStage(
            2,
            StageType.provide_fake_solution,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has created an exercise.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Give {{studentName}} a wrong answer and ask them to correct it', {replace: {studentName: studentName}}), text: '' },
            ],
            t('Has {{studentName}} corrected the wrong solution on their own, without any hints and guiding questions?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} location='example_exercises_and_solutions' />
        );

        const askToRepeatTaskAfterMe = new AlgorithmStage(
            2,
            StageType.ask_to_repeat_similar_exercise,
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has not created a similar exercise.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Repeat after me:') + ' ' + question2, image: exerciseImage2 },
            ],
            t('Has {{studentName}} repeated correctly?', {replace: {studentName: studentName}})
        );

        const skip = new AlgorithmStage(
            -1,
            StageType.skip,
            t('Skip'),
            []
        );

        const askStudentToCreateASimilarExercise = new AlgorithmStage(
            1,
            StageType.begin_ask_to_create_similar_exercise,
            t('Next'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} wants to learn a new skill.', { replace: { studentName: studentName } }) },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has {{studentName}} created a similar exercise on their own, without any additional hints and guiding questions?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} location='example_exercises' />
        );

        //Use only if student never used Slonig
        const firstTimeIntro = new AlgorithmStage(
            0,
            StageType.first_time_intro,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('You are a tutor. The app will show you how to teach {{studentName}}.', {replace: {studentName: studentName}}) },
                { title: t('👀 Check it'), text: t('Make sure {{studentName}} doesn’t use notes and can’t see any written prompts when answering questions.', {replace: {studentName: studentName}})},
            ],
            t('Let’s start with a simple skill. {{studentName}} will pretend not to know it.', {replace: {studentName: studentName}}),
        );

        const closeNotes = new AlgorithmStage(
            0,
            StageType.ask_to_close_notes,
            t('Yes'),
            [
                { title: t('👀 Check it'), text: t('Make sure {{studentName}} doesn’t use notes and can’t see any written prompts when answering questions.', {replace: {studentName: studentName}})},
            ],
        );

        const askToCreateAnExerciseAfterCompletionOfExerciseOfTutor = new AlgorithmStage(
            1,
            StageType.ask_to_create_similar_exercise,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has executed the exercise correctly.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has {{studentName}} created a similar exercise on their own, without any additional hints and guiding questions?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} location='example_exercises' />
        );

        const askStudentToSolveAnExercise = new AlgorithmStage(
            1,
            StageType.begin_ask_to_solve_exercise,
            t('Start'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} wants to learn a new skill.', { replace: { studentName: studentName } }) },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: question1, image: exerciseImage1 },
            ],
            t('Has {{studentName}} now executed the exercise correctly?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} location='example_exercises_and_solutions' />
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            1,
            StageType.cycle_ask_to_create_similar_exercise,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has repeated correctly after me.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has {{studentName}} created a similar exercise on their own, without any additional hints and guiding questions?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} location='example_exercises' />
        );

        const toNextSkill = new AlgorithmStage(
            -1,
            StageType.next_skill,
            canIssueBadge ? t('Risk') : t('Yes'),
            []
        );

        if (variation === 'tutorial') {
            this.begin = firstTimeIntro;
        } else if (variation === 'first_in_lesson'){
            this.begin = closeNotes;
        } else {
            this.begin = askStudentToCreateASimilarExercise;
        }

        firstTimeIntro.setNext([askStudentToSolveAnExercise]);

        closeNotes.setNext([askStudentToCreateASimilarExercise])

        askStudentToSolveAnExercise.setNext([askToCreateAnExerciseAfterCompletionOfExerciseOfTutor, askStudentToRepeatTheSolutionOfExerciseOfTutor]);
        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setPrevious(askStudentToSolveAnExercise);
        askStudentToRepeatTheSolutionOfExerciseOfTutor.setPrevious(askStudentToSolveAnExercise);
        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setNext([provideFakeAnswer, askToRepeatTaskAfterMe]);
        provideFakeAnswer.setNext([
            canIssueBadge ? issueBadge : toNextSkill,
            askStudentToRepeatTheAnswer
        ]);
        issueBadge.setNext([toNextSkill, repeatTomorrow]);
        askStudentToRepeatTheAnswer.setPrevious(provideFakeAnswer);
        askStudentToRepeatTheAnswer.setNext([repeatFromTheBeginning, askStudentToRepeatTheAnswer]);
        askToRepeatTaskAfterMe.setNext([repeatFromTheBeginning, askToRepeatTaskAfterMe]);
        repeatFromTheBeginning.setNext([provideFakeAnswer, askToRepeatTaskAfterMe]);
        repeatFromTheBeginning.setPrevious(askToRepeatTaskAfterMe);
        askStudentToRepeatTheSolutionOfExerciseOfTutor.setNext([repeatFromTheBeginning, askStudentToRepeatTheSolutionOfExerciseOfTutor]);
        askStudentToCreateASimilarExercise.setNext([skip, provideFakeAnswer, askToRepeatTaskAfterMe]);
        if (bothUsedSlonig) {
            provideFakeAnswer.setPrevious(askStudentToCreateASimilarExercise);
            askToRepeatTaskAfterMe.setPrevious(askStudentToCreateASimilarExercise);
        } else {
            provideFakeAnswer.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
            askToRepeatTaskAfterMe.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
        }
    }
}

export { TutoringAlgorithm };
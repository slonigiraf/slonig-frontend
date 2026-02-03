import { AlgorithmStage, StageType } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import type { Skill } from '@slonigiraf/slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';
export interface ValidatingAlgorithmProps {
    studentName: string | null;
    stake: string;
    skill: Skill;
    t: (key: string, options?: {
        replace: Record<string, unknown>;
    } | undefined) => string;
}
class ValidatingAlgorithm extends Algorithm {
    constructor({ skill, studentName, stake, t }: ValidatingAlgorithmProps) {
        super();
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME EXERCISE FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string | undefined = questions.length > 0 ? questions[0].p : undefined;
        let exerciseImage2: string | undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const validateDiploma = new AlgorithmStage(
            7,
            StageType.validate,
            t('Yes'),
            [
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Great, you remember the skill.') },
            ]
        );

        const explainReimburse = new AlgorithmStage(
            7,
            StageType.explain_reimburse,
            t('No'),
            [
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('You don’t have such a skill. I will penalize the tutor which issued the badge for it.') },
            ]
        );

        const skip = new AlgorithmStage(
            -1,
            StageType.skip,
            t('Skip'),
            []
        );

        const nextToTeaching = new AlgorithmStage(
            -1,
            StageType.success,
            t('Next'),
            []
        );

        const reimburse = new AlgorithmStage(
            8,
            StageType.reimburse,
            t('Next'),
            []
        );

        const provideFakeSolution = new AlgorithmStage(
            2,
            StageType.provide_fake_solution,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has created an exercise.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Give {{studentName}} a wrong answer and say', {replace: {studentName: studentName}}), text: t('Correct me.') },
            ],
            t('Has {{studentName}} corrected the wrong solution?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} />
        );

        const askToRepeatTheExerciseAfterMe = new AlgorithmStage(
            3,
            StageType.ask_to_repeat_similar_exercise,
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has not created a similar exercise.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Repeat after me:') + ' ' + question2, image: exerciseImage2 },
            ],
            t('Has {{studentName}} repeated correctly after me?', {replace: {studentName: studentName}})
        );


        const askToCreateSimilarExercise = new AlgorithmStage(
            1,
            StageType.ask_to_create_similar_exercise,
            t('Yes'),
            [
                {
                    title: t('📖 Read what’s happening'),
                    text: t('Try to earn {{stake}} Slon by checking how another tutor taught {{studentName}} the skill:', { replace: { studentName: studentName, stake: stake } }) + (skill && ' ' + skill.h)
                },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has {{studentName}} now created a similar exercise?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} />
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            1,
            StageType.cycle_ask_to_create_similar_exercise,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has repeated correctly after me.', {replace: {studentName: studentName}}) },
                { title: t('🗣 Say to {{studentName}}', {replace: {studentName: studentName}}), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 }
            ],
            t('Has {{studentName}} now created a similar exercise?', {replace: {studentName: studentName}}),
            <ExampleExercisesButton skill={skill} />
        );

        // Algo linking:
        this.begin = askToCreateSimilarExercise;

        askToCreateSimilarExercise.setNext([skip, provideFakeSolution, askToRepeatTheExerciseAfterMe]);
        provideFakeSolution.setPrevious(askToCreateSimilarExercise);
        askToRepeatTheExerciseAfterMe.setPrevious(askToCreateSimilarExercise);

        provideFakeSolution.setNext([validateDiploma, explainReimburse]);
        validateDiploma.setPrevious(provideFakeSolution);

        validateDiploma.setNext([nextToTeaching]); // Algo end (no bonus)
        explainReimburse.setNext([reimburse]); // Algo end (bonus)
        reimburse.setNext([nextToTeaching]);

        askToRepeatTheExerciseAfterMe.setNext([repeatFromTheBeginning, askToRepeatTheExerciseAfterMe]);
        repeatFromTheBeginning.setPrevious(askToRepeatTheExerciseAfterMe);

        repeatFromTheBeginning.setNext([provideFakeSolution, askToRepeatTheExerciseAfterMe]);

    }
}

export { ValidatingAlgorithm };
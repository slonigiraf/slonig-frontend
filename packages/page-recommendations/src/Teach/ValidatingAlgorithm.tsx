import { AlgorithmStage, StageType } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import type { IMessage, Skill } from '@slonigiraf/slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';
import { quote } from '../utils.js';

export type ValidatingAlgorithmType = 'regular' | 'first_in_lesson';
export interface ValidatingAlgorithmProps {
    variation: ValidatingAlgorithmType;
    studentName: string | null;
    stake: string;
    skill: Skill;
    t: (key: string, options?: {
        replace: Record<string, unknown>;
    } | undefined) => string;
}
class ValidatingAlgorithm extends Algorithm {
    constructor({ skill, studentName, stake, t, variation }: ValidatingAlgorithmProps) {
        super();
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME EXERCISE FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string | undefined = questions.length > 0 ? questions[0].p : undefined;
        let exerciseImage2: string | undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const createSimilarExerciseMessage: IMessage = { title: t('🗣 Say to {{studentName}}', { replace: { studentName: studentName } }), text: quote(t('Create an exercise similar to this:') + ' ' + question1), image: exerciseImage1 };
        
        const validateDiploma = new AlgorithmStage(
            7,
            StageType.validate,
            t('Yes'),
            [
                { title: t('🗣 Say to {{studentName}}', { replace: { studentName: studentName } }), text: quote(t('Great, you remember the skill.')) },
            ]
        );

        const explainReimburse = new AlgorithmStage(
            7,
            StageType.revoke,
            t('No'),
            [
                { title: t('🗣 Say to {{studentName}}', { replace: { studentName: studentName } }), text: quote(t('You don’t have such a skill. I will penalize the tutor which issued the badge for it.')) },
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
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has created an exercise.', { replace: { studentName: studentName } }) },
                { title: t('🗣 Give {{studentName}} a wrong answer to the exercise they created and ask them to correct', { replace: { studentName: studentName } }), text: '' },
            ],
            t('Has {{studentName}} corrected the wrong answer on their own, without any hints and guiding questions?', { replace: { studentName: studentName } }),
            <ExampleExercisesButton skill={skill} location='example_exercises_and_solutions' />
        );

        const askToRepeatTheExerciseAfterMe = new AlgorithmStage(
            3,
            StageType.ask_to_repeat_similar_exercise,
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has not created a similar exercise.', { replace: { studentName: studentName } }) },
                { title: t('🗣 Say to {{studentName}}', { replace: { studentName: studentName } }), text: quote(t('Repeat after me:') + ' ' + question2), image: exerciseImage2 },
            ],
            t('Has {{studentName}} repeated correctly?', { replace: { studentName: studentName } })
        );


        const askToCreateSimilarExercise = new AlgorithmStage(
            1,
            StageType.ask_to_create_similar_exercise,
            t('Next'),
            [
                {
                    title: t('📖 Read what’s happening'),
                    text: t('Try to earn {{stake}} Slon by checking how another tutor taught {{studentName}}.', { replace: { studentName: studentName, stake: stake } })
                },
                createSimilarExerciseMessage,
            ],
            t('Has {{studentName}} created a similar exercise on their own, without any additional hints and guiding questions?', { replace: { studentName: studentName } }),
            <ExampleExercisesButton skill={skill} location='example_exercises' />
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            1,
            StageType.cycle_ask_to_create_similar_exercise,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{studentName}} has repeated correctly after me.', { replace: { studentName: studentName } }) },
                createSimilarExerciseMessage
            ],
            t('Has {{studentName}} created a similar exercise on their own, without any additional hints and guiding questions?', { replace: { studentName: studentName } }),
            <ExampleExercisesButton skill={skill} location='example_exercises' />
        );

        const closeNotes = new AlgorithmStage(
            0,
            StageType.ask_to_close_notes,
            t('Yes'),
            [
                { title: t('👀 Check it'), text: t('Make sure {{studentName}} doesn’t use notes and can’t see any written prompts when answering questions.', {replace: {studentName: studentName}})},
            ],
        );

        // Algo linking:
        if (variation === 'first_in_lesson') {
            this.begin = closeNotes;
        } else {
            this.begin = askToCreateSimilarExercise;
        }


        closeNotes.setNext([askToCreateSimilarExercise]);

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
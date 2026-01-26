import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import type { Skill } from '@slonigiraf/slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';

class ValidatingAlgorithm extends Algorithm {
    constructor(t: any, studentName: string | null, stake: string, skill: Skill, showIntro: boolean) {
        super();
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME EXERCISE FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string | undefined = questions.length > 0 ? questions[0].p : undefined;
        let exerciseImage2: string | undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const validateDiploma = new AlgorithmStage(
            7,
            'validate',
            t('Yes'),
            [
                { title: t('🗣 Say to the tutee'), text: t('Great, you remember the skill.') },
            ]
        );

        const explainReimburse = new AlgorithmStage(
            7,
            'explain_reimburse',
            t('No'),
            [
                { title: t('🗣 Say to the tutee'), text: t('You don’t have such a skill. I will penalize the tutor which issued the badge for it.') },
            ]
        );

        const skip = new AlgorithmStage(
            -1,
            'skip',
            t('Skip'),
            []
        );

        const nextToTeaching = new AlgorithmStage(
            -1,
            'success',
            t('Next'),
            []
        );

        const reimburse = new AlgorithmStage(
            8,
            'reimburse',
            t('Get bounty'),
            []
        );

        const provideFakeSolution = new AlgorithmStage(
            2,
            'provide_fake_solution',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has created an exercise.') },
                { title: t('🗣 Give your tutee a wrong answer and say'), text: t('Correct me.') },
            ],
            t('Has the tutee corrected the wrong solution?'),
            <ExampleExercisesButton skill={skill} />
        );

        const askToRepeatTheExerciseAfterMe = new AlgorithmStage(
            3,
            'ask_to_repeat_similar_exercise',
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has not created a similar exercise.') },
                { title: t('🗣 Say to the tutee'), text: t('Repeat after me:') + ' ' + question2, image: exerciseImage2 },
            ],
            t('Has the tutee repeated correctly after me?')
        );

    
        const beginAskToCreateSimilarExercise = new AlgorithmStage(
            1,
            'begin_ask_to_create_similar_exercise',
            t('Start'),
            [
                {
                    title: t('📖 Read what’s happening'),
                    text: t('Try to earn {{stake}} Slon by checking how another tutor taught {{name}} the skill:', { replace: { name: studentName, stake: stake } }) + (skill && ' ' + skill.h)
                },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has the tutee now created a similar exercise?'),
            <ExampleExercisesButton skill={skill} />
        );

        const intro = new AlgorithmStage(
            0,
            'intro',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('Before teaching, help your student identify what they have learned wrongly from bad tutors. If you find a problem, the bad tutor will automatically send you a bonus.') },
            ]
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            1,
            'cycle_ask_to_create_similar_exercise',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has repeated correctly after me.') },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 }
            ],
            t('Has the tutee now created a similar exercise?'),
            <ExampleExercisesButton skill={skill} />
        );

        // Algo linking:
        this.begin = stake? beginAskToCreateSimilarExercise : intro;
        intro.setNext([beginAskToCreateSimilarExercise]);
        beginAskToCreateSimilarExercise.setNext([skip, provideFakeSolution, askToRepeatTheExerciseAfterMe]);
        provideFakeSolution.setPrevious(beginAskToCreateSimilarExercise);
        askToRepeatTheExerciseAfterMe.setPrevious(beginAskToCreateSimilarExercise);

        provideFakeSolution.setNext([validateDiploma, explainReimburse]);
        validateDiploma.setPrevious(provideFakeSolution);
        explainReimburse.setPrevious(provideFakeSolution);

        validateDiploma.setNext([nextToTeaching]); // Algo end (no bonus)

        explainReimburse.setNext([reimburse]); // Algo end (bonus)

        askToRepeatTheExerciseAfterMe.setNext([repeatFromTheBeginning, askToRepeatTheExerciseAfterMe]);
        repeatFromTheBeginning.setPrevious(askToRepeatTheExerciseAfterMe);

        repeatFromTheBeginning.setNext([provideFakeSolution, askToRepeatTheExerciseAfterMe]);

    }
}

export { ValidatingAlgorithm };
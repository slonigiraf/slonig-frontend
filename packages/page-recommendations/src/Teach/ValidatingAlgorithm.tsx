import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import type { Skill } from '@slonigiraf/slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';

class ValidatingAlgorithm extends Algorithm {
    constructor(t: any, studentName: string | null, skill: Skill, isBeforeTeaching: boolean) {
        super();
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME EXERCISE FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string | undefined = questions.length > 0 ? questions[0].p : undefined;
        let exerciseImage2: string | undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const validateDiploma = new AlgorithmStage(
            7,
            'intermediate',
            t('Yes'),
            [
                { title: t('🗣 Say to the tutee'), text: t('Great, you remember the skill.') },
            ]
        );

        const explainReimburse = new AlgorithmStage(
            7,
            'intermediate',
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
            'intermediate',
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
            'intermediate',
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has not created a similar exercise.') },
                { title: t('🗣 Say to the tutee'), text: t('Repeat after me:') + ' ' + question2, image: exerciseImage2 },
            ],
            t('Has the tutee repeated correctly after me?')
        );

        this.begin = new AlgorithmStage(
            1,
            'begin',
            t('Yes'),
            [
                {
                    title: t('📖 Read what’s happening'),
                    text: isBeforeTeaching ?
                        t('___ asks you to teach a skill. Before starting, try to earn a bonus by testing the previous skill:').replace('___', studentName) + (skill && " \"" + skill.h + "\".")
                        : t('___ asks you to reexamine a skill. Try to earn a bonus by testing the skill:').replace('___', studentName) + (skill && " \"" + skill.h + "\".")
                },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has the tutee now created a similar exercise?')
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            1,
            'begin',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has repeated correctly after me.') },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 }
            ],
            t('Has the tutee now created a similar exercise?')
        );

        // Algo linking:
        this.begin.setNext([skip, provideFakeSolution, askToRepeatTheExerciseAfterMe]);
        provideFakeSolution.setPrevious(this.begin);
        askToRepeatTheExerciseAfterMe.setPrevious(this.begin);

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
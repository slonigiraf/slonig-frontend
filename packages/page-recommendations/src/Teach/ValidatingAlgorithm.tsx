import { AlgorithmStage, StageType } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import type { Skill } from '@slonigiraf/slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';
import LessonProcessInfo from './LessonProcessInfo.js';
import TooFastWarning from './TooFastWarning.js';
import { ExerciseList } from '@slonigiraf/app-laws';
import { LessonStat } from '../types.js';

export type ValidatingAlgorithmType = 'with_too_fast_warning' | 'intro' | 'with_stat' | 'no_stat';
export interface ValidatingAlgorithmProps {
    variation: ValidatingAlgorithmType;
    studentName: string | null;
    stake: string;
    skill: Skill;
    lessonStat: LessonStat;
    anythingToLearn: boolean;
    t: (key: string, options?: {
        replace: Record<string, unknown>;
    } | undefined) => string;
}
class ValidatingAlgorithm extends Algorithm {
    constructor({ lessonStat, variation, studentName, stake, skill, anythingToLearn, t }: ValidatingAlgorithmProps) {
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
                { title: t('🗣 Say to the tutee'), text: t('Great, you remember the skill.') },
            ]
        );

        const explainReimburse = new AlgorithmStage(
            7,
            StageType.explain_reimburse,
            t('No'),
            [
                { title: t('🗣 Say to the tutee'), text: t('You don’t have such a skill. I will penalize the tutor which issued the badge for it.') },
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
            t('Get bounty'),
            []
        );

        const provideFakeSolution = new AlgorithmStage(
            2,
            StageType.provide_fake_solution,
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
            StageType.ask_to_repeat_similar_exercise,
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has not created a similar exercise.') },
                { title: t('🗣 Say to the tutee'), text: t('Repeat after me:') + ' ' + question2, image: exerciseImage2 },
            ],
            t('Has the tutee repeated correctly after me?')
        );


        const askToCreateSimilarExercise = new AlgorithmStage(
            1,
            StageType.ask_to_create_similar_exercise,
            t('Yes'),
            [
                {
                    title: t('📖 Read what’s happening'),
                    text: t('You’ve refreshed your memory about the skill: {{skillName}}', { replace: { skillName: skill.h } })
                },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has the tutee now created a similar exercise?'),
            <ExampleExercisesButton skill={skill} />
        );

        const penalizationInfo = t('Help your student identify what they have learned wrongly from bad tutors. If you find a problem, the bad tutor will automatically send you a bonus.') ;

        const intro = new AlgorithmStage(
            0,
            StageType.encourage_penalization,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), 
                    text: anythingToLearn? t('Before teaching:') + ' ' + penalizationInfo : penalizationInfo
                },
            ]
        );

        const stat = new AlgorithmStage(
            0,
            StageType.see_statistics,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: '', reactNode: <LessonProcessInfo lessonStat={lessonStat} /> },
            ]
        );

        const tooFast = new AlgorithmStage(
            0,
            StageType.too_fast_warning,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: '', reactNode: <TooFastWarning /> },
            ]
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            1,
            StageType.cycle_ask_to_create_similar_exercise,
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has repeated correctly after me.') },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 }
            ],
            t('Has the tutee now created a similar exercise?'),
            <ExampleExercisesButton skill={skill} />
        );

        const findPatterns = new AlgorithmStage(
            1,
            StageType.find_patterns,
            t('Continue'),
            [
                {
                    title: t('📖 Read what’s happening'),
                    text: t('Try to earn {{stake}} Slon by checking how another tutor taught {{name}} the skill:', { replace: { name: studentName, stake: stake } }) + (skill && ' ' + skill.h)
                },
                { title: t('🧠 Don’t show it to tutee. Try to find patterns'), text: '', reactNode: <ExerciseList exercises={skill.q} location='reexamine'/> },
            ],
            t('Ready to examine this skill?')
        );


        // Algo linking:
        if (variation === 'with_too_fast_warning') {
            this.begin = tooFast;
        } else if (variation === 'intro') {
            this.begin = intro;
        } else if (variation === 'with_stat') {
            this.begin = stat;
        } else {
            this.begin = findPatterns;
        }

        intro.setNext([findPatterns]);
        tooFast.setNext([findPatterns]);
        stat.setNext([findPatterns]);

        askToCreateSimilarExercise.setPrevious(findPatterns);

        findPatterns.setNext([skip, askToCreateSimilarExercise]);


        askToCreateSimilarExercise.setNext([provideFakeSolution, askToRepeatTheExerciseAfterMe]);
        provideFakeSolution.setPrevious(askToCreateSimilarExercise);
        askToRepeatTheExerciseAfterMe.setPrevious(askToCreateSimilarExercise);

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
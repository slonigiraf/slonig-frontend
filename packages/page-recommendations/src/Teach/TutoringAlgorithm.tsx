import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import { Skill } from '@slonigiraf/slonig-components';
import ExampleExercisesButton from './ExampleExercisesButton.js';
import LessonProcessInfo from './LessonProcessInfo.js';
import { Lesson } from '@slonigiraf/db';
import TooFastWarning from './TooFastWarning.js';
import { ExerciseList } from '@slonigiraf/app-laws';

export type TutoringAlgorithmType = 'with_too_fast_warning' | 'tutorial' | 'with_stat' | 'no_stat';
export interface TutoringAlgorithmProps {
    lesson: Lesson;
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
    constructor({ lesson, variation, studentName, stake, canIssueBadge, skill, hasTuteeUsedSlonig, t }: TutoringAlgorithmProps) {
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
            'decide_about_badge',
            t('Yes'),
            [],
            t('I risk losing {{stake}} Slon if {{name}} forgets this skill. I’m awarding a badge for this skill.', { replace: { name: studentName, stake: stake } })
        );

        const repeatTomorrow = new AlgorithmStage(
            -1,
            'repeat_tomorrow',
            t('No'),
            []
        );

        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            5,
            'correct_fake_solution',
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has not corrected me.') },
                { title: t('🗣 Show the tutee the correct execution, and say'), text: t('Repeat after me.') },
            ],
            t('Has the tutee repeated correctly?'),
            <ExampleExercisesButton skill={skill} />
        );

        const askStudentToRepeatTheSolutionOfExerciseOfTutor = new AlgorithmStage(
            0,
            'ask_to_repeat_example_solution',
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has not executed the exercise correctly.') },
                { title: t('🗣 Say to the tutee'), text: t('Repeat after me:') + ' ' + answer1, image: answerImage1 },
            ],
            t('Has the tutee repeated correctly?')
        );

        const provideFakeAnswer = new AlgorithmStage(
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

        const askToRepeatTaskAfterMe = new AlgorithmStage(
            2,
            'ask_to_repeat_similar_exercise',
            t('No'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has not created a similar exercise.') },
                { title: t('🗣 Say to the tutee'), text: t('Repeat after me:') + ' ' + question2, image: exerciseImage2 },
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
            'begin_ask_to_create_similar_exercise',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('You’ve refreshed your memory about the skill: {{skillName}}', { replace: { skillName: skill.h } }) },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has the tutee now created a similar exercise?'),
            <ExampleExercisesButton skill={skill} />
        );

        const findPatterns = new AlgorithmStage(
            1,
            'find_patterns',
            t('Continue'),
            [
                { title: t('📖 Read what’s happening'), text: t('{{name}} asks you to teach the skill: {{skillName}}', { replace: { name: studentName, skillName: skill.h } }) },
                { title: t('🧠 Don’t show it to tutee. Try to find patterns'), text: '', reactNode: <ExerciseList exercises={skill.q} location='teach' /> },
            ],
            t('Ready to teach this skill?')
        );

        //Use only if student never used Slonig
        const intro = new AlgorithmStage(
            0,
            'first_time_intro',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('You are a tutor. The app will show you how to teach the student who showed you a QR code.') },
            ],
            t('Let’s start with a simple skill. Your student will pretend not to know it.'),
            <ExampleExercisesButton skill={skill} />
        );
        // Stat for users that know how to use it.
        const stat = new AlgorithmStage(
            0,
            'see_statistics',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: '', reactNode: <LessonProcessInfo lesson={lesson} /> },
            ]
        );

        const askToCreateAnExerciseAfterCompletionOfExerciseOfTutor = new AlgorithmStage(
            1,
            'ask_to_create_similar_exercise',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has executed the exercise correctly.') },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has the tutee now created a similar exercise?'),
            <ExampleExercisesButton skill={skill} />
        );

        const askStudentToSolveAnExercise = new AlgorithmStage(
            1,
            'begin_ask_to_solve_exercise',
            t('Start'),
            [
                { title: t('📖 Read what’s happening'), text: t('You’ve refreshed your memory about the skill: {{skillName}}', { replace: { skillName: skill.h } }) },
                { title: t('🗣 Say to the tutee'), text: question1, image: exerciseImage1 },
            ],
            t('Has the tutee now executed the exercise correctly?'),
            <ExampleExercisesButton skill={skill} />
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            1,
            'cycle_ask_to_create_similar_exercise',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: t('The tutee has repeated correctly after me.') },
                { title: t('🗣 Say to the tutee'), text: t('Create an exercise similar to this:') + ' ' + question1, image: exerciseImage1 },
            ],
            t('Has the tutee now created a similar exercise?'),
            <ExampleExercisesButton skill={skill} />
        );

        const toNextSkill = new AlgorithmStage(
            -1,
            'next_skill',
            canIssueBadge ? t('Risk') : t('Yes'),
            []
        );

        const tooFast = new AlgorithmStage(
            0,
            'too_fast_warning',
            t('Yes'),
            [
                { title: t('📖 Read what’s happening'), text: '', reactNode: <TooFastWarning /> },
            ]
        );

        // Defining the first step

        if (!hasTuteeUsedSlonig || variation === 'tutorial') {
            findPatterns.setNext([skip, askStudentToSolveAnExercise]);
            askStudentToSolveAnExercise.setPrevious(findPatterns);
        } else {
            findPatterns.setNext([skip, askStudentToCreateASimilarExercise]);
            askStudentToCreateASimilarExercise.setPrevious(findPatterns);
        }

        if (variation === 'with_too_fast_warning') {
            this.begin = tooFast;
        } else if (variation === 'tutorial') {
            this.begin = intro;
        } else if (variation === 'with_stat') {
            this.begin = stat;
        } else {
            this.begin = findPatterns;
        }

        // Algo linking
        intro.setNext([findPatterns]);
        tooFast.setNext([findPatterns]);
        stat.setNext([findPatterns])

        askStudentToSolveAnExercise.setNext([askToCreateAnExerciseAfterCompletionOfExerciseOfTutor, askStudentToRepeatTheSolutionOfExerciseOfTutor]);

        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setPrevious(askStudentToSolveAnExercise);
        askStudentToRepeatTheSolutionOfExerciseOfTutor.setPrevious(askStudentToSolveAnExercise);

        askToCreateAnExerciseAfterCompletionOfExerciseOfTutor.setNext([provideFakeAnswer, askToRepeatTaskAfterMe]);
        if (!bothUsedSlonig) {
            provideFakeAnswer.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
            askToRepeatTaskAfterMe.setPrevious(askToCreateAnExerciseAfterCompletionOfExerciseOfTutor);
        }

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

        askStudentToCreateASimilarExercise.setNext([provideFakeAnswer, askToRepeatTaskAfterMe]);
        if (bothUsedSlonig) {
            provideFakeAnswer.setPrevious(askStudentToCreateASimilarExercise);
            askToRepeatTaskAfterMe.setPrevious(askStudentToCreateASimilarExercise);
        }
    }
}

export { TutoringAlgorithm };
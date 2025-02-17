import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import type { IMessage, Skill } from '@slonigiraf/app-slonig-components';
import { Reexamination } from '@slonigiraf/db';
import BN from 'bn.js';
import ExampleExercisesButton from './ExampleExercisesButton.js';

class ValidatingAlgorithm extends Algorithm {
    constructor(t: any, studentName: string | null, skill: Skill, reexamination: Reexamination) {
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
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME EXERCISE FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;
        let exerciseImage1: string | undefined = questions.length > 0 ? questions[0].p : undefined;
        let exerciseImage2: string | undefined = questions.length > 0 ? questions[1].p : undefined;

        // Initialize all stages
        const validateDiploma = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            [
                { ...myMessage, text: t('Great, you remember the skill.') },
            ]
        );

        const amount = new BN(reexamination?.amount).div(new BN("1000000000000"));

        const explainReimburse = new AlgorithmStage(
            'intermediate',
            t('No'),
            [
                { ...myMessage, text: t('You don\'t have such a skill. I will penalize the tutor which issued the diploma for it.'), comment: `${t('Press \"Get bounty\" to receive')} ${amount?.toString()} Slon.` },
            ]
        );

        const skip = new AlgorithmStage(
            'skip',
            t('Skip'),
            []
        );

        const nextToTeaching = new AlgorithmStage(
            'success',
            t('Next'),
            []
        );

        const reimburse = new AlgorithmStage(
            'reimburse',
            t('Get bounty'),
            []
        );

        const provideFakeSolution = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            [
                { ...theirMessage, text: t('...'), comment: t('An exercise invented by a student.') },
                { ...myMessage, text: t('...'), comment: t('I deliberately incorrectly perform the exercise invented by the student and say:') },
                { ...myMessage, text: t('Correct me.') },
            ],
            t('Has the student corrected the wrong solution?'),
            <ExampleExercisesButton skill={skill} />
        );

        const askToRepeatTheExerciseAfterMe = new AlgorithmStage(
            'intermediate',
            t('No'),
            [
                { ...theirMessage, text: '...', comment: t('The student has not come up with the type of exercise needed.') },
                { ...myMessage, text: t('Repeat after me:') },
                { ...myMessage, text: question2, image: exerciseImage2, comment: t('I can change the exercise a little.') },
            ],
            t('Has the student repeated correctly after me?')
        );

        this.begin = new AlgorithmStage(
            'begin',
            t('Yes'),
            [
                { ...theirMessage, text: t('Try to earn a bonus by testing my previous skill:') + (skill && " \"" + skill.h + "\".") },
                { ...myMessage, text: t('Come up with an exercise similar to this:') },
                { ...myMessage, text: question1, image: exerciseImage1, comment: t('I can change the exercise a little.') },
            ],
            t('Has the student now invented a similar exercise?')
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            'begin',
            t('Yes'),
            [
                { ...theirMessage, text: t('...'), comment: t('The student has repeated correctly after me.') },
                { ...myMessage, text: t('Come up with an exercise similar to this:') },
                { ...myMessage, text: question1, image: exerciseImage1, comment: t('I can change the exercise a little.') },
            ]
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
import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { Insurance } from '../db/Insurance.js';
import BN from 'bn.js';

class ValidatingAlgorithm extends Algorithm {
    constructor(t: any, skill: Skill, insurance: Insurance) {
        super();
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME EXERCISE FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;

        // Initialize all stages
        const validateDiploma = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <div>
                <b>{t('Tell the student')}: </b>
                <em>{t('Great, you remember the skill. Let\'s start learning a new skill.')}</em>
            </div>,
            []
        );


        const amount = new BN(insurance?.amount).div(new BN("1000000000000"));

        const explainReimburse = new AlgorithmStage(
            'intermediate',
            t('No'),
            <div>
                <b>{t('Tell the student')}: </b>
                <em>{t('You don\'t have such a skill. I will penalize the tutor which issued the diploma for it.')} </em>
                <b>{`${t('Press \'Get bounty\' to receive')} ${amount?.toString()} Slon.`}</b>
            </div>,
            []
        );

        const nextToTeaching = new AlgorithmStage(
            'success',
            t('I\'ve said it now'),
            <></>,
            []
        );
        const reimburse = new AlgorithmStage(
            'reimburse',
            t('Get bounty'),
            <></>,
            []
        );

        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            'intermediate',
            t('No'),
            <div>
                <b>{t('Tell the student')}: </b>
                <em>{t('Repeat after me')}. </em>;
                <b>{t('And then provide the correct answer.')}</b>
            </div>,
            [explainReimburse]
        );

        const hasStudentCorrectedTheFakeAnswer = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <div>
                <b>{t('Has the student corrected the wrong answer?')}</b>
            </div>,
            [validateDiploma, explainReimburse]
        );

        const didStudentRepeatedAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <div>
                <b>{t('Did the student repeat correctly after me?')}</b>
            </div>,
            []
        );

        const provideFakeAnswer = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <div>
                <b>{t('Respond to the student with a wrong answer, and ask:')} </b>
                <em>{t('Am I right?')}</em>
            </div>,
            [hasStudentCorrectedTheFakeAnswer]
        );

        const askToRepeatTaskAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('No'),
            <div>
                <b>{t('Tell the student')}: </b>
                <em>{t('Repeat after me')}: </em>
                <em>{question2}</em>
            </div>,
            [didStudentRepeatedAfterMeTheTask]
        );

        const didStudentCreatedASimilarTask = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <div>
                <b>{t('Has the student now created a similar exercise?')}</b>
            </div>,
            [provideFakeAnswer, askToRepeatTaskAfterMeTheTask]
        );

        // Link stages
        this.begin = new AlgorithmStage(
            'begin',
            t('Yes'),
            <div>
                <b>{t('Tell the student')}: </b>
                <em>{t('Create an exercise similar to')}: </em>
                <em>{question1}</em>
            </div>,
            [didStudentCreatedASimilarTask]
        );

        // Rest of the linking
        didStudentRepeatedAfterMeTheTask.setNext([this.begin, askToRepeatTaskAfterMeTheTask]);
        didStudentCreatedASimilarTask.setPrevious(this.begin);
        askToRepeatTaskAfterMeTheTask.setPrevious(didStudentCreatedASimilarTask);
        askStudentToRepeatTheAnswer.setPrevious(hasStudentCorrectedTheFakeAnswer);
        provideFakeAnswer.setPrevious(didStudentCreatedASimilarTask);
        didStudentRepeatedAfterMeTheTask.setPrevious(askToRepeatTaskAfterMeTheTask);
        hasStudentCorrectedTheFakeAnswer.setPrevious(provideFakeAnswer);
        validateDiploma.setPrevious(hasStudentCorrectedTheFakeAnswer);
        explainReimburse.setPrevious(hasStudentCorrectedTheFakeAnswer);
        explainReimburse.setNext([reimburse]);
        validateDiploma.setNext([nextToTeaching]);
    }
}

export { ValidatingAlgorithm };
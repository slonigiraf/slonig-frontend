import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';

class TeachingAlgorithm extends Algorithm {
    constructor(t: any, questions: any[]) {
        super();
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME TASK FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;

        // Initialize all stages
        const giveInsurance = new AlgorithmStage(
            'success',
            t('Yes'),
            <div>
                <b>{t('Say')}: </b>
                <em>{t('Buy a skill diploma from me to get a bonus from a teacher.')}</em>
                <br />
                <b>{t('Sell the student a diploma in exchange for money or Slon tokens.')}</b>
            </div>,
            []
        );
        const repeatNextDay = new AlgorithmStage(
            'repeat',
            t('No'),
            <div>
                <b>{t('Say')}:</b>
                &nbsp;<em>{t('Excellent! Let\'s repeat this tomorrow.')}</em>
            </div>,
            []
        );

        const hasStudentRepeatedTheRightAnswer = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <div>
                <b>{t('Has the student repeated the right answer?')}</b>
            </div>,
            []
        );

        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            'intermediate',
            t('No'),
            <div>
                <b>{t('Tell the student')}:</b>
                &nbsp;<em>{t('Repeat after me.')}</em>&nbsp;
                <b>{t('And then provide the correct answer.')}</b>
            </div>,
            [hasStudentRepeatedTheRightAnswer]
        );

        const wereTheStudentTasksAndAnswersPerfectToday = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <div>
                <b>{t('Were all of the student\'s exercises and answers perfect today?')}</b>
            </div>,
            [giveInsurance, repeatNextDay]
        );

        const hasStudentCorrectedTheFakeAnswer = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <div>
                <b>{t('Has the student corrected the wrong answer?')}</b>
            </div>,
            [wereTheStudentTasksAndAnswersPerfectToday, askStudentToRepeatTheAnswer]
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
                <b>{t('Respond to the student with a wrong answer, and ask:')}</b>
                &nbsp;<em>{t('Am I right?')}</em>
            </div>,
            [hasStudentCorrectedTheFakeAnswer]
        );

        const askToRepeatTaskAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('No'),
            <div>
                <b>{t('Tell the student:')}</b>
                &nbsp;<em>{t('Repeat after me:')}</em>
                &nbsp;<em>{question2}</em>
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
                <b>{t('Tell the student')}:</b>
                <em>&nbsp;{t('Create an exercise similar to')}:</em>
                <em>&nbsp;{question1}</em>
            </div>,
            [didStudentCreatedASimilarTask]
        );

        // Rest of the linking
        hasStudentRepeatedTheRightAnswer.setNext([this.begin, askStudentToRepeatTheAnswer]);
        didStudentRepeatedAfterMeTheTask.setNext([this.begin, askToRepeatTaskAfterMeTheTask]);

        didStudentCreatedASimilarTask.setPrevious(this.begin);
        hasStudentRepeatedTheRightAnswer.setPrevious(askStudentToRepeatTheAnswer);
        askToRepeatTaskAfterMeTheTask.setPrevious(didStudentCreatedASimilarTask);
        askStudentToRepeatTheAnswer.setPrevious(hasStudentCorrectedTheFakeAnswer);
        provideFakeAnswer.setPrevious(didStudentCreatedASimilarTask);
        didStudentRepeatedAfterMeTheTask.setPrevious(askToRepeatTaskAfterMeTheTask);
        hasStudentCorrectedTheFakeAnswer.setPrevious(provideFakeAnswer);
        wereTheStudentTasksAndAnswersPerfectToday.setPrevious(hasStudentCorrectedTheFakeAnswer);
        giveInsurance.setPrevious(wereTheStudentTasksAndAnswersPerfectToday);
        repeatNextDay.setPrevious(wereTheStudentTasksAndAnswersPerfectToday);
    }
}

export { TeachingAlgorithm };
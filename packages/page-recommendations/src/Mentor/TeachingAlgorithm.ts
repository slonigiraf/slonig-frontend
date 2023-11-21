import { AlgorithmStage } from './AlgorithmStage'; // Update the path as necessary
import { useTranslation } from '../translate.js';

class TeachingAlgorithm {
    private begin: AlgorithmStage;

    constructor(tasks: string[]) {
        const { t } = useTranslation();
        let question1: string = tasks.length > 0 ? tasks[0] : t('SOME TASK FOR SKILL TRAINING (THE MENTOR SHOULD KNOW)');
        let question2: string = tasks.length > 1 ? tasks[1] : question1;

        // Initialize all stages
        const giveInsurance = new AlgorithmStage(
            t('YES'),
            t('<b>Say:</b> <em>Buy a skill diploma from me so that you can sell it at a higher price to your employer.</em><br/><b>Sell the student a diploma in exchange for money or Slon tokens.</b>'),
            []
        );
        const repeatNextDay = new AlgorithmStage(
            t('NO'),
            t('<b>Say:</b> <em>Excellent! Let\'s repeat this tomorrow.</em>'),
            []
        );

        const hasStudentRepeatedTheRightAnswer = new AlgorithmStage(
            t('I\'ve said it now'),
            t('<b>Has the student repeated the right answer?</b>'),
            []
        );
        
        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            t('NO'),
            `${t('<b>Tell the student:</b> <em>Repeat after me</em>')}. ${t('<b>And then provide the correct answer.</b>')}`,
            [hasStudentRepeatedTheRightAnswer]
        );
        
        const wereTheStudentTasksAndAnswersPerfectToday = new AlgorithmStage(
            t('YES'),
            t('<b>Were all of the student\'s tasks and answers perfect today?</b>'),
            [giveInsurance, repeatNextDay]
        );
        
        const hasStudentCorrectedTheFakeAnswer = new AlgorithmStage(
            t('I\'ve said it now'),
            t('<b>Has the student corrected the wrong answer?</b>'),
            [wereTheStudentTasksAndAnswersPerfectToday, askStudentToRepeatTheAnswer]
        );
        
        const didStudentRepeatedAfterMeTheTask = new AlgorithmStage(
            t('I\'ve said it now'),
            t('<b>Did the student repeat correctly after me?</b>'),
            []
        );
        
        const provideFakeAnswer = new AlgorithmStage(
            t('YES'),
            t('<b>Respond to the student with wrong answer, and ask:</b> <em>Am I right?</em>'),
            [hasStudentCorrectedTheFakeAnswer]
        );
        
        const askToRepeatTaskAfterMeTheTask = new AlgorithmStage(
            t('NO'),
            `${t('<b>Tell the student:</b> <em>Repeat after me</em>')}: <em>${question2}</em>`, // Assuming question2 is defined
            [didStudentRepeatedAfterMeTheTask]
        );
        
        const didStudentCreatedASimilarTask = new AlgorithmStage(
            t('I\'ve said it now'),
            t('<b>Has the student now created a similar task?</b>'),
            [provideFakeAnswer, askToRepeatTaskAfterMeTheTask]
        );        

        // Link stages
        this.begin = new AlgorithmStage(
            t('YES'),
            `${t('<b>Tell the student:</b> <em>Create a task similar to</em>')}: <em>${question1}</em>`,
            [didStudentCreatedASimilarTask] // Assuming didStudentCreatedASimilarTask is defined
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

    public getBegin(): AlgorithmStage {
        return this.begin;
    }
}

export { TeachingAlgorithm };
import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import { ExerciseList } from '@slonigiraf/app-laws';
import ChatSimulation from './ChatSimulation.js';

class TeachingAlgorithm extends Algorithm {
    constructor(t: any, studentName: string, skillJson: any) {
        super();
        const questions = skillJson ? skillJson.q : [];
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
                &nbsp;<em>{t('Repeat after me')}.</em>&nbsp;
                <b>{t('And then give the correct solution and answer to the exercise invented by the student. The tutor can peek at solution examples here:')}</b>
                {questions != null && <ExerciseList exercises={questions} areShownInitially={true} />}
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
                <ChatSimulation messages={[
                    { id: 1, text: t('Am I right?'), sender: 'you', senderName: 'You' },
                    { id: 2, text: t('...'), sender: 'them', senderName: studentName },
                ]} />
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
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('An exercise created by a student.') },
                    { id: 2, text: t('...'), sender: 'you', senderName: 'You', comment: t('Do the exercise invented by the student incorrectly and ask:') },
                    { id: 3, text: t('Am I right?'), sender: 'you', senderName: 'You' },
                ]} />
            </div>,
            [hasStudentCorrectedTheFakeAnswer]
        );

        const askToRepeatTaskAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('No'),
            <div>
                <ChatSimulation messages={[
                    { id: 1, text: '...', sender: 'them', senderName: studentName },
                    { id: 2, text: t('Repeat after me') + ": \"" + question2 + "\"", sender: 'you', senderName: 'You' },
                ]} />
            </div>,
            [didStudentRepeatedAfterMeTheTask]
        );

        const didStudentCreatedASimilarTask = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <div>
                <ChatSimulation messages={[
                    { id: 1, text: t('Come up with an exercise similar to what I am going to say now. For example') + " \"" + question1 + "\"", sender: 'you', senderName: 'You' },
                    { id: 2, text: '...', sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student now created a similar exercise?')}</b>
            </div>,
            [provideFakeAnswer, askToRepeatTaskAfterMeTheTask]
        );



        // Link stages
        this.begin = new AlgorithmStage(
            'begin',
            t('Yes'),
            <div>
                <ChatSimulation messages={[
                    { id: 1, text: t('Teach me the skill') + (skillJson && ": \"" + skillJson.h + "\""), sender: 'them', senderName: studentName },
                    { id: 2, text: t('Come up with an exercise similar to what I am going to say now. For example') + " \"" + question1 + "\"", sender: 'you', senderName: 'You', comment: t('Say it in your own words, the exercise can be changed a little.') },
                ]} />
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
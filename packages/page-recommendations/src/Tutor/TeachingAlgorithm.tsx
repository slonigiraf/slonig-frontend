import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import { ExerciseList } from '@slonigiraf/app-laws';
import ChatSimulation from './ChatSimulation.js';
import { styled } from '@polkadot/react-components';

class TeachingAlgorithm extends Algorithm {
    constructor(t: any, studentName: string|null, skillJson: any) {
        super();
        const questions = skillJson ? skillJson.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME TASK FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;

        // Initialize all stages
        const giveInsurance = new AlgorithmStage(
            'success',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Buy a skill diploma from me to get a bonus from a teacher.'), sender: 'you', senderName: 'You', comment: t('I sell the student a diploma in exchange for money or Slon tokens.') }, 
                ]} />
            </StyledDiv>,
            []
        );
        const repeatNextDay = new AlgorithmStage(
            'repeat',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Excellent! Let\'s repeat this tomorrow.'), sender: 'you', senderName: 'You' }, 
                ]} />
            </StyledDiv>,
            []
        );

        const hasStudentRepeatedTheRightAnswer = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 2, text: t('...'), sender: 'you', senderName: 'You', comment: t('The student corrected me and gave me the correct solution.') },
                    { id: 3, text: t('...'), sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student repeated the correct solution and answer?')}</b>
            </StyledDiv>,
            []
        );

        const askStudentToRepeatTheAnswer = new AlgorithmStage(
            'intermediate',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student did not correct me.') },
                    { id: 2, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: t('...'), sender: 'you', senderName: 'You', comment: t('I give the correct solution and answer to the exercise invented by the student. I can peek at solution examples here:') },
                ]} />
                {questions != null && <ExerciseList exercises={questions} areShownInitially={true} />}
            </StyledDiv>,
            [hasStudentRepeatedTheRightAnswer]
        );

        const wereTheStudentTasksAndAnswersPerfectToday = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student corrected me and gave me the correct solution.') },
                ]} />
                <b>{t('Were all of the student\'s exercises and answers perfect today?')}</b>
            </StyledDiv>,
            [giveInsurance, repeatNextDay]
        );

        const hasStudentCorrectedTheFakeAnswer = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'you', senderName: 'You', comment: t('I deliberately perform the exercise invented by the student incorrectly and ask:') },
                    { id: 2, text: t('Am I right?'), sender: 'you', senderName: 'You' },
                    { id: 3, text: t('...'), sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student corrected the wrong answer?')}</b>
            </StyledDiv>,
            [wereTheStudentTasksAndAnswersPerfectToday, askStudentToRepeatTheAnswer]
        );

        const didStudentRepeatedAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 2, text: question2, sender: 'you', senderName: 'You' },
                    { id: 3, text: '...', sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Did the student repeat correctly after me?')}</b>
            </StyledDiv>,
            []
        );

        const provideFakeAnswer = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('An exercise created by a student.') },
                    { id: 2, text: t('...'), sender: 'you', senderName: 'You', comment: t('I deliberately perform the exercise invented by the student incorrectly and ask:') },
                    { id: 3, text: t('Am I right?'), sender: 'you', senderName: 'You' },
                ]} />
            </StyledDiv>,
            [hasStudentCorrectedTheFakeAnswer]
        );

        const askToRepeatTaskAfterMeTheTask = new AlgorithmStage(
            'intermediate',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: '...', sender: 'them', senderName: studentName, comment: t('The student did not come up with the type of exercise needed.') },
                    { id: 2, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question2, sender: 'you', senderName: 'You', comment: t('I say this in my own words. I can change the exercise a little.') },
                ]} />
            </StyledDiv>,
            [didStudentRepeatedAfterMeTheTask]
        );

        const didStudentCreatedASimilarTask = new AlgorithmStage(
            'intermediate',
            t('I\'ve said it now'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Come up with an exercise similar to what I am going to say now.'), sender: 'you', senderName: 'You' },
                    { id: 2, text: question1, sender: 'you', senderName: 'You' },
                    { id: 3, text: '...', sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student now created a similar exercise?')}</b>
            </StyledDiv>,
            [provideFakeAnswer, askToRepeatTaskAfterMeTheTask]
        );



        // Link stages
        this.begin = new AlgorithmStage(
            'begin',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Teach me the skill') + (skillJson && ": \"" + skillJson.h + "\""), sender: 'them', senderName: studentName },
                    { id: 2, text: t('Come up with an exercise similar to what I am going to say now.'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question1, sender: 'you', senderName: 'You', comment: t('I say this in my own words. I can change the exercise a little.') },
                ]} />
            </StyledDiv>,
            [didStudentCreatedASimilarTask]
        );

        const repeatFromTheBeginning = new AlgorithmStage(
            'begin',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student has repeated correctly after me.') },
                    { id: 2, text: t('Come up with an exercise similar to what I am going to say now.'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question1, sender: 'you', senderName: 'You', comment: t('I say this in my own words. I can change the exercise a little.') },
                ]} />
            </StyledDiv>,
            [didStudentCreatedASimilarTask]
        );

        // Rest of the linking
        hasStudentRepeatedTheRightAnswer.setNext([repeatFromTheBeginning, askStudentToRepeatTheAnswer]);
        didStudentRepeatedAfterMeTheTask.setNext([repeatFromTheBeginning, askToRepeatTaskAfterMeTheTask]);

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
const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  align-items: center;
`;
export { TeachingAlgorithm };
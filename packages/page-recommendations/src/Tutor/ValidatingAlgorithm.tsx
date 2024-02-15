import { AlgorithmStage } from './AlgorithmStage.js';
import { Algorithm } from './Algorithm.js';
import type { Skill } from '@slonigiraf/app-slonig-components';
import { Insurance } from '../db/Insurance.js';
import BN from 'bn.js';
import { styled } from '@polkadot/react-components';
import ChatSimulation from './ChatSimulation.js';
import { ExerciseList } from '@slonigiraf/app-laws';

class ValidatingAlgorithm extends Algorithm {
    constructor(t: any, studentName: string | null, skill: Skill, insurance: Insurance) {
        super();
        const questions = skill ? skill.q : [];
        let question1: string = questions.length > 0 ? questions[0].h : t('SOME EXERCISE FOR SKILL TRAINING (THE TUTOR SHOULD KNOW)');
        let question2: string = questions.length > 1 ? questions[1].h : question1;

        // Initialize all stages
        const validateDiploma = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Great, you remember the skill. Let\'s start learning a new skill.'), sender: 'you', senderName: 'You' },
                ]} />
            </StyledDiv>
        );


        const amount = new BN(insurance?.amount).div(new BN("1000000000000"));

        const explainReimburse = new AlgorithmStage(
            'intermediate',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('You don\'t have such a skill. I will penalize the tutor which issued the diploma for it.'), sender: 'you', senderName: 'You', comment: `${t('Press \'Get bounty\' to receive')} ${amount?.toString()} Slon.` },
                ]} />
            </StyledDiv>
        );

        const nextToTeaching = new AlgorithmStage(
            'success',
            t('Next'),
            <></>
        );
        const reimburse = new AlgorithmStage(
            'reimburse',
            t('Get bounty'),
            <></>
        );

        const hasStudentCorrectedTheFakeSolution = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'you', senderName: 'You', comment: t('I deliberately perform the exercise invented by the student incorrectly and ask:') },
                    { id: 2, text: t('Am I right?'), sender: 'you', senderName: 'You' },
                    { id: 3, text: t('...'), sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student corrected the wrong solution?')}</b>
            </StyledDiv>
        );
        

        const hasStudentRepeatedAfterMeTheExercise = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 2, text: question2, sender: 'you', senderName: 'You' },
                    { id: 3, text: '...', sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student repeated correctly after me?')}</b>
            </StyledDiv>
        );

        const provideFakeSolution = new AlgorithmStage(
            'intermediate',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('An exercise invented by a student.') },
                    { id: 2, text: t('...'), sender: 'you', senderName: 'You', comment: t('I deliberately perform the exercise invented by the student incorrectly and ask:') },
                    { id: 3, text: t('Am I right?'), sender: 'you', senderName: 'You' },
                ]} />
            </StyledDiv>
        );
        

        const askToRepeatTheExerciseAfterMe = new AlgorithmStage(
            'intermediate',
            t('No'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: '...', sender: 'them', senderName: studentName, comment: t('The student has not come up with the type of exercise needed.') },
                    { id: 2, text: t('Repeat after me:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question2, sender: 'you', senderName: 'You', comment: t('I can change the exercise a little.') },
                ]} />
            </StyledDiv>
        );
        

        const hasStudentCreatedASimilarExercise = new AlgorithmStage(
            'intermediate',
            t('Next'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Come up with an exercise similar to this:'), sender: 'you', senderName: 'You' },
                    { id: 2, text: question1, sender: 'you', senderName: 'You' },
                    { id: 3, text: '...', sender: 'them', senderName: studentName },
                ]} />
                <b>{t('Has the student now invented a similar exercise?')}</b>
            </StyledDiv>
        );
        

        // Link stages
        this.begin = new AlgorithmStage(
            'begin',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('Before teaching me, try to earn a bonus by testing my previous skill:') + (skill && " \"" + skill.h + "\""), sender: 'them', senderName: studentName },
                    { id: 2, text: t('Come up with an exercise similar to this:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question1, sender: 'you', senderName: 'You', comment: t('I can change the exercise a little.') },
                ]} />
            </StyledDiv>
        );
        

        const repeatFromTheBeginning = new AlgorithmStage(
            'begin',
            t('Yes'),
            <StyledDiv>
                <ChatSimulation messages={[
                    { id: 1, text: t('...'), sender: 'them', senderName: studentName, comment: t('The student has repeated correctly after me.') },
                    { id: 2, text: t('Come up with an exercise similar to this:'), sender: 'you', senderName: 'You' },
                    { id: 3, text: question1, sender: 'you', senderName: 'You', comment: t('I can change the exercise a little.') },
                ]} />
            </StyledDiv>
        );
        

        // Algo linking:
        this.begin.setNext([hasStudentCreatedASimilarExercise]);
        hasStudentCreatedASimilarExercise.setPrevious(this.begin);
        hasStudentCreatedASimilarExercise.setNext([provideFakeSolution, askToRepeatTheExerciseAfterMe]);// Fork #1
        provideFakeSolution.setPrevious(hasStudentCreatedASimilarExercise);
        askToRepeatTheExerciseAfterMe.setPrevious(hasStudentCreatedASimilarExercise);

        // Fork #1: 'Yes'
        provideFakeSolution.setNext([hasStudentCorrectedTheFakeSolution]);
        hasStudentCorrectedTheFakeSolution.setPrevious(provideFakeSolution);
        hasStudentCorrectedTheFakeSolution.setNext([validateDiploma, explainReimburse]);// Fork #2
        validateDiploma.setPrevious(hasStudentCorrectedTheFakeSolution);
        explainReimburse.setPrevious(hasStudentCorrectedTheFakeSolution);

        // Fork #1: 'Yes' -> Fork #2: 'Yes'
        validateDiploma.setNext([nextToTeaching]); // Algo end (no bonus)

        // Fork #1: 'Yes' -> Fork #2: 'No'
        explainReimburse.setNext([reimburse]); // Algo end (bonus)

        // Fork #1: 'No' (and Fork #3: 'No')
        askToRepeatTheExerciseAfterMe.setNext([hasStudentRepeatedAfterMeTheExercise]);
        hasStudentRepeatedAfterMeTheExercise.setPrevious(askToRepeatTheExerciseAfterMe);
        hasStudentRepeatedAfterMeTheExercise.setNext([repeatFromTheBeginning, askToRepeatTheExerciseAfterMe]); // Fork #3
        repeatFromTheBeginning.setPrevious(hasStudentRepeatedAfterMeTheExercise);

        // Fork #1: 'No' -> Fork #3: 'Yes'
        repeatFromTheBeginning.setNext([hasStudentCreatedASimilarExercise]);

    }
}
const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  align-items: center;
`;
export { ValidatingAlgorithm };
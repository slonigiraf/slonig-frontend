// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, styled } from '@polkadot/react-components';
import React, { useCallback } from 'react'
import { useTranslation } from '../translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { HintBubble, Skill, useBooleanSettingValue, useLog } from '@slonigiraf/slonig-components';
import { ExerciseList, ExerciseListLocation } from '@slonigiraf/app-laws';
import { setSettingToTrue, SettingKey } from '@slonigiraf/db';

interface Props {
  className?: string;
  skill: Skill;
  location: ExerciseListLocation;
}

function ExampleExercisesButton({ className = '', skill, location}: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);
  const pressingExamplesTutorialCompleted = useBooleanSettingValue(SettingKey.PRESSING_EXAMPLES_TUTORIAL_COMPLETED);
  const isHintShown = pressingExamplesTutorialCompleted === false;


  const clickExamples = useCallback(async () => {
    if (pressingExamplesTutorialCompleted === false) {
      logEvent('ONBOARDING', 'PRESSING_EXAMPLES_TUTORIAL_COMPLETED');
    }
    logEvent('TUTORING', 'CLICK_EXAMPLES');
    await setSettingToTrue(SettingKey.PRESSING_EXAMPLES_TUTORIAL_COMPLETED);
    toggleDetailsOpen();
  }, [pressingExamplesTutorialCompleted, setSettingToTrue, toggleDetailsOpen]);

  return (
    <>
      <StyledDiv>
        <ButtonWrap>
          {isHintShown && !areDetailsOpen && (
            <StyledHint onClick={() => { }} tailLeft="80%">
              <h2>{t('Try pressing this button')}</h2>
            </StyledHint>
          )}

          <Button
            label={location === 'example_exercises_and_solutions' ? t('example solutions') : t('example exercises')}
            onClick={clickExamples}
          />
        </ButtonWrap>

        {areDetailsOpen && (
          <Modal
            header={t('Hide it from your student!')}
            onClose={toggleDetailsOpen}
            size="small"
          >
            <Modal.Content>
              <ExerciseList exercises={skill.q} location={location} />
            </Modal.Content>
          </Modal>
        )}
      </StyledDiv>
    </>
  );
}

const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  justify-content: right;
  margin-top: -30px;
  margin-bottom: -5px;
  color: red;
`;

const ButtonWrap = styled.div`
  position: relative;
  display: inline-flex;
  overflow: visible;
  justify-content: right;
`;

const StyledHint = styled(HintBubble)`
  left: 10%;
`;

const Important = styled.span`
  color: red;
  font-weight: bold;
`;

export default React.memo(ExampleExercisesButton);
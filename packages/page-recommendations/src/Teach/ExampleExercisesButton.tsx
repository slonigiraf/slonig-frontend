// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, styled } from '@polkadot/react-components';
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from '../translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { HintBubble, KatexSpan, Skill, useBooleanSettingValue, useLog } from '@slonigiraf/slonig-components';
import { ExerciseList } from '@slonigiraf/app-laws';
import { setSettingToTrue, SettingKey, storeSetting } from '@slonigiraf/db';

interface Props {
  className?: string;
  skill: Skill;
}

function ExampleExercisesButton({ className = '', skill }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);
  const pressingExamplesTutorialCompleted = useBooleanSettingValue(SettingKey.PRESSING_EXAMPLES_TUTORIAL_COMPLETED);
  const isHintShown = pressingExamplesTutorialCompleted === false;


  const clickExamples = useCallback(async () => {
    if (pressingExamplesTutorialCompleted === false) {
      logEvent('ONBOARDING', 'PRESSING_EXAMPLES_TUTORIAL_COMPLETED');
    }
    await setSettingToTrue(SettingKey.PRESSING_EXAMPLES_TUTORIAL_COMPLETED);
    toggleDetailsOpen();
  }, [pressingExamplesTutorialCompleted, setSettingToTrue, toggleDetailsOpen]);



  return (
    <>
      <StyledDiv>
        <ButtonWrap>
          {isHintShown && !areDetailsOpen && (
            <StyledHint onClick={() => {}} tailLeft="80%">
              <h2>{t('Try pressing this button')}</h2>
            </StyledHint>
          )}

          <Button
            label={t('examples')}
            onClick={clickExamples}
          />
        </ButtonWrap>

        {areDetailsOpen && (
          <Modal
            header={<KatexSpan content={skill.h} />}
            onClose={toggleDetailsOpen}
            size="small"
          >
            <Modal.Content>
              <h3>{t('Example exercises to train the skill')}</h3>
              <ExerciseList exercises={skill.q} />
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

export default React.memo(ExampleExercisesButton);
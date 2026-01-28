// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, styled } from '@polkadot/react-components';
import React, { useCallback } from 'react'
import { useTranslation } from '../translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { HintBubble, KatexSpan, Skill, useBooleanSettingValue, useLog } from '@slonigiraf/slonig-components';
import { ExerciseList } from '@slonigiraf/app-laws';
import { setSettingToTrue, SettingKey } from '@slonigiraf/db';

interface Props {
  className?: string;
  skill: Skill;
}

function ExampleExercises({ className = '', skill }: Props): React.ReactElement<Props> {
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
    <StyledDiv>
      <ExerciseList exercises={skill.q} />
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

export default React.memo(ExampleExercises);
// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, styled } from '@polkadot/react-components';
import React from 'react'
import { useTranslation } from '../translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { AlignRightDiv, KatexSpan, Skill } from '@slonigiraf/app-slonig-components';
import { ExerciseList } from '@slonigiraf/app-laws';

interface Props {
  className?: string;
  skill: Skill;
}

function ExampleExercisesButton({ className = '', skill }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);
  return (
    <StyledDiv>
      <Button
        label={t('examples')}
        onClick={toggleDetailsOpen}
      />
      {areDetailsOpen &&
        <Modal
          header={<KatexSpan content={skill.h} />}
          onClose={toggleDetailsOpen}
          size='small'
        >
          <Modal.Content>
            <h3>{t('Example exercises to train the skill')}</h3>
            <ExerciseList exercises={skill.q} />
          </Modal.Content>
        </Modal>}
    </StyledDiv>
  );
}
export const StyledDiv = styled.div`
    width: 100%;
    display: flex;
    justify-content: right;
    margin-top: -30px;
    margin-bottom: -5px;
`;
export default React.memo(ExampleExercisesButton);
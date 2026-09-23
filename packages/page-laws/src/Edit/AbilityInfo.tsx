// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Spinner, styled } from '@polkadot/react-components';
import React from 'react'
import { useTranslation } from '../translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { KatexSpan, parseJson } from '@slonigiraf/slonig-components';
import { deleteAbility, storeAbility } from '@slonigiraf/db';
import type { Ability } from '@slonigiraf/db';
import ExerciseList from './ExerciseList.js';

interface Props {
  className?: string;
  ability: Ability;
}

function AbilityInfo({ className = '', ability }: Props): React.ReactElement<Props> {
  type JsonType = { [key: string]: any } | null;
  const { t } = useTranslation();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);

  const data: JsonType = parseJson(ability.content);
  const saveVisualError = async (exerciseIndex: number, field: 'p' | 'i', hasError: boolean): Promise<void> => {
    if (!data || !Array.isArray(data.q) || !data.q[exerciseIndex] || typeof data.q[exerciseIndex] !== 'object') {
      return;
    }

    const errorField = field === 'p' ? 'pError' : 'iError';
    const exercise = data.q[exerciseIndex] as Record<string, unknown>;

    if (exercise[errorField] === hasError) {
      return;
    }

    const q = data.q.map((value: unknown, index: number) => index === exerciseIndex
      ? { ...(value as Record<string, unknown>), [errorField]: hasError || undefined }
      : value);
    const newRecordId = await storeAbility(ability.moduleId, JSON.stringify({ ...data, q }));

    if (newRecordId !== ability.id) {
      await deleteAbility(ability.id);
    }
  };

  const skillNameToShow = data ? <KatexSpan content={data.h} /> : <Spinner noLabel />;

  return (
    <StyledDiv>
      <RowDiv>
        <Button className='inList' icon='eye' onClick={toggleDetailsOpen} />
        {skillNameToShow}
      </RowDiv>

      {areDetailsOpen && <>
        <Modal
          header={skillNameToShow}
          onClose={toggleDetailsOpen}
          size='small'
        >
          <Modal.Content>
            {
              data === null ? "" :
                <>
                  {
                    data.t !== null && data.t === 3 &&
                    <>
                      <h3>{t('Example exercises to train the skill')}</h3>
                    </>
                  }
                  {data.q != null && <ExerciseList exercises={data.q} location='ability_info' onAbilityVisualErrorChange={saveVisualError} />}
                </>
            }
          </Modal.Content>
        </Modal>
      </>}
    </StyledDiv>
  )
}


const StyledDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  .ui--Spinner {
    width: 50px;
    margin-left: 25px;
    margin-right: 25px;
  }
`;
const RowDiv = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: start;
  padding: 0px;
  > span {
    margin-right: 10px;
    margin-left: 10px;
  }
  .ui--Spinner{
    width: 50px;
    margin-left: 25px;
    margin-right: 25px;
  }
`;

export default React.memo(AbilityInfo);

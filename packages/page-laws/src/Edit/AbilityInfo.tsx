// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Spinner, styled } from '@polkadot/react-components';
import React from 'react'
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from '../translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { KatexSpan, parseJson } from '@slonigiraf/slonig-components';
import { getImage, hydrateAbilityContent, putImage } from '@slonigiraf/db';
import type { Ability } from '@slonigiraf/db';
import ExerciseList from './ExerciseList.js';
import { nextStoredTikzValidity } from './tikzValidation.js';

interface Props {
  className?: string;
  ability: Ability;
}

function AbilityInfo({ className = '', ability }: Props): React.ReactElement<Props> {
  type JsonType = { [key: string]: any } | null;
  const { t } = useTranslation();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);

  const hydratedContent = useLiveQuery(() => hydrateAbilityContent(ability.content), [ability.id, ability.content]);
  const data: JsonType = hydratedContent === undefined ? null : parseJson(hydratedContent);
  const saveVisualError = async (exerciseIndex: number, field: 'p' | 'i', hasError: boolean, renderedValue: string): Promise<void> => {
    if (!data || !Array.isArray(data.q) || !data.q[exerciseIndex] || typeof data.q[exerciseIndex] !== 'object') {
      return;
    }

    const stored = parseJson(ability.content) as { q?: unknown[] } | null;
    const storedExercise = stored && Array.isArray(stored.q) ? stored.q[exerciseIndex] : undefined;
    const imageId = storedExercise && typeof storedExercise === 'object'
      ? (storedExercise as Record<string, unknown>)[field]
      : undefined;

    if (typeof imageId !== 'number' || !Number.isSafeInteger(imageId) || imageId <= 0) {
      return;
    }

    const image = await getImage(imageId);

    if (image) {
      const nextValid = nextStoredTikzValidity(image.data, image.valid, renderedValue, hasError);

      if (nextValid !== undefined) {
        await putImage({ ...image, valid: nextValid });
      }
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

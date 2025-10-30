// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Spinner, styled } from '@polkadot/react-components';
import React from 'react'
import { useTranslation } from '../translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { KatexSpan, parseJson } from '@slonigiraf/slonig-components';
import { ExerciseList } from '@slonigiraf/app-laws';
import { SkillTemplate } from 'db/src/db/SkillTemplate.js';

interface Props {
  className?: string;
  skillTemplate: SkillTemplate;
}

function SkillTemplateInfo({ className = '', skillTemplate }: Props): React.ReactElement<Props> {
  type JsonType = { [key: string]: any } | null;
  const { t } = useTranslation();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);

  const data: JsonType = parseJson(skillTemplate.content);

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
                  {data.q != null && <ExerciseList exercises={data.q} />}
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

export default React.memo(SkillTemplateInfo);
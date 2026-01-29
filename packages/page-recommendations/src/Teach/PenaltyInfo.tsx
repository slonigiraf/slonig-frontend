// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import { useTranslation } from '../translate.js';
import { Badge, getPseudonym, Insurance, LetterTemplate } from '@slonigiraf/db';
import { useToggle } from '@polkadot/react-hooks';
import { KatexSpan, getIPFSDataFromContentID, parseJson, useLog } from '@slonigiraf/slonig-components';
import { useIpfsContext } from '@slonigiraf/slonig-components';
import { ExerciseList } from '@slonigiraf/app-laws';

interface Props {
  className?: string;
  badge: LetterTemplate;
  student: string | undefined;
}

function PenaltyInfo({ className = '', badge, student }: Props): React.ReactElement<Props> {
  const { ipfs } = useIpfsContext();
  type JsonType = { [key: string]: any } | null;
  const [data, setData] = useState<JsonType>(null);
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);
  const [skillName, setSkillName] = useState(badge.cid);
  const [loaded, setLoaded] = useState(false);
  const [studentName, setStudentName] = useState<string | undefined>(undefined);



  useEffect(() => {
    const run = async () => {
      student && setStudentName(await getPseudonym(student));
    }
    run();
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && skillName === badge.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, badge.cid);
          const json = parseJson(content);
          setSkillName(json.h);
          setData(json);
          setLoaded(true);
        }
        catch (e) {
          setSkillName(badge.cid + " (" + t('loading') + "...)")
          console.log(e)
        }
      }
    }
    fetchData()
  }, [ipfs, badge])

  useEffect(() => {
    if (areDetailsOpen && skillName && badge) {
      logEvent('TUTORING', 'VIEW_PENALTY', skillName);
    }
  }, [areDetailsOpen, skillName, badge, logEvent]);

  const skillNameToShow = loaded ? <KatexSpan content={skillName} /> : <Spinner noLabel />;

  return (
    <StyledDiv>
      <RowDiv>
        <Button className='inList' icon='shield-halved' onClick={toggleDetailsOpen} />
        <SkillAndName>
          <b>{studentName}</b>
          {skillNameToShow}

        </SkillAndName>
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
                  {data.q != null && <ExerciseList exercises={data.q} location={'view_penalty'} />}
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

const SkillAndName = styled.div`
  display: flex;
  flex-direction: column;
  align-items: left;
  justify-content: flex-start;
  padding-left: 10px;
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

export default React.memo(PenaltyInfo);
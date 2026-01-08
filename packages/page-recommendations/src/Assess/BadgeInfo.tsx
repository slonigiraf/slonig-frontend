// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import UseInsurance from './UseInsurance.js'
import { useTranslation } from '../translate.js';
import { Badge, Insurance, isInsurance } from '@slonigiraf/db';
import { useToggle } from '@polkadot/react-hooks';
import { KatexSpan, getIPFSDataFromContentID, parseJson, useLog } from '@slonigiraf/slonig-components';
import { useIpfsContext } from '@slonigiraf/slonig-components';
import { ExerciseList } from '@slonigiraf/app-laws';

interface Props {
  className?: string;
  badge: Badge;
  isSelected: boolean;
  onToggleSelection: (badge: Badge) => void;
  isSelectionAllowed: boolean;
}

function BadgeInfo({ className = '', badge, isSelected, onToggleSelection, isSelectionAllowed }: Props): React.ReactElement<Props> {
  const { ipfs } = useIpfsContext();
  type JsonType = { [key: string]: any } | null;
  const [data, setData] = useState<JsonType>(null);
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);
  const [skillName, setSkillName] = useState(badge.cid);
  const [loaded, setLoaded] = useState(false);

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
    if(areDetailsOpen && skillName){
      logEvent('ASSESSMENT', 'VIEW_INSURANCE', skillName);
    }
  }, [areDetailsOpen, skillName, logEvent]);

  const skillNameToShow = loaded ? <KatexSpan content={skillName} /> : <Spinner noLabel />;

  return (
    <StyledDiv>
      <RowDiv>
        {isSelectionAllowed ? (
          <Button className='inList'
            icon={isSelected ? 'check' : 'square'}
            onClick={() => onToggleSelection(badge)}
          />
        )
          : <Button className='inList' icon='trophy' onClick={toggleDetailsOpen} />
        }
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
          {isInsurance(badge) &&
            <Modal.Actions>
              <UseInsurance insurance={badge as Insurance} />
            </Modal.Actions>
          }
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

export default React.memo(BadgeInfo);
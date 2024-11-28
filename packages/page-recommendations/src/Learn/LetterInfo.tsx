// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Modal, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import { KatexSpan, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components'
import { useTranslation } from '../translate.js';
import { Letter } from '@slonigiraf/db';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { useToggle } from '@polkadot/react-hooks';
import { ExerciseList } from '@slonigiraf/app-laws';

interface Props {
  letter: Letter;
  isSelected: boolean;
  isSelectionAllowed: boolean;
  onToggleSelection: (letter: Letter) => void;
}

function LetterInfo({ letter, isSelected, isSelectionAllowed, onToggleSelection }: Props): React.ReactElement<Props> {
  const { ipfs } = useIpfsContext();
  const { t } = useTranslation();
  type JsonType = { [key: string]: any } | null;
  const [data, setData] = useState<JsonType>(null);
  const [areDetailsOpen, toggleDetailsOpen] = useToggle();
  const [skillName, setSkillName] = useState(letter.cid);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && skillName === letter.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, letter.cid);
          const json = parseJson(content);
          setSkillName(json.h);
          setData(json);
          setLoaded(true);
        }
        catch (e) {
          setSkillName(letter.cid + " (" + t('loading') + "...)")
          console.log(e)
        }
      }
    }
    fetchData()
  }, [ipfs, letter])

  const skillNameToShow = loaded ? <KatexSpan content={skillName} /> : <Spinner noLabel />;

  return (
    <StyledDiv >
      {isSelectionAllowed && <Button
        icon={isSelected ? 'check' : 'square'}
        onClick={() => onToggleSelection(letter)}
      />}
      <Button
        icon="eye"
        label=""
        onClick={toggleDetailsOpen}
      />
      {loaded ? <KatexSpan content={skillName} /> : <Spinner noLabel />}
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
  );
}

const StyledDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: start;
  padding: 10px;
  padding-left: 6px;
  > span {
    margin-right: 10px;
    margin-left: 10px;
  }
  .ui--Spinner {
    width: 50px;
    margin-left: 25px;
    margin-right: 25px;
  }
`;

export default React.memo(LetterInfo);
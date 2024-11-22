// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Card, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import UseInsurance from './UseInsurance.js'
import { useTranslation } from '../translate.js';
import { deleteInsurance, Insurance } from '@slonigiraf/db';
import { useToggle } from '@polkadot/react-hooks';
import { Exercise, KatexSpan, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { ExerciseList } from '@slonigiraf/app-laws';
import { useInfo } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  insurance: Insurance;
  isSelected: boolean;
  onToggleSelection: (insurance: Insurance) => void;
  isSelectionAllowed: boolean;
}

function InsuranceInfo({ className = '', insurance, isSelected, onToggleSelection, isSelectionAllowed }: Props): React.ReactElement<Props> {
  const { ipfs } = useIpfsContext();
  type JsonType = { [key: string]: any } | null;
  const [data, setData] = useState<JsonType>(null);
  const { t } = useTranslation();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);
  const [skillName, setSkillName] = useState(insurance.cid);
  const [loaded, setLoaded] = useState(false);
  const [isDeleteConfirmOpen, toggleDeleteConfirm] = useToggle();
  const { showInfo } = useInfo();

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && skillName === insurance.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, insurance.cid);
          const json = parseJson(content);
          setSkillName(json.h);
          setData(json);
          setLoaded(true);
        }
        catch (e) {
          setSkillName(insurance.cid + " (" + t('loading') + "...)")
          console.log(e)
        }
      }
    }
    fetchData()
  }, [ipfs, insurance])

  const skillNameToShow = loaded ? <KatexSpan content={skillName} /> : <Spinner noLabel />;

  const deleteButton = <Button
    icon={'trash'}
    label={t('')}
    onClick={toggleDeleteConfirm}
  />;

  const deleteDiplomas = async () => {
    try {
      if (insurance && insurance.workerSign) {
        await deleteInsurance(insurance.workerSign);
        showInfo(t('Deleted'));
      }
    } catch (error) {
      // Handle any errors that occur during the deletion process
      console.error('Error', error);
      // Optionally, show an error message to the user
      showInfo(t('Deletion failed'));
    } finally {
      toggleDeleteConfirm();
    }
  };

  data && data.e && data.e.map((item: Exercise, index: number) => {
    console.log('item: ', JSON.stringify(item, null, 2))
  });

  return (
    <StyledDiv>
      <RowDiv>
        {isSelectionAllowed && (
          <Button
            icon={isSelected ? 'check' : 'square'}
            onClick={() => onToggleSelection(insurance)}
          />
        )}
        <Button icon='eye' onClick={toggleDetailsOpen} isDisabled={isSelectionAllowed} />
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
          <Modal.Actions>
            <UseInsurance insurance={insurance} />
          </Modal.Actions>
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
  padding: 10px;
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

export default React.memo(InsuranceInfo);
// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Modal, Button, Card, Spinner, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import UseInsurance from './UseInsurance.js'
import { useTranslation } from '../translate.js';
import { Insurance } from '../db/Insurance.js';
import { useToggle } from '@polkadot/react-hooks';
import { KatexSpan, getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { ItemLabel, ExerciseList } from '@slonigiraf/app-laws';
import { db } from "../db/index.js";
import { useInfo } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  insurance: Insurance;
}

function InsuranceInfo({ className = '', insurance }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
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
      if(insurance && insurance.id){
        await db.insurances.delete(insurance.id);
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

  return (
    <>
      {
        !areDetailsOpen ? <div className='ui--row' >
          <StyledDiv><Button
            icon='eye'
            onClick={toggleDetailsOpen}
          />
            {skillNameToShow}
          </StyledDiv>
        </div> :
          <>
            <StyledDiv><Button
              icon='chevron-up'
              onClick={toggleDetailsOpen}
            />{skillNameToShow}</StyledDiv>
            <DiplomaDiv >
              <Card>

                {
                  data === null ? "" :
                    <>
                      {
                        data.t !== null && data.t === 3 &&
                        <>
                          <h3>{t('Example exercises to train the skill')}</h3>
                        </>
                      }
                      {data.e != null && data.e.map((item, index) => (
                        <div className='ui--row' key={item}
                          style={{
                            alignItems: 'center'
                          }}
                        >
                          <ItemLabel id={item} />
                        </div>
                      ))}
                      {data.q != null && <ExerciseList exercises={data.q} />}
                    </>
                }
                <div className='ui--row' >
                  <UseInsurance
                    insurance={insurance}
                  />
                  {deleteButton}
                </div>
                
              </Card>
            </DiplomaDiv>
          </>
      }
      {isDeleteConfirmOpen && <>
          <StyledModal
            header={t('Are you sure you want to delete the selected diploma forever?')}
            onClose={toggleDeleteConfirm}
            size='small'
          >
            <Modal.Content>
            <StyledModalContent>
                <Button
                  icon={'check'}
                  label={t('Yes')}
                  onClick={deleteDiplomas}
                />
                <Button
                  icon={'close'}
                  label={t('No')}
                  onClick={toggleDeleteConfirm}
                />
            </StyledModalContent>
            </Modal.Content>
          </StyledModal>
        </>}
    </>
  )
}

const DiplomaDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  max-width: 300px;
  .qr--row {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  Card {
    width: 100%; // Adjust this as needed
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .table {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .row {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .cell {
    padding: 5px; // Add padding for spacing
    // Add any additional styling you need for cells
  }

  .row .cell:first-child {
    flex: 0 1 auto; // Allow shrinking but no growth, auto basis
    white-space: nowrap; // Prevents text from wrapping
    min-width: 30px;
  }

  .row .cell:nth-child(2) {
    flex: 1; // Take up the remaining space
  }
`;
const StyledDiv = styled.div`
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
const StyledModal = styled(Modal)`
button[data-testid="close-modal"] {
  opacity: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}

button[data-testid="close-modal"]:focus {
  outline: none;
}
`;
const StyledModalContent = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;
export default React.memo(InsuranceInfo);
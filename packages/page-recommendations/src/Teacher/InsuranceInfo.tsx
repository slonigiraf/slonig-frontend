// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Card, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import UseInsurance from './UseInsurance.js'
import { useTranslation } from '../translate.js';
import { Insurance } from '../db/Insurance.js';
import { useToggle } from '@polkadot/react-hooks';
import { getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { ItemLabel, ExerciseList } from '@slonigiraf/app-laws';

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

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && skillName === insurance.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, insurance.cid);
          const json = parseJson(content);
          setSkillName(json.h);
          setData(json);
        }
        catch (e) {
          setSkillName(insurance.cid + " (" + t('loading') + "...)")
          console.log(e)
        }
      }
    }
    fetchData()
  }, [ipfs, insurance])

  return (
    <>
      {
        !areDetailsOpen ? <div className='ui--row' >
          <StyledDiv><Button
            icon='eye'
            onClick={toggleDetailsOpen}
          /><span>{skillName}</span></StyledDiv>
        </div> :
          <>
            <StyledDiv><Button
              icon='chevron-up'
              onClick={toggleDetailsOpen}
            /><span>{skillName}</span></StyledDiv>
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
                        <div className='ui--row' key={index}
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
                </div>
              </Card>
            </DiplomaDiv>
          </>
      }
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
`;
export default React.memo(InsuranceInfo);
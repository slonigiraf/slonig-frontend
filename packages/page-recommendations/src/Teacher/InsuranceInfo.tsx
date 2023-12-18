// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Card, styled } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import UseInsurance from './UseInsurance.js'
import { getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components'
import { useTranslation } from '../translate.js';
import { IPFS } from 'ipfs-core';
import { Insurance } from '../db/Insurance.js';
import { useToggle } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  insurance: Insurance;
  ipfs: IPFS;
}

function InsuranceInfo({ className = '', insurance, ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [areDetailsOpen, toggleDetailsOpen] = useToggle(false);
  const [text, setText] = useState(insurance.cid);

  useEffect(() => {
    async function fetchData() {
      if (ipfs !== null && text === insurance.cid) {
        try {
          const content = await getIPFSDataFromContentID(ipfs, insurance.cid);
          const json = parseJson(content);
          setText(json.h);
        }
        catch (e) {
          setText(insurance.cid + " (" + t('loading') + "...)")
          console.log(e)
        }
      }
    }
    fetchData()
  }, [ipfs, insurance, text])

  return (
    <>
      {
        !areDetailsOpen ? <div className='ui--row' >
          <Button
            icon='eye'
            label={text}
            onClick={toggleDetailsOpen}
          />
        </div> :
          <>
            <DiplomaDiv >
              <Card>
                <div className='ui--row' >
                  <Button
                    icon='eye'
                    label={text}
                    onClick={toggleDetailsOpen}
                  />
                </div>
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

export default React.memo(InsuranceInfo);
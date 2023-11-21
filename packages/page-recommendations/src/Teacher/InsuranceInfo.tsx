// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { Button, Modal } from '@polkadot/react-components';
import React, { useState, useEffect } from 'react'
import UseInsurance from './UseInsurance.js'
import { getIPFSDataFromContentID, parseJson } from '@slonigiraf/app-slonig-components'
import { useTranslation } from '../translate.js';
import { IPFS } from 'ipfs-core';
import { Insurance } from '../db/Insurance.js';

interface Props {
  className?: string;
  insurance: Insurance;
  ipfs: IPFS;
}

function InsuranceInfo({ className = '', insurance, ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [modalIsOpen, setModalIsOpen] = useState(false)
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
    <div className='ui--row' >
      <Button
        icon='eye'
        label={text}
        onClick={() => setModalIsOpen(true)}
      />
      {modalIsOpen && <Modal
        header={t('Penalize referee')}
        size={"small"}
        onClose={() => setModalIsOpen(false)}
      >
        <Modal.Content>
          <UseInsurance
            text={text}
            insurance={insurance}
          />
        </Modal.Content>
      </Modal>
      }
    </div>
  )
}

export default React.memo(InsuranceInfo);
// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { IPFS } from 'ipfs-core';
import { Button, Modal } from '@polkadot/react-components';
import { useTranslation } from '../translate';
import "dexie-export-import";
import { QrScanner } from '@slonigiraf/app-slonig-components';
import { getIPFSDataFromContentID } from '@slonigiraf/helpers';
import { syncDB } from '../utils';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function DBImport({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [modalIsOpen, setModalIsOpen] = useState(false);

  const storeData = async (data: string) => {
    let dataArray = data.split(",")
    if (dataArray.length === 2) {
      setModalIsOpen(false);
      const content = await getIPFSDataFromContentID(ipfs, dataArray[0]);
      if(content === undefined){
        console.log("not yet got");
      }
      syncDB(content, dataArray[1]);
    }
  }

  const modal = <Modal
    header={t('Scan a QR code')}
    onClose={() => setModalIsOpen(false)}
    size='small'
  >
    <Modal.Content>
      <QrScanner
        onResult={(result, error) => {
          if (result != undefined) {
            storeData(result?.getText());
          }
          if (!error) {
            console.info(error);
          }
        }}
        constraints={{ facingMode: 'environment' }}
      />
    </Modal.Content>
  </Modal>;

  const button = <Button
    icon='qrcode'
    label={t('Sync DB')}
    onClick={() => setModalIsOpen(true)}
    isDisabled={ipfs === null}
  />;

  return (
    modalIsOpen ? modal : button
  )
}

export default React.memo(DBImport);
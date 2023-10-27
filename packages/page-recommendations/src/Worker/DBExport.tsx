// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import { Button, Modal } from '@polkadot/react-components';
import { useTranslation } from '../translate';
import { db } from "../db";
import "dexie-export-import";
import { ExportProgress } from 'dexie-export-import/dist/export';
import QRCode from 'qrcode.react';
import { qrCodeSize } from '../constants';

interface Props {
  className?: string;
}

function DBExport({ className = '' }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();
  const [text, setText] = useState<string>("");
  const [modalIsOpen, setModalIsOpen] = useState(false);

  const progressCallback = ({ totalRows, completedRows }: ExportProgress) => {
    console.log(`Progress: ${completedRows} of ${totalRows} rows completed`);
    return true;
  }

  const downloadDbJson = useCallback(
    async () => {
      try {
        const blob = await db.export({ prettyJson: true, progressCallback });
        const addingResult = await ipfs.add(blob);
        // create the result text
        let result = [];
        result.push(addingResult.cid);
        result.push("password");
        // show QR
        setText(result.join(","));
        setModalIsOpen(true);
      } catch (error) {
        console.log(error);
      }
    },
    [ipfs]
  );

  const modal = <Modal
    size={"small"}
    header={t('Scan this to import data')}
    onClose={() => setModalIsOpen(false)}
  >
    <Modal.Content>
      <QRCode value={text} size={qrCodeSize} />
    </Modal.Content>
  </Modal>;

  const button = <Button
    icon='cloud-download'
    label={t('Backup')}
    onClick={downloadDbJson}
    isDisabled={ipfs === null}
  />;

  return (
    modalIsOpen ? modal : button
  )
}

export default React.memo(DBExport);
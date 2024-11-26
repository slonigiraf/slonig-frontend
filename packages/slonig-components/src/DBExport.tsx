// SPDX-License-Identifier: Apache-2.0
import FileSaver from 'file-saver';
import React, { useCallback, useState } from 'react';
import { Button } from '@polkadot/react-components';
import { exportDB } from '@slonigiraf/db';
import { nextTick } from '@polkadot/util';
import { keyring } from '@polkadot/ui-keyring';
import { useLoginContext } from './LoginContext.js';

interface Props {
  className?: string;
}

function DBExport({ className = '' }: Props): React.ReactElement<Props> {
  const { currentPair } = useLoginContext();
  const [isBusy, setIsBusy] = useState(false);

  function progressCallback({ totalRows, completedRows }: any) {
    console.log(`Progress: ${completedRows} of ${totalRows} rows completed`);
    return true;
  }

  const backupData = useCallback(
    (): void => {
      setIsBusy(true);
      nextTick(async (): Promise<void> => {
        try {
          // Backup current key pair
          const password = ''; // Intentionally, users can't remember passwords.
          const addressKeyring = currentPair;
          const json = addressKeyring && keyring.backupAccount(addressKeyring, password);

          if (!json) {
            throw new Error('No key pair data available');
          }

          // Export database
          const dbBlob = await exportDB(progressCallback);

          if (!dbBlob) {
            throw new Error('No database data available to export');
          }

          // Combine key pair and database into a single JSON file
          const combinedData = {
            keys: [json],
            db: JSON.parse(await dbBlob.text())
          };

          const combinedBlob = new Blob([JSON.stringify(combinedData, null, 2)], {
            type: 'application/json; charset=utf-8',
          });

          FileSaver.saveAs(combinedBlob, `${currentPair?.address}_backup.json`);
        } catch (error) {
          console.error(error);
        } finally {
          setIsBusy(false);
        }
      });
    },
    [currentPair]
  );

  return (
    <Button
      className={className}
      icon="download"
      label=""
      onClick={backupData}
      isDisabled={isBusy}
    />
  );
}

export default React.memo(DBExport);
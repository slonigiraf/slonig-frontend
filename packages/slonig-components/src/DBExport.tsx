import pako from 'pako';
import FileSaver from 'file-saver';
import React, { useCallback, useState } from 'react';
import { Button } from '@polkadot/react-components';
import { exportDB } from '@slonigiraf/db';
import { nextTick } from '@polkadot/util';
import { keyring } from '@polkadot/ui-keyring';
import { useLoginContext } from './LoginContext.js';
import { getFormattedTimestamp } from '@slonigiraf/app-slonig-components';

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
          const keyPairJson = addressKeyring && keyring.backupAccount(addressKeyring, password);

          if (!keyPairJson) {
            throw new Error('No key pair data available');
          }

          // Export database
          const dbBlob = await exportDB(progressCallback);

          if (!dbBlob) {
            throw new Error('No database data available to export');
          }

          // Combine key pair and database into a single JSON file
          const combinedData = {
            keys: [keyPairJson],
            db: JSON.parse(await dbBlob.text()),
          };

          // Gzip the combined data
          const combinedJson = JSON.stringify(combinedData, null, 2);
          const gzipData = pako.gzip(combinedJson);

          // Create a blob from the Gzip data
          const gzipBlob = new Blob([gzipData], { type: 'application/gzip' });

          const timeStamp = getFormattedTimestamp(new Date());
          FileSaver.saveAs(
            gzipBlob,
            `${currentPair?.meta.name}_backup_${timeStamp}.json.gz`
          );
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
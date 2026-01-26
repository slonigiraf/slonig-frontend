import pako from 'pako';
import FileSaver from 'file-saver';
import React, { useCallback, useState } from 'react';
import { Progress, styled } from '@polkadot/react-components';
import { exportDB } from '@slonigiraf/db';
import { nextTick } from '@polkadot/util';
import { keyring } from '@polkadot/ui-keyring';
import { useLoginContext } from './LoginContext.js';
import { ButtonWithLabelBelow, getFormattedTimestamp, useLog } from '@slonigiraf/slonig-components';
import { useTranslation } from './translate.js';

interface Props {
  className?: string;
  caption?: string;
  onSuccess: () => void;
}

const compressionDeceleration = 0.8;
function DBExport({ className = '', caption, onSuccess }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { currentPair } = useLoginContext();
  const [isBusy, setIsBusy] = useState(false);
  const [progressValue, setProgressValue] = useState<number>(0);
  const [progressTotal, setProgressTotal] = useState<number>(100);
  const { logEvent } = useLog();

  function progressCallback({ totalRows, completedRows }: any) {
    if (totalRows > 0) {
      setProgressValue(compressionDeceleration * completedRows);
      setProgressTotal(totalRows);
    }
    return true;
  }

  const backupData = useCallback(
    (): void => {
      setIsBusy(true);
      nextTick(async (): Promise<void> => {
        try {
          // Backup all key pairs
          const password = 'password'; // Intentionally don't use passwords
          const allAccounts = keyring.getPairs();
          const allKeyPairsJson = allAccounts.map((account) =>
            keyring.backupAccount(account, password)
          );

          if (!allKeyPairsJson.length) {
            throw new Error('No key pairs data available');
          }

          // Ensure `currentPair` is first
          const currentIndex = allAccounts.findIndex(
            (account) => account.address === currentPair?.address
          );
          if (currentIndex > 0) {
            const [currentKeyPairJson] = allKeyPairsJson.splice(currentIndex, 1);
            allKeyPairsJson.unshift(currentKeyPairJson);
          }

          // Export database
          const dbBlob = await exportDB(progressCallback);

          if (!dbBlob) {
            throw new Error('No database data available to export');
          }

          // Combine key pairs and database into a single JSON file
          const combinedData = {
            keys: allKeyPairsJson,
            db: JSON.parse(await dbBlob.text()),
          };

          // Gzip the combined data
          const combinedJson = JSON.stringify(combinedData, null, 2);
          const gzipData = pako.gzip(combinedJson);

          // Create a blob from the Gzip data
          const gzipU8 = new Uint8Array(gzipData);
          const gzipBlob = new Blob([gzipU8], { type: 'application/gzip' });

          const timeStamp = getFormattedTimestamp(new Date());
          FileSaver.saveAs(
            gzipBlob,
            `${currentPair?.meta.name || 'backup'}_${timeStamp}.json.gz`
          );
          logEvent('AUTHENTICATION', 'BACKUP_SUCCESS', 'backup_file_kb', Math.round(gzipBlob.size / 1024));
          onSuccess();
        } catch (error) {
          console.error(error);
          logEvent('AUTHENTICATION', 'BACKUP_ERROR');
        } finally {
          setIsBusy(false);
        }
      });
    },
    [currentPair]
  );

  return (
    <StyledDiv>
      {!isBusy ?
        <ButtonWithLabelBelow
          className={className}
          icon="download"
          label={caption ?? t('Download')}
          onClick={backupData}
          isDisabled={!currentPair}
        />
        :
        <Progress
          value={progressValue}
          total={progressTotal}
        />}
    </StyledDiv>
  );
}
const StyledDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 75px;
  height: 75px;
  min-width: 75px;
  max-width: 75px;
  overflow: hidden;
`;
export default React.memo(DBExport);
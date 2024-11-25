// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import { Button } from '@polkadot/react-components';
import { exportDB } from '@slonigiraf/db';

interface Props {
  className?: string;
}

function DBExport({ className = '' }: Props): React.ReactElement<Props> {
  const [isProcessing, setIsProcessing] = useState(false);

  function progressCallback({ totalRows, completedRows }: any) {
    console.log(`Progress: ${completedRows} of ${totalRows} rows completed`);
    return true;
  }

  const downloadDbJson = useCallback(async () => {
    try {
      setIsProcessing(true);
      const blob = await exportDB(progressCallback);
      if (!blob) {
        throw new Error('No data available to export');
      }
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: 'database.json',
        types: [
          {
            description: 'JSON Files',
            accept: {
              'application/json': ['.json']
            }
          }
        ]
      });
      const writableStream = await fileHandle.createWritable();
      await writableStream.write(blob);
      await writableStream.close();
    } catch (error) {
      console.error('Error exporting database:', error);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <Button
      className={className}
      icon="download"
      label={''}
      onClick={downloadDbJson}
      isDisabled={isProcessing}
    />
  );
}

export default React.memo(DBExport);
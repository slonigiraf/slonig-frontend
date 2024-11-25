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
      if ('showSaveFilePicker' in window && typeof window.showSaveFilePicker === 'function') {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: 'database.json',
          types: [
            {
              description: 'JSON Files',
              accept: {
                'application/json': ['.json'],
              },
            },
          ],
        });
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(blob);
        await writableStream.close();
      } else {
        // Fallback for unsupported browsers
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'database.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
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
import React, { useCallback } from 'react';
import { InputFile } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { replaceDB } from '@slonigiraf/db';
import { keyring } from '@polkadot/ui-keyring';
import pako from 'pako';
import { useInfo } from './InfoProvider.js';
import { useLoginContext, useLog } from '@slonigiraf/slonig-components';

interface Props {
  className?: string;
}

const acceptedFormats = ['.gz', 'application/gzip', 'application/x-gzip', 'application/octet-stream'];

function DBImport({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const { setDefaultAccount } = useLoginContext();
  const { logEvent } = useLog();
  const _onChangeFile = useCallback(
    async (file: Uint8Array) => {
      const backupFileSizeKb = Math.round(file.byteLength / 1024);
      try {
        const decompressedData = new TextDecoder().decode(pako.ungzip(file));
        const { keys, db } = JSON.parse(decompressedData);
        if (keys && Array.isArray(keys)) {
          keys.forEach((keyJson: any) => {
            keyring.restoreAccount(keyJson, 'password');
          });
          setDefaultAccount(keys[0].address);
        } else {
          throw new Error('No valid key pairs found in the file.');
        }
        if (db) {
          await replaceDB(db);
        } else {
          throw new Error('No valid database content found in the file.');
        }
        logEvent('AUTHENTICATION', 'RESTORE_SUCCESS', 'restore_success_kb', backupFileSizeKb);
        showInfo(t('Restored'));
      } catch (error) {
        logEvent('AUTHENTICATION', 'RESTORE_ERROR', 'restore_error_kb', backupFileSizeKb);
        showInfo((error as Error).message, 'error');
      }
    },
    [t]
  );

  return (
    <InputFile
      accept={acceptedFormats}
      className={`${className} full`}
      label={t('Upload your backup file')}
      onChange={_onChangeFile}
      withLabel
    />
  );
}

export default React.memo(DBImport);
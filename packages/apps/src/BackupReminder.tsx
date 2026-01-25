// Copyright 2021-2022 @slonigiraf/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback } from 'react';
import { styled } from '@polkadot/react-components';
import { DBExport, FullscreenActivity, useLog } from '@slonigiraf/slonig-components';
import { useTranslation } from './translate.js';

interface Props {
  className?: string;
  onResult: () => void;
}

function BackupReminder({ className = '', onResult }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { logEvent } = useLog();

  const onBackup = useCallback(async () => {
    onResult();
  }, [logEvent, onResult]);

  return (
    <FullscreenActivity caption={''} backgroundColor={'var(--bg-page)'}>
      <StyledDiv>
        <h1 className='prompt' style={{ width: '70%', maxWidth: 430, textAlign: 'center' }}>{t('Download your backup in case you erase your browser history')}</h1>
        <DBExport onSuccess={() => onBackup()} />
      </StyledDiv>
    </FullscreenActivity>
  );
}


const StyledDiv = styled.div`
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  h1 {
    margin-top: 0px;
    margin-bottom: 0px;
  }
`;

export default React.memo(BackupReminder);
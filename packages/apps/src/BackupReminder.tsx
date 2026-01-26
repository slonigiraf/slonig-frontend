// Copyright 2021-2022 @slonigiraf/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { Spinner, styled } from '@polkadot/react-components';
import { DBExport, FullscreenActivity, useLog } from '@slonigiraf/slonig-components';
import { useTranslation } from './translate.js';

interface Props {
  className?: string;
  onResult: () => void;
}

function BackupReminder({ className = '', onResult }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const [isLoading, setIsLoading] = useState(true);

  const onBackup = useCallback(async () => {
    onResult();
  }, [logEvent, onResult]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <TopLayer>
      <FullscreenActivity caption={''} backgroundColor={'var(--bg-page)'}>
        <StyledDiv>
          {isLoading ? <Spinner label={t('Loading')} /> : <>
            <h1 className='prompt' style={{ width: '70%', maxWidth: 430, textAlign: 'center' }}>{t('Download your backup in case you erase your browser history')}</h1>
            <DBExport onSuccess={() => onBackup()} />
          </>
          }
        </StyledDiv>
      </FullscreenActivity>
    </TopLayer>
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

const TopLayer = styled.div`
  z-index: 1000;
`;

export default React.memo(BackupReminder);
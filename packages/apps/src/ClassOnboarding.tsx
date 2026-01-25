// Copyright 2021-2022 @slonigiraf/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useState } from 'react';
import { Button, styled } from '@polkadot/react-components';
import { Confirmation, FullFindow, FullscreenActivity, useLog } from '@slonigiraf/slonig-components';
import { SettingKey, deleteSetting } from '@slonigiraf/db';
import { useTranslation } from './translate.js';
import { useNavigate } from 'react-router-dom';
import { EXAMPLE_MODULE_KNOWLEDGE_ID } from '@slonigiraf/utils';

interface Props {
  className?: string;
}

function ClassOnboarding({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const { logEvent } = useLog();

  const exitOnboarding = useCallback(async () => {
    logEvent('SETTINGS', 'CLASS_ONBOARDING_OFF');
    await deleteSetting(SettingKey.NOW_IS_CLASS_ONBOARDING);
  }, [deleteSetting]);

  const tryToClose = useCallback((): void => {
    setIsExitConfirmOpen(true);
  }, [setIsExitConfirmOpen]);

  const helpOthers = useCallback(async (): Promise<void> => {
    logEvent('ONBOARDING', 'CLICK_FOUND_NEW_PARTNER');
    navigate(`/knowledge?id=${EXAMPLE_MODULE_KNOWLEDGE_ID}&showSkillQr`, { replace: true });
    await deleteSetting(SettingKey.NOW_IS_CLASS_ONBOARDING);
  }, [setIsExitConfirmOpen]);

  return (
    <FullFindow>
      <FullscreenActivity caption={''} onClose={tryToClose}>

        <StyledDiv>
          <img
            src="./split_pair.png"
            alt="Signup"
            style={{ width: '80%', maxWidth: 430 }}
          />
          <h1 className='prompt' style={{ width: '70%', maxWidth: 430, textAlign: 'center' }}>{t('Split and find a partner that never used Slonig')}</h1>
          
          <Button
            className='highlighted--button'
            activeOnEnter
            label={t('I’ve found a new partner')}
            onClick={helpOthers}
          />
        </StyledDiv>

      </FullscreenActivity>
      {isExitConfirmOpen && (
        <Confirmation question={t('Are you sure everyone around you has tried using Slonig?')}
          onClose={() => setIsExitConfirmOpen(false)}
          onConfirm={exitOnboarding} />
      )}
    </FullFindow>
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
  h2 {
    margin-top: 0px;
    margin-bottom: 0px;
  }
`;

export const CloseButton = styled(Button)`
  position: relative;
  right: 0px;
  margin-left: 10px;
`;

export default React.memo(ClassOnboarding);
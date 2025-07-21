// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback } from 'react';

import { Input, Modal } from '@polkadot/react-components';

import { useTranslation } from '../translate.js';
import PasswordInput from './PasswordInput.js';

interface AccountName {
  name: string;
  isNameValid: boolean;
}

interface AccountPassword {
  password: string;
  isPasswordValid: boolean;
}

interface Props {
  name: AccountName;
  onCommit: () => void;
  setName: (value: AccountName) => void;
  setPassword: (value: AccountPassword) => void;
  isFirstScreen: boolean;
}

const CreateAccountInputs = ({ name: { name }, onCommit, setName, isFirstScreen }: Props) => {
  const { t } = useTranslation();

  const _onChangeName = useCallback(
    (name: string) => setName({ isNameValid: !!name.trim(), name }),
    [setName]
  );

  return (
    <>
        <Input
          className='full'
          label={isFirstScreen? t('Enter your full name') : t('Enter the account name')}
          onChange={_onChangeName}
          onEnter={onCommit}
          placeholder={isFirstScreen? t('Name Surname') : t('account name')}
          value={name}
        />
    </>
  );
};

export default React.memo(CreateAccountInputs);

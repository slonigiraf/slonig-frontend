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
}

const CreateAccountInputs = ({ name: { isNameValid, name }, onCommit, setName }: Props) => {
  const { t } = useTranslation();

  const _onChangeName = useCallback(
    (name: string) => setName({ isNameValid: !!name.trim(), name }),
    [setName]
  );

  return (
    <>
        <Input
          className='full'
          isError={!isNameValid}
          label={t('Enter your full name')}
          onChange={_onChangeName}
          onEnter={onCommit}
          placeholder={t('Name Surname')}
          value={name}
        />
    </>
  );
};

export default React.memo(CreateAccountInputs);

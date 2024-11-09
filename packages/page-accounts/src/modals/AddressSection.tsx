// Copyright 2017-2023 @polkadot/page-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AddressFlags } from '@polkadot/react-hooks/types';

import React from 'react';

import { useToggle } from '@polkadot/react-hooks';
import { styled, AccountName, IdentityIcon, Input } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';

interface Props {
  value: string,
  editingName: boolean,
  defaultValue: string,
  onChange: (value: string) => void,
  flags: AddressFlags,
  accountIndex: string | undefined,
}

function AddressSection({ accountIndex, defaultValue, editingName, flags, onChange, value }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  return (
    <StyledDiv>
      <AccountName
        override={
          editingName
            ? (
              <Input
                className='name--input'
                defaultValue={defaultValue}
                label='name-input'
                onChange={onChange}
                withLabel={false}
              />
            )
            : flags.isEditable
              ? (defaultValue.toUpperCase() || t('<unknown>'))
              : undefined
        }
        value={value}
        withSidebar={false}
      />
    </StyledDiv>
  );
}
const StyledDiv = styled.div`
  display: flex;
  flex-direction: row;
  align-items: left;
  .ui--AccountName {
    width: 100%;
  }
`;
export default React.memo(AddressSection);

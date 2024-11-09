// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';

import { AccountName, Input, Modal, styled } from '@polkadot/react-components';

import { useTranslation } from '../translate.js';
import { useAccountInfo } from '@polkadot/react-hooks';
import AccountMenuButtons from './AccountMenuButtons.js';
import { keyring } from '@polkadot/ui-keyring';

interface Props {
  onClose: () => void;
  address: string;
}

function Backup({ address, onClose }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { flags, isEditing, isEditingName, isEditingTags, name, onForgetAddress, onSaveName, onSaveTags, setIsEditingName, setIsEditingTags, setName, setTags, tags, toggleIsEditingName, toggleIsEditingTags } = useAccountInfo(address);

  useEffect(() => {
    toggleIsEditingName();
  }, []);

  const onCancel = useCallback(
    (): void => {
      if (isEditing()) {
        try {
          const accountOrAddress = keyring.getAccount(address) || keyring.getAddress(address);

          setName(accountOrAddress?.meta.name || '');
          setTags(accountOrAddress?.meta.tags ? (accountOrAddress.meta.tags).sort() : []);
          setIsEditingName(false);
          setIsEditingTags(false);
        } catch {
          // ignore
        }
      }
    }, [isEditing, setName, setTags, setIsEditingName, setIsEditingTags, address]);

  const onSave = useCallback(() => {
    onSaveName();
    onClose();
  }, [onSaveName, onClose]);

  return (
    <StyledModal
      className='app--accounts-Modal'
      header={t('Edit account')}
      onClose={onClose}
    >
      <Modal.Content>
        <StyledDiv>
          <AccountName
            override={
              isEditingName
                ? (
                  <Input
                    className='name--input'
                    defaultValue={name}
                    label='name-input'
                    onChange={setName}
                    withLabel={false}
                  />
                )
                : flags.isEditable
                  ? (name.toUpperCase() || t('<unknown>'))
                  : undefined
            }
            value={address}
            withSidebar={false}
          />
        </StyledDiv>
        <AccountMenuButtons
          flags={flags}
          isEditing={isEditing()}
          isEditingName={isEditingName}
          onCancel={onClose}
          onForgetAddress={onForgetAddress}
          onSaveName={onSave}
          onSaveTags={onSaveTags}
          onUpdateName={() => { }}
          recipientId={address}
          toggleIsEditingName={toggleIsEditingName}
          toggleIsEditingTags={toggleIsEditingTags}
        />
      </Modal.Content>

    </StyledModal>
  );
}
const StyledModal = styled(Modal)`
 
`;
const StyledDiv = styled.div`
  display: flex;
  flex-direction: row;
  align-items: left;
  .ui--AccountName {
    width: 100%;
  }
`;
export default React.memo(Backup);

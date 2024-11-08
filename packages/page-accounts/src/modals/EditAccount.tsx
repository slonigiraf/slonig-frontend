// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';

import { Modal, styled } from '@polkadot/react-components';

import { useTranslation } from '../translate.js';
import AddressSection from '@polkadot/react-components/AccountSidebar/AddressSection';
import { useAccountInfo } from '@polkadot/react-hooks';
import AccountMenuButtons from '@polkadot/react-components/AccountSidebar/AccountMenuButtons';
import { keyring } from '@polkadot/ui-keyring';

interface Props {
  onClose: () => void;
  address: string;
}

function Backup({ address, onClose }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { flags, isEditing, isEditingName, isEditingTags, name, onForgetAddress, onSaveName, onSaveTags, setIsEditingName, setIsEditingTags, setName, setTags, tags, toggleIsEditingName, toggleIsEditingTags } = useAccountInfo(address);

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

  return (
    <StyledModal
      className='app--accounts-Modal'
      header={t('Edit account')}
      onClose={onClose}
    >
      <Modal.Content>
        <AddressSection
          accountIndex={address}
          defaultValue={name}
          editingName={isEditingName}
          flags={flags}
          onChange={setName}
          value={address}
        />
        <AccountMenuButtons
          flags={flags}
          isEditing={isEditing()}
          isEditingName={isEditingName}
          onCancel={onCancel}
          onForgetAddress={onForgetAddress}
          onSaveName={onSaveName}
          onSaveTags={onSaveTags}
          onUpdateName={() => {}}
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
export default React.memo(Backup);

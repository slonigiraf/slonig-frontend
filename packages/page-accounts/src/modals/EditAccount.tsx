// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect } from 'react';
import { AccountName, Button, Input, Modal, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { useAccountInfo } from '@polkadot/react-hooks';

interface Props {
  onClose: () => void;
  onUpdate: () => void;
  address: string;
}

function EditAccount({ address, onUpdate, onClose }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { isEditingName, name, onSaveName, setName, toggleIsEditingName } = useAccountInfo(address);

  useEffect(() => {
    toggleIsEditingName();
  }, []);

  const onSave = useCallback(() => {
    onSaveName();
    onUpdate();
    onClose();
  }, [onSaveName, onClose]);

  return (
    <StyledModal
      header={t('Edit account')}
      onClose={onClose}
    >
      <Modal.Content>
        <StyledDiv>
          <AccountName
            override={
              isEditingName
              && (
                <Input
                  className='name--input'
                  defaultValue={name}
                  label='name-input'
                  onChange={setName}
                  withLabel={false}
                />
              )
            }
            value={address}
            withSidebar={false}
          />
        </StyledDiv>
      </Modal.Content>
      <Modal.Actions>
        <Button
          icon='save'
          label={t('Save')}
          onClick={onSave}
        />
      </Modal.Actions>
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
export default React.memo(EditAccount);

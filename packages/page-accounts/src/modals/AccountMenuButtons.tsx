// Copyright 2017-2023 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AddressFlags } from '@polkadot/react-hooks/types';
import React, { useCallback, useEffect } from 'react';
import { useApi, useToggle } from '@polkadot/react-hooks';
import { isFunction } from '@polkadot/util';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';

interface Props {
  className?: string;
  flags: AddressFlags;
  isEditingName: boolean;
  isEditing: boolean;
  toggleIsEditingName: () => void;
  toggleIsEditingTags: () => void;
  onCancel: () => void;
  onSaveName: () => void;
  onSaveTags: () => void;
  onForgetAddress: () => void;
  onUpdateName?: (() => void) | null;
  recipientId: string;
}

function AccountMenuButtons ({ className = '', flags, isEditing, isEditingName, onCancel, onForgetAddress, onSaveName, onSaveTags, onUpdateName, recipientId, toggleIsEditingName, toggleIsEditingTags }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  const toggleIsEditing = useCallback(() => {
    flags.isEditable && toggleIsEditingName();
    toggleIsEditingTags();
  }, [flags.isEditable, toggleIsEditingName, toggleIsEditingTags]);

  const _onUpdateName = useCallback(
    (): void => {
      onSaveName();
      onUpdateName && onUpdateName();
    },
    [onSaveName, onUpdateName]
  );

  const updateName = useCallback(() => {
    if (isEditingName && (flags.isInContacts || flags.isOwned)) {
      _onUpdateName();
      toggleIsEditingName();
    }
  }, [isEditingName, flags.isInContacts, flags.isOwned, _onUpdateName, toggleIsEditingName]);

  const onEdit = useCallback(() => {
    if (isEditing) {
      updateName();
      onSaveTags();
    }

    toggleIsEditing();
  }, [isEditing, toggleIsEditing, updateName, onSaveTags]);

  return (
    <StyledDiv className={`${className} ui--AddressMenu-buttons`}>
      {isEditing
        ? (
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={onCancel}
            />
            <Button
              icon='save'
              label={t('Save')}
              onClick={onEdit}
            />
          </Button.Group>
        )
        : (
          <Button.Group>
            {!flags.isOwned && !flags.isInContacts && (
              <Button
                icon='plus'
                isDisabled={isEditing}
                label={t('Save')}
                onClick={_onUpdateName}
              />
            )}
            <Button
              icon='edit'
              isDisabled={!flags.isEditable}
              label={t('Edit')}
              onClick={onEdit}
            />
          </Button.Group>
        )
      }
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  width: 100%;

  .ui--Button-Group {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    margin-bottom: 0;
  }
`;

export default React.memo(AccountMenuButtons);

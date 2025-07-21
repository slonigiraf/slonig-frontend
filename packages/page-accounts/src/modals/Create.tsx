// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Modal, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import CreateAccount from './CreateAccount.js';
import { useLoginContext } from '@slonigiraf/app-slonig-components';
import { ModalProps } from '../types.js';


function Create({ className = '', onClose }: ModalProps): React.ReactElement<ModalProps> {
  const { t } = useTranslation();
  const { onCreateAccount, setIsAddingAccount } = useLoginContext();


  return (
    <StyledModal
      header={t('Add account')}
      size='small'
      onClose={onClose}
    >
      <Modal.Content>
        <CreateAccount
          isFirstScreen={false}
          onClose={onClose}
          onStatusChange={onCreateAccount}
        />
      </Modal.Content>
    </StyledModal>
  );
}
const StyledModal = styled(Modal)`
  .ui--Modal-content {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column; /* Optional: to stack children vertically */
    text-align: center;
  }
`;
export default React.memo(Create);

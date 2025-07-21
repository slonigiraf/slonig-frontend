// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { Modal, styled } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import CreateAccount from './CreateAccount.js';
import { useLoginContext } from '@slonigiraf/app-slonig-components';
import { ModalProps } from '../types.js';


function CreateAccountModal({ className = '', onClose }: ModalProps): React.ReactElement<ModalProps> {
  const { t } = useTranslation();
  const { onCreateAccount } = useLoginContext();


  return (
    <StyledModal
      header={t('Add account')}
      size='small'
      onClose={onClose}
    >
      <Modal.Content>
        <CenteredWrapper>
          <CreateAccount
            isFirstScreen={false}
            onClose={onClose}
            onStatusChange={onCreateAccount}
          />
        </CenteredWrapper>
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
const CenteredWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column; /* optional, depending on child layout */
  width: 100%;
  height: 100%;
  text-align: center;
`;

export default React.memo(CreateAccountModal);

// Copyright 2017-2023 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import { Button, styled } from '@polkadot/react-components';

interface Props {}

const Wrapper = styled.div`
  position: fixed;
  bottom: 80px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const ChatOptions = styled.div`
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ChatButtonWrapper = styled.div<{ bg: string }>`
  background-color: ${({ bg }) => bg};
  border-radius: 4px;

  .ui--Button {
    color: white !important;
  }
`;

const ToggleWrapper = styled.div<{ isOpen: boolean }>`
  background-color: #6200ee;
  border-radius: 50%;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  padding: ${({ isOpen }) => (isOpen ? '10px 14px' : '14px')};
  transition: all 0.3s ease-in-out;
`;

function HelpChatWidget({}: Props): React.ReactElement<Props> {
  const [isOpen, setIsOpen] = useState(false);

  const toggleChat = (): void => setIsOpen(!isOpen);

  const openLink = (url: string) => (): void => {
    void window.open(url, '_blank');
  };

  return (
    <Wrapper>
      {isOpen && (
        <ChatOptions>
          <ChatButtonWrapper bg="#0078ff">
            <Button onClick={openLink('https://m.me/reshetovdenis1')}>
              Chat on Messenger
            </Button>
          </ChatButtonWrapper>
          <ChatButtonWrapper bg="#25D366">
            <Button onClick={openLink('https://wa.me/38267887600')}>
              Chat on WhatsApp
            </Button>
          </ChatButtonWrapper>
          <ChatButtonWrapper bg="#0088cc">
            <Button onClick={openLink('https://t.me/denisreshetov')}>
              Chat on Telegram
            </Button>
          </ChatButtonWrapper>
        </ChatOptions>
      )}
      <ToggleWrapper isOpen={isOpen}>
        <Button
          icon={isOpen ? 'times' : 'comment'}
          onClick={toggleChat}
          label={isOpen ? '' : undefined}
        />
      </ToggleWrapper>
    </Wrapper>
  );
}

export default React.memo(HelpChatWidget);
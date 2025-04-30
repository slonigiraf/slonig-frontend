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
  align-items: center;
`;

const ChatHeaderWrapper = styled.div`
  display: flex;
  justify-content: center;
  width: 100%;
`;

const ChatHeader = styled.div`
  font-weight: bold;
  color: #333;
  background-color: white;
  padding: 4px 8px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const ChatButtonWrapper = styled.div<{ bg: string }>`
  background-color: ${({ bg }) => bg};
  border-radius: 4px;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;

  .ui--Button {
    width: 100%;
    height: 100%;
    color: white !important;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  svg {
    width: 24px;
    height: 24px;
    fill: white;
  }

  &:hover {
    opacity: 0.9;
  }

  text-decoration: none;
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

  const MessengerIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <path d="M256.6 8C116.5 8 8 110.3 8 248.6c0 72.3 29.7 134.8 78.1 177.9 8.4 7.5 6.6 11.9 8.1 58.2A19.9 19.9 0 0 0 122 502.3c52.9-23.3 53.6-25.1 62.6-22.7C337.9 521.8 504 423.7 504 248.6 504 110.3 396.6 8 256.6 8zm149.2 185.1l-73 115.6a37.4 37.4 0 0 1 -53.9 9.9l-58.1-43.5a15 15 0 0 0 -18 0l-78.4 59.4c-10.5 7.9-24.2-4.6-17.1-15.7l73-115.6a37.4 37.4 0 0 1 53.9-9.9l58.1 43.5a15 15 0 0 0 18 0l78.4-59.4c10.4-8 24.1 4.5 17.1 15.6z" />
    </svg>
  );

  const WhatsAppIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
      <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
    </svg>
  );

  const TelegramIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512">
      <path d="M248 8C111 8 0 119 0 256S111 504 248 504 496 393 496 256 385 8 248 8zM363 176.7c-3.7 39.2-19.9 134.4-28.1 178.3-3.5 18.6-10.3 24.8-16.9 25.4-14.4 1.3-25.3-9.5-39.3-18.7-21.8-14.3-34.2-23.2-55.3-37.2-24.5-16.1-8.6-25 5.3-39.5 3.7-3.8 67.1-61.5 68.3-66.7 .2-.7 .3-3.1-1.2-4.4s-3.6-.8-5.1-.5q-3.3 .7-104.6 69.1-14.8 10.2-26.9 9.9c-8.9-.2-25.9-5-38.6-9.1-15.5-5-27.9-7.7-26.8-16.3q.8-6.7 18.5-13.7 108.4-47.2 144.6-62.3c68.9-28.6 83.2-33.6 92.5-33.8 2.1 0 6.6 .5 9.6 2.9a10.5 10.5 0 0 1 3.5 6.7A43.8 43.8 0 0 1 363 176.7z"/>
    </svg>
  );

  return (
    <Wrapper>
      {isOpen && (
        <ChatOptions>
          <ChatHeaderWrapper>
            <ChatHeader>Get help</ChatHeader>
          </ChatHeaderWrapper>

          <ChatButtonWrapper
            as="a"
            href="https://m.me/yourpage"
            target="_blank"
            rel="noopener noreferrer"
            bg="#0078ff"
          >
            {MessengerIcon}
          </ChatButtonWrapper>

          <ChatButtonWrapper bg="#25D366">
            <Button onClick={openLink('https://wa.me/1234567890')}>
              {WhatsAppIcon}
            </Button>
          </ChatButtonWrapper>

          <ChatButtonWrapper bg="#0088cc">
            <Button onClick={openLink('https://t.me/yourusername')}>
              {TelegramIcon}
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
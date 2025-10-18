import React, { useState, useEffect } from 'react';
import { styled, Button } from '@polkadot/react-components';
import {
  Bubble,
  ChatContainer,
  IMessage,
  KatexSpan,
  ResizableImage
} from '@slonigiraf/app-slonig-components';
import { useTranslation } from '../translate.js';

interface ChatSimulationProps {
  messages: IMessage[];
  onAllMessagesRevealed?: () => void; // 👈 NEW PROP
}

const ChatSimulation: React.FC<ChatSimulationProps> = ({ messages, onAllMessagesRevealed }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { t } = useTranslation();

  const handleNext = () => {
    if (currentIndex < messages.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else if (currentIndex === messages.length - 1 && onAllMessagesRevealed) {
      // Trigger parent callback only after pressing Next on the final bubble
      onAllMessagesRevealed();
    }
  };

  return (
    <ChatContainer>
      {messages.map((message, index) => {
        const isVisible = index <= currentIndex;
        const isNext = index === currentIndex + 1;

        return (
          <MessageWrapper key={index + message.text + (message.image || '')}>
            <MessageContainer $blur={!isVisible}>
              <Bubble>
                <h2>{message.title}</h2>
                <KatexSpan content={message.text} />
                {message.image && (
                  <>
                    <br />
                    <ResizableImage cid={message.image} />
                  </>
                )}
              </Bubble>
            </MessageContainer>

            {/* Show button also for the last bubble */}
            {isNext && (
              <NextOverlay>
                <Button
                  className='highlighted--button'
                  icon="eye"
                  label={t('Next')}
                  onClick={handleNext}
                />
              </NextOverlay>
            )}

            <Arrow>
              <h2><b>↓</b></h2>
            </Arrow>
          </MessageWrapper>
        );
      })}
    </ChatContainer>
  );
};

// --- Styled components ---
const MessageWrapper = styled.div`
  position: relative;
  width: 100%;
`;

const MessageContainer = styled.div<{ $blur: boolean }>`
  display: flex;
  flex-direction: column;
  padding: 0px 10px;
  width: 100%;
  margin: 0 auto;
  transition: filter 0.3s ease, opacity 0.3s ease;
  filter: ${({ $blur }) => ($blur ? 'blur(3px) brightness(0.7)' : 'none')};
  opacity: ${({ $blur }) => ($blur ? 0.5 : 1)};
  pointer-events: ${({ $blur }) => ($blur ? 'none' : 'auto')};
`;

const Arrow = styled.div`
  width: 100%;
  text-align: center;
  h2 {
    margin: 0;
  }
`;

const NextOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  button {
    pointer-events: all;
  }
`;


export default React.memo(ChatSimulation);
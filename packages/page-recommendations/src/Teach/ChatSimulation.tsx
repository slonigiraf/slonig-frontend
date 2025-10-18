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
  onAllMessagesRevealed: () => void;
}

const ChatSimulation: React.FC<ChatSimulationProps> = ({ messages, onAllMessagesRevealed }) => {
  const [revealedCount, setRevealedCount] = useState(1);
  console.log("revealedCount: ", revealedCount)
  const { t } = useTranslation();

  const handleNext = () => {
    if (revealedCount + 1 === messages.length) {
      onAllMessagesRevealed();
    }
    if (revealedCount < messages.length) {
      setRevealedCount(revealedCount + 1);
    }
  };

  return (
    <ChatContainer>
      {messages.map((message, index) => {
        const isVisible = index < revealedCount;
        const isNext = index === revealedCount;

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
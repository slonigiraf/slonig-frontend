import React, { useState, useEffect } from 'react';
import { styled, Button } from '@polkadot/react-components';
import {
  Bubble,
  ChatContainer,
  IMessage,
  KatexSpan,
  ResizableImage
} from '@slonigiraf/slonig-components';
import { useTranslation } from '../translate.js';

interface ChatSimulationProps {
  messages: IMessage[];
  hasTutorCompletedTutorial: boolean | null | undefined;
  isSendingResultsEnabled: boolean | null | undefined;
  onAllMessagesRevealed: () => void;
  isTutorial: boolean;
}

const ChatSimulation: React.FC<ChatSimulationProps> = ({ messages, hasTutorCompletedTutorial, isSendingResultsEnabled, onAllMessagesRevealed, isTutorial }) => {
  const [revealedCount, setRevealedCount] = useState(1);
  const { t } = useTranslation();

  const handleNext = () => {
    if (revealedCount + 1 === messages.length) {
      onAllMessagesRevealed();
    }
    if (revealedCount < messages.length) {
      setRevealedCount(revealedCount + 1);
    }
  };

  useEffect(() => {
    if (messages && messages.length == 1) {
      onAllMessagesRevealed();
    }
  }, [messages]);

  return (
    <ChatContainer>
      {messages.map((message, index) => {
        const isVisible = !(isTutorial && hasTutorCompletedTutorial) && (hasTutorCompletedTutorial || (isSendingResultsEnabled === false && (index < revealedCount)));
        const isNext = isSendingResultsEnabled === false && (hasTutorCompletedTutorial === false) && (index === revealedCount);

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
              <Arrow>
                <h2><b>↓</b></h2>
              </Arrow>
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


          </MessageWrapper>
        );
      })}
    </ChatContainer>
  );
};

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
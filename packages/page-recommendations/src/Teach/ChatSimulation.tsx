import React, { useState } from 'react';
import { styled } from '@polkadot/react-components';
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
}

const ChatSimulation: React.FC<ChatSimulationProps> = ({ messages }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const { t } = useTranslation();

  const handleNext = () => {
    if (currentIndex < messages.length - 1) {
      setCurrentIndex(currentIndex + 1);
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

            {/* Overlay the NEXT button on top of the next blurred bubble */}
            {isNext && (
              <NextOverlay>
                <NextButton onClick={handleNext}>{t('Next')}</NextButton>
              </NextOverlay>
            )}
            <Arrow><h2><b>↓</b></h2></Arrow>
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
  padding: 0px 10px 0px 10px;
  width: 100%;
  margin: 0 auto;
  transition: filter 0.3s ease, opacity 0.3s ease;
  filter: ${({ $blur }) => ($blur ? 'blur(3px) brightness(0.7)' : 'none')};
  opacity: ${({ $blur }) => ($blur ? 0.5 : 1)};
  pointer-events: ${({ $blur }) => ($blur ? 'none' : 'auto')};
`;

const Arrow = styled.div`
  width: 100%;
  padding: 0;
  margin: 0;
  text-align: center;
  h2 {
    margin: 0;
  }
`;

// Overlay positioned above blurred bubble
const NextOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none; /* ensure button only clickable itself */
`;

const NextButton = styled.button`
  pointer-events: auto;
  background-color: #F39200;
  color: white;
  font-size: 1.3rem;
  border: none;
  border-radius: 4px;
  padding: 5px 15px;
  cursor: pointer;
`;

export default React.memo(ChatSimulation);
import React from 'react';
import { styled } from '@polkadot/react-components';
import { IMessage, KatexSpan, ResizableImage } from '@slonigiraf/app-slonig-components';

interface ChatSimulationProps {
    messages: IMessage[];
}

const ChatSimulation: React.FC<ChatSimulationProps> = ({ messages }) => {
    return (
      <ChatContainer>
        {messages.map((message, index) => (
          <MessageContainer key={index+message.text+message.image} sender={message.sender}>
            <Bubble sender={message.sender}>
              {message.sender !== 'you' && <SenderName>{message.senderName}</SenderName>}
              <KatexSpan content={message.text} />
              {message.comment && <Red>&nbsp;*</Red>}
              {message.image && <><br/><ResizableImage cid={message.image} /></>}
            </Bubble>
            <Arrow><h2><b>↓</b></h2></Arrow>
            {message.comment && <Comment sender={message.sender}><Red>*&nbsp;</Red>{message.comment}</Comment>}
          </MessageContainer>
        ))}
      </ChatContainer>
    );
};
const ChatContainer = styled.div`
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 18px;
  width: 100%;
`;

const MessageContainer = styled.div<{ sender: 'you' | 'them' }>`
  display: flex;
  flex-direction: column;
  padding: 0px 3px 0px 3px;
  width: 100%;
  margin: 0 auto;
`;

const BUBBLE_WIDTH_PERCENT = 100;
const Bubble = styled.div`
  background-color: white;
  border-radius: 7.5px;
  box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.13);
  width: 100%;
  padding: 15px;
  margin: 0;
  word-wrap: break-word;
  position: relative;
  outline: 2px solid var(--color-header);
`;
const Arrow = styled.div`
  width: 100%;
  padding: 0px;
  margin: 0;
  text-align: center;
  h2 {
    margin: 0;
  }
`;

const SenderName = styled.div`
  font-size: 10px;
  color: #6a6a6a;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Comment = styled.div<{ sender: 'you' | 'them' }>`
  font-size: 12px;
  color: #707070;
  padding: 4px 20px;
  text-align: ${props => props.sender === 'you' ? 'right' : 'left'};
  max-width: ${BUBBLE_WIDTH_PERCENT}%;
`;
const Red = styled.span`
  color: red;
`;
export default React.memo(ChatSimulation);

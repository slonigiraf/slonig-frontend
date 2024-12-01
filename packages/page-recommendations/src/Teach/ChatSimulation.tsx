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
          <MessageContainer key={index} sender={message.sender}>
            <Bubble sender={message.sender}>
              {message.sender !== 'you' && <SenderName>{message.senderName}</SenderName>}
              <KatexSpan content={message.text} />
              {message.comment && <Red>&nbsp;*</Red>}
              {message.image && <><br/><ResizableImage src={message.image} /></>}
            </Bubble>
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
  align-items: ${props => props.sender === 'you' ? 'flex-end' : 'flex-start'};
  padding: 5px;
  width: 100%;
  margin: 0 auto;
`;

const Bubble = styled.div<{ sender: 'you' | 'them' }>`
  background-color: ${props => props.sender === 'you' ? '#daf8cb' : 'white'};
  border-radius: 7.5px;
  box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.13);
  max-width: 80%;
  min-width: 80%;
  padding: 20px;
  margin: 1px 0;
  word-wrap: break-word;
  position: relative;
`;

const SenderName = styled.div`
  position: absolute;
  top: 0.6em;
  left: 20px;
  right: 12px;
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
  max-width: 80%;
`;
const Red = styled.span`
  color: red;
`;
export default React.memo(ChatSimulation);

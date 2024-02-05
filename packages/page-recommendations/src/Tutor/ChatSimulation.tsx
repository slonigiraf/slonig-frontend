import React from 'react';
import { styled } from '@polkadot/react-components';

interface IMessage {
    id: number;
    text: string;
    sender: 'you' | 'them';
    senderName: string;
    comment?: string; // Optional comment property
}

interface WhatsAppChatProps {
    messages: IMessage[];
}

// Styled components
const ChatContainer = styled.div`
  padding: 5px;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 18px;
  width: 100%;
`;

const MessageContainer = styled.div<{ sender: 'you' | 'them' }>`
  display: flex;
  flex-direction: column; // Adjusted for comment alignment
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

const Comment = styled.div`
  font-size: 12px; // Smaller font size for the comment
  color: #707070; // Dim color for the comment
  padding: 4px 20px; // Consistent padding with the message bubble
  text-align: ${props => props.sender === 'you' ? 'right' : 'left'};
  max-width: 80%;
`;

const ChatSimulation: React.FC<WhatsAppChatProps> = ({ messages }) => {
    return (
      <ChatContainer>
        {messages.map((message) => (
          <MessageContainer key={message.id} sender={message.sender}>
            <Bubble sender={message.sender}>
              {message.sender !== 'you' && <SenderName>{message.senderName}</SenderName>}
              {message.text}
              {message.comment && ' *'}
            </Bubble>
            {message.comment && <Comment sender={message.sender}>*&nbsp;{message.comment}</Comment>}
          </MessageContainer>
        ))}
      </ChatContainer>
    );
};

export default React.memo(ChatSimulation);

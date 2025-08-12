import React from 'react';
import { styled } from '@polkadot/react-components';
import { ChatContainer, IMessage, KatexSpan, ResizableImage } from '@slonigiraf/app-slonig-components';

interface ChatSimulationProps {
    messages: IMessage[];
}

const ChatSimulation: React.FC<ChatSimulationProps> = ({ messages }) => {
    return (
      <ChatContainer>
        {messages.map((message, index) => (
          <MessageContainer key={index+message.text+message.image}>
            <Bubble>
              <h2>{message.title}</h2>
              <KatexSpan content={message.text} />
              {message.comment && <Red>&nbsp;*</Red>}
              {message.image && <><br/><ResizableImage cid={message.image} /></>}
            </Bubble>
            <Arrow><h2><b>↓</b></h2></Arrow>
          </MessageContainer>
        ))}
      </ChatContainer>
    );
};

const MessageContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0px 3px 0px 3px;
  width: 100%;
  margin: 0 auto;
`;

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
  text-align: center;
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
const Red = styled.span`
  color: red;
`;
export default React.memo(ChatSimulation);

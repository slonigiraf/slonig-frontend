import React from 'react';

interface IMessage {
    id: number;
    text: string;
    sender: 'you' | 'them';
    senderName: string; // Add this line
}


interface WhatsAppChatProps {
    messages: IMessage[];
}

const ChatSimulation: React.FC<WhatsAppChatProps> = ({ messages }) => {
    return (
      <div style={{ padding: '5px', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: '18px' }}>
        {messages.map((message) => (
          <div key={message.id} style={{
            display: 'flex',
            justifyContent: message.sender === 'you' ? 'flex-end' : 'flex-start',
            padding: '5px',
          }}>
            <div style={{
              backgroundColor: message.sender === 'you' ? '#daf8cb' : 'white',
              borderRadius: '7.5px',
              boxShadow: '0 1px 0.5px rgba(0, 0, 0, 0.13)',
              maxWidth: '80%',
              minWidth: '80%',
              padding: '20px',
              margin: '1px 0',
              wordWrap: 'break-word',
              position: 'relative', // Added for positioning the name inside the bubble
            }}>
              {/* Sender's name inside the bubble */}
              <div style={{
                position: 'absolute',
                top: '0.6em', // Position the name above the text inside the bubble
                left: '20px', // Maintain consistent padding
                right: '12px', // Maintain consistent padding
                fontSize: '10px', // Smaller font size for the name
                color: '#6a6a6a', // Dim color for the name
                overflow: 'hidden', // Ensure long names do not break the layout
                whiteSpace: 'nowrap', // Keep the name in a single line
                textOverflow: 'ellipsis', // Add ellipsis for overflow
              }}>
                {message.sender === 'you' ? '' : message.senderName}
              </div>
              {/* Message text */}
              {message.text}
            </div>
          </div>
        ))}
      </div>
    );
  };
  

export default React.memo(ChatSimulation);
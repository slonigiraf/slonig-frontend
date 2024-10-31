import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TransferModal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';

interface TokenTransferContextType {
    isTransferOpen: boolean;
    recipientId: string;
    setRecipientId: (recepientId: string) => void;
    toggleTransfer: () => void;
}

const defaultTokenTransferContext: TokenTransferContextType = {
    isTransferOpen: false,
    recipientId: '',
    setRecipientId: (_s) => {},
    toggleTransfer: () => {},
};

const TokenTransferContext = createContext<TokenTransferContextType>(defaultTokenTransferContext);

interface TokenTransferProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const TokenTransferProvider: React.FC<TokenTransferProviderProps> = ({ children }) => {
    const [isTransferOpen, toggleTransfer] = useToggle();
    const [recipientId, setRecipientId] = useState<string>('');

    return (
        <TokenTransferContext.Provider value={{ isTransferOpen, recipientId, toggleTransfer, setRecipientId }}>
            {children}
            {isTransferOpen && (
                <TransferModal
                    key='modal-transfer'
                    onClose={toggleTransfer}
                    recipientId={recipientId}
                />
            )}
        </TokenTransferContext.Provider>
    );
};

export const useTokenTransfer = () => useContext(TokenTransferContext);
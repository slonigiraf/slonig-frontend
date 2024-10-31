import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TransferModal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';

interface TokenTransferContextType {
    isTransferOpen: boolean;
    recipientId: string;
    setRecipientId: (recepientId: string) => void;
    toggleTransfer: () => void;
    setIsTransferOpen: (isOpen: boolean) => void;
}

const defaultTokenTransferContext: TokenTransferContextType = {
    isTransferOpen: false,
    recipientId: '',
    setRecipientId: (_) => {},
    toggleTransfer: () => {},
    setIsTransferOpen: (_) => {},
};

const TokenTransferContext = createContext<TokenTransferContextType>(defaultTokenTransferContext);

interface TokenTransferProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const TokenTransferProvider: React.FC<TokenTransferProviderProps> = ({ children }) => {
    const [isTransferOpen, toggleTransfer, setIsTransferOpen] = useToggle();
    const [recipientId, setRecipientId] = useState<string>('');

    return (
        <TokenTransferContext.Provider value={{ isTransferOpen, recipientId, toggleTransfer, setIsTransferOpen, setRecipientId }}>
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
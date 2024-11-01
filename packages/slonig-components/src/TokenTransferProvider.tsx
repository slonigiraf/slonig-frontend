import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TransferModal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { BN, BN_ZERO } from '@polkadot/util';
interface TokenTransferContextType {
    isTransferOpen: boolean;
    recipientId: string;
    amount: BN | undefined;
    caption: string;
    setRecipientId: (recepientId: string) => void;
    toggleTransfer: () => void;
    setIsTransferOpen: (isOpen: boolean) => void;
    setAmount: (amount: BN) => void;
    setCaption: (caption: string) => void;
}

const defaultTokenTransferContext: TokenTransferContextType = {
    isTransferOpen: false,
    recipientId: '',
    amount: BN_ZERO,
    caption: '',
    setRecipientId: (_) => {},
    toggleTransfer: () => {},
    setIsTransferOpen: (_) => {},
    setAmount: (_) => {},
    setCaption: (_) => {},
};

const TokenTransferContext = createContext<TokenTransferContextType>(defaultTokenTransferContext);

interface TokenTransferProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const TokenTransferProvider: React.FC<TokenTransferProviderProps> = ({ children }) => {
    const [isTransferOpen, toggleTransfer, setIsTransferOpen] = useToggle();
    const [recipientId, setRecipientId] = useState<string>('');
    const [amount, setAmount] = useState<BN | undefined>(BN_ZERO);
    const [caption, setCaption] = useState<string>('');
    return (
        <TokenTransferContext.Provider value={{ isTransferOpen, recipientId, amount, caption, toggleTransfer, setIsTransferOpen, setRecipientId, setAmount, setCaption }}>
            {children}
            {isTransferOpen && (
                <TransferModal
                    key='modal-transfer'
                    onClose={toggleTransfer}
                    recipientId={recipientId}
                    amount={amount}
                    caption={caption}
                />
            )}
        </TokenTransferContext.Provider>
    );
};

export const useTokenTransfer = () => useContext(TokenTransferContext);
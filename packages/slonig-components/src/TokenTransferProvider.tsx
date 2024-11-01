import React, { createContext, useContext, useState, ReactNode } from 'react';
import { TransferModal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { BN, BN_ZERO } from '@polkadot/util';
interface TokenTransferContextType {
    isTransferOpen: boolean;
    recipientId: string;
    amount: BN | undefined;
    setRecipientId: (recepientId: string) => void;
    toggleTransfer: () => void;
    setIsTransferOpen: (isOpen: boolean) => void;
    setAmount: (amount: BN) => void;
    setModalCaption: (caption: string) => void;
    setButtonCaption: (caption: string) => void;
}

const defaultTokenTransferContext: TokenTransferContextType = {
    isTransferOpen: false,
    recipientId: '',
    amount: BN_ZERO,
    setRecipientId: (_) => {},
    toggleTransfer: () => {},
    setIsTransferOpen: (_) => {},
    setAmount: (_) => {},
    setModalCaption: (_) => {},
    setButtonCaption: (_) => {},
};

const TokenTransferContext = createContext<TokenTransferContextType>(defaultTokenTransferContext);

interface TokenTransferProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const TokenTransferProvider: React.FC<TokenTransferProviderProps> = ({ children }) => {
    const [isTransferOpen, toggleTransfer, setIsTransferOpen] = useToggle();
    const [recipientId, setRecipientId] = useState<string>('');
    const [amount, setAmount] = useState<BN | undefined>(BN_ZERO);
    const [modalCaption, setModalCaption] = useState<string>('');
    const [buttonCaption, setButtonCaption] = useState<string>('');
    return (
        <TokenTransferContext.Provider value={{ isTransferOpen, recipientId, amount, toggleTransfer, setIsTransferOpen, setRecipientId, setAmount, setModalCaption, setButtonCaption }}>
            {children}
            {isTransferOpen && (
                <TransferModal
                    key='modal-transfer'
                    onClose={toggleTransfer}
                    recipientId={recipientId}
                    amount={amount}
                    modalCaption={modalCaption}
                    buttonCaption={buttonCaption}
                />
            )}
        </TokenTransferContext.Provider>
    );
};

export const useTokenTransfer = () => useContext(TokenTransferContext);
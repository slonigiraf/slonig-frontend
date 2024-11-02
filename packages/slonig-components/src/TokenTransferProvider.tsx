import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { TransferModal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { BN, BN_ZERO } from '@polkadot/util';

interface TokenTransferContextType {
    isTransferReady: boolean;
    isTransferOpen: boolean;
    recipientId: string;
    amount: BN | undefined;
    transferSuccess: boolean;
    setRecipientId: (recipientId: string) => void;
    toggleTransfer: () => void;
    setIsTransferOpen: (isOpen: boolean) => void;
    setAmount: (amount: BN) => void;
    setModalCaption: (caption: string) => void;
    setButtonCaption: (caption: string) => void;
}

const defaultTokenTransferContext: TokenTransferContextType = {
    isTransferReady: false,
    isTransferOpen: false,
    recipientId: '',
    amount: BN_ZERO,
    transferSuccess: false,
    setRecipientId: (_) => { },
    toggleTransfer: () => { },
    setIsTransferOpen: (_) => { },
    setAmount: (_) => { },
    setModalCaption: (_) => { },
    setButtonCaption: (_) => { },
};

const TokenTransferContext = createContext<TokenTransferContextType>(defaultTokenTransferContext);

interface TokenTransferProviderProps {
    children: ReactNode;
}

export const TokenTransferProvider: React.FC<TokenTransferProviderProps> = ({ children }) => {
    const [isTransferOpen, toggleTransfer, setIsTransferOpen] = useToggle();
    const [recipientId, setRecipientId] = useState<string>('');
    const [amount, setAmount] = useState<BN | undefined>(BN_ZERO);
    const [modalCaption, setModalCaption] = useState<string>('');
    const [buttonCaption, setButtonCaption] = useState<string>('');
    const [transferSuccess, setTransferSuccess] = useState<boolean>(false);
    const [isTransferReady, setIsTransferReady] = useState<boolean>(false);

    useEffect(() => {
        setIsTransferReady(true);
    }, [])

    useEffect(() => {
        if (isTransferOpen) {
            setTransferSuccess(false);
        }
    }, [isTransferOpen])

    const handleSuccess = () => {
        setTransferSuccess(true);
        toggleTransfer();
    };

    return (
        <TokenTransferContext.Provider
            value={{
                isTransferReady,
                isTransferOpen,
                recipientId,
                amount,
                transferSuccess,
                setRecipientId,
                toggleTransfer,
                setIsTransferOpen,
                setAmount,
                setModalCaption,
                setButtonCaption,
            }}
        >
            {children}
            {isTransferOpen && (
                <TransferModal
                    key='modal-transfer'
                    onClose={toggleTransfer}
                    onSuccess={handleSuccess}
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
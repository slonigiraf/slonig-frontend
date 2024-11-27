import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { TransferModal } from '@polkadot/react-components';
import { BN, BN_ZERO } from '@polkadot/util';
import { useApi } from '@polkadot/react-hooks';

interface TokenTransferContextType {
    isTransferReady: boolean;
    isTransferOpen: boolean;
    recipientId: string;
    amount: BN | undefined;
    transferSuccess: boolean;
    setRecipientId: (recipientId: string) => void;
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
    const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);
    const [recipientId, setRecipientId] = useState<string>('');
    const [amount, _setAmount] = useState<BN | undefined>(BN_ZERO);
    const [isAmountEditable, setIsAmountEditable] = useState(true);
    const [modalCaption, setModalCaption] = useState<string>('');
    const [buttonCaption, setButtonCaption] = useState<string>('');
    const [transferSuccess, setTransferSuccess] = useState<boolean>(false);
    const [isTransferReady, setIsTransferReady] = useState<boolean>(false);
    const { isApiConnected } = useApi();

    const setAmount = useCallback((value: BN | undefined) => {
        setIsAmountEditable(false);
        _setAmount(value);
    }, [setIsAmountEditable, _setAmount]);

    useEffect(() => {
        setIsTransferReady(true);
    }, [setIsTransferReady])

    // Initialize state after use
    useEffect(() => {
        if (isTransferOpen) {
            setTransferSuccess(false);
        } else {
            _setAmount(BN_ZERO);
            setIsAmountEditable(true);
            setRecipientId('');
            setModalCaption('');
            setButtonCaption('');
        }
    }, [isTransferOpen, _setAmount, setIsAmountEditable])

    const handleSuccess = () => {
        setTransferSuccess(true);
        setIsTransferOpen(false);
    };

    useEffect(() => {
        if (!isApiConnected && isTransferOpen) {
            setIsTransferOpen(false);
        }
    }, [isApiConnected]);

    return (
        <TokenTransferContext.Provider
            value={{
                isTransferReady,
                isTransferOpen,
                recipientId,
                amount,
                transferSuccess,
                setRecipientId,
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
                    onClose={() => setIsTransferOpen(false)}
                    onSuccess={handleSuccess}
                    recipientId={recipientId}
                    amount={amount}
                    isAmountEditable={isAmountEditable}
                    modalCaption={modalCaption}
                    buttonCaption={buttonCaption}
                />
            )}
        </TokenTransferContext.Provider>
    );
};

export const useTokenTransfer = () => useContext(TokenTransferContext);
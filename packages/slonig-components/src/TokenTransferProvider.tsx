import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { TransferModal } from '@polkadot/react-components';
import { BN, BN_ZERO } from '@polkadot/util';
import { useApi } from '@polkadot/react-hooks';
import Confirmation from './Confirmation.js';
import { useTranslation } from './translate.js';

interface TokenTransferContextType {
    isTransferReady: boolean;
    isTransferOpen: boolean;
    senderId: string;
    recipientId: string;
    amount: BN | undefined;
    transferSuccess: boolean;
    setSenderId: (senderId: string) => void;
    setRecipientId: (recipientId: string) => void;
    setIsRewardType: (isRewardType: boolean) => void;
    setIsTransferOpen: (isOpen: boolean) => void;
    setAmount: (amount: BN) => void;
    setModalCaption: (caption: string) => void;
    setButtonCaption: (caption: string) => void;
}

const defaultTokenTransferContext: TokenTransferContextType = {
    isTransferReady: false,
    isTransferOpen: false,
    senderId: '',
    recipientId: '',
    amount: BN_ZERO,
    transferSuccess: false,
    setSenderId: (_) => { },
    setRecipientId: (_) => { },
    setIsRewardType: (_) => { },
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
    const [isRewardType, setIsRewardType] = useState<boolean>(false);
    const [senderId, setSenderId] = useState<string>('');
    const [recipientId, setRecipientId] = useState<string>('');
    const [amount, _setAmount] = useState<BN | undefined>(BN_ZERO);
    const [isAmountEditable, setIsAmountEditable] = useState(true);
    const [modalCaption, setModalCaption] = useState<string>('');
    const [buttonCaption, setButtonCaption] = useState<string>('');
    const [transferSuccess, setTransferSuccess] = useState<boolean>(false);
    const [isTransferReady, setIsTransferReady] = useState<boolean>(false);
    const { isApiConnected } = useApi();
    const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
    const { t } = useTranslation();

    const setAmount = useCallback((value: BN | undefined) => {
        setIsAmountEditable(false);
        _setAmount(value);
    }, [setIsAmountEditable, _setAmount]);

    const closeTokenTransfer = useCallback(() => {
        setIsExitConfirmOpen(false);
        setIsTransferOpen(false);
    }, [setIsExitConfirmOpen, setIsTransferOpen]);

    const onClose = useCallback(() => {
        if (isRewardType) {
            setIsExitConfirmOpen(true);
        } else {
            closeTokenTransfer();
        }
    }, [isRewardType, setIsExitConfirmOpen, closeTokenTransfer]);

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
            setSenderId('');
            setRecipientId('');
            setModalCaption('');
            setButtonCaption('');
            setIsRewardType(false);
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
                senderId,
                recipientId,
                amount,
                transferSuccess,
                setSenderId,
                setRecipientId,
                setIsRewardType,
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
                    isRewardType={isRewardType}
                    onClose={onClose}
                    onSuccess={handleSuccess}
                    onConfirmedClose={closeTokenTransfer}
                    senderId={senderId}
                    recipientId={recipientId}
                    amount={amount}
                    isAmountEditable={isAmountEditable}
                    modalCaption={modalCaption}
                    buttonCaption={buttonCaption}
                />
            )}
            {isExitConfirmOpen && (
                <Confirmation question={t('Sure to delete learning results?')} onClose={() => setIsExitConfirmOpen(false)} onConfirm={closeTokenTransfer} />
            )}
        </TokenTransferContext.Provider>
    );
};

export const useTokenTransfer = () => useContext(TokenTransferContext);
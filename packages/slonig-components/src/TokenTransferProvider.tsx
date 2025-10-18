import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { TransferModal } from '@polkadot/react-components';
import { BN, BN_ZERO } from '@polkadot/util';
import { useApi } from '@polkadot/react-hooks';
import Confirmation from './Confirmation.js';
import { useTranslation } from './translate.js';
import { TransferReceipt } from './index.js';

interface TokenTransferContextType {
    isTransferReady: boolean;
    isTransferOpen: boolean;
    senderId: string;
    recipientId: string;
    amount: BN | undefined;
    transferReceipt: TransferReceipt | undefined;
    setSenderId: (senderId: string) => void;
    setRecipientId: (recipientId: string) => void;
    setIsRewardType: (isRewardType: boolean) => void;
    setAmount: (amount: BN) => void;
    openTransfer: (transferReceipt?: TransferReceipt) => void;
}

const defaultTokenTransferContext: TokenTransferContextType = {
    isTransferReady: false,
    isTransferOpen: false,
    senderId: '',
    recipientId: '',
    transferReceipt: undefined,
    amount: BN_ZERO,
    setSenderId: (_) => { },
    setRecipientId: (_) => { },
    openTransfer: (_) => { },
    setIsRewardType: (_) => { },
    setAmount: (_) => { },
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
    const [transferReceipt, setTransferReceipt] = useState<TransferReceipt | undefined>(undefined);
    const [isTransferReady, setIsTransferReady] = useState<boolean>(false);
    const { isApiConnected } = useApi();
    const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
    const { t } = useTranslation();

    const setAmount = useCallback((value: BN | undefined) => {
        setIsAmountEditable(false);
        _setAmount(value);
    }, [setIsAmountEditable, _setAmount]);

    const openTransfer = useCallback((transferReceipt?: TransferReceipt) => {
        setTransferReceipt(transferReceipt);
    }, [setTransferReceipt]);

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
    // NOTICE that transferReceipt is initialized separately!!!
    useEffect(() => {
        if (!isTransferOpen) {
            _setAmount(BN_ZERO);
            setIsAmountEditable(true);
            setSenderId('');
            setRecipientId('');
            setIsRewardType(false);
        }
    }, [isTransferOpen, _setAmount, setIsAmountEditable])

    const handleSuccess = () => {
        transferReceipt && setTransferReceipt({ ...transferReceipt, success: true });
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
                transferReceipt,
                openTransfer,
                setSenderId,
                setRecipientId,
                setIsRewardType,
                setAmount,
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
                />
            )}
            {isExitConfirmOpen && (
                <Confirmation question={t('Sure to delete learning results?')} onClose={() => setIsExitConfirmOpen(false)} onConfirm={closeTokenTransfer} />
            )}
        </TokenTransferContext.Provider>
    );
};

export const useTokenTransfer = () => useContext(TokenTransferContext);
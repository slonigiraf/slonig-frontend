import { Reimbursement } from '@slonigiraf/db';
import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useApi } from '@polkadot/react-hooks';
import { useLoginContext } from './LoginContext.js';
import BN from 'bn.js';

interface ReimbursementContextType {
    reimburse: (reimbursements: Reimbursement[]) => Promise<void>;
}

const defaultContext: ReimbursementContextType = {
    reimburse: async (_: Reimbursement[]) => { },
};

const ReimbursementContext = createContext<ReimbursementContextType>(defaultContext);

interface ReimbursementProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const ReimbursementProvider: React.FC<ReimbursementProviderProps> = ({ children }) => {
    const { api, isApiReady } = useApi();
    const { currentPair, isLoggedIn } = useLoginContext();

    useEffect(() => {
        if(api && isApiReady && currentPair){
            // Subscribe to referees balances
            // For example:
            // api.query.system.account(currentPair?.address, ({ data: { free } }) => {
            //     console.log(`Free balance: ${free}`);
            //   });
        }
      }, [api, isApiReady, currentPair]);

    const reimburse = async (reimbursements: Reimbursement[]) => {
        if(!currentPair || !api || !isApiReady || !isLoggedIn) {
            return;
        }
        // How to submit only insurances that have enough referee balance?
        // What to do if there are to many insurances?

        let signedTransactionsPromises = reimbursements.map(async reimbursement => {
            return api.tx.letters.reimburse(
                reimbursement.letterNumber,
                new BN(reimbursement.block),
                new BN(reimbursement.blockAllowed),
                reimbursement.referee,
                reimbursement.worker,
                reimbursement.employer,
                new BN(reimbursement.amount),
                reimbursement.signOverReceipt,
                reimbursement.workerSign
            );
        });

        const txs = (await Promise.all(signedTransactionsPromises)).filter(tx => tx !== undefined);

        if (txs && txs.length > 0) {
            api.tx.utility
                .forceBatch(txs)
                .signAndSend(currentPair, ({ status }) => {
                    if (status.isInBlock) {
                        // TODO listen events
                        console.log(`included in ${status.asInBlock}`);
                    }
                });
        }
    };
    return (
        <ReimbursementContext.Provider value={{ reimburse }}>
            {children}
        </ReimbursementContext.Provider>
    );
};

export const useReimbursement = () => useContext(ReimbursementContext);
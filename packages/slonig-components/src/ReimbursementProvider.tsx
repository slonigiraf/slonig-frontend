import { Insurance } from '@slonigiraf/db';
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useApi } from '@polkadot/react-hooks';
import { useLoginContext } from './LoginContext.js';
import BN from 'bn.js';

interface ReimbursementContextType {
    reimburse: (insurances: Insurance[]) => Promise<void>;
}

const defaultContext: ReimbursementContextType = {
    reimburse: async (_insurances: Insurance[]) => { },
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

    const reimburse = async (insurances: Insurance[]) => {
        if(!currentPair || !api || !isApiReady || !isLoggedIn) {
            return;
        }
        // How to submit only insurances that have enough referee balance?
        // What to do if there are to many insurances?

        let signedTransactionsPromises = insurances.map(async insurance => {
            return api.tx.letters.reimburse(
                insurance.letterNumber,
                new BN(insurance.block),
                new BN(insurance.blockAllowed),
                insurance.referee,
                insurance.worker,
                insurance.employer,
                new BN(insurance.amount),
                insurance.signOverReceipt,
                insurance.workerSign
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
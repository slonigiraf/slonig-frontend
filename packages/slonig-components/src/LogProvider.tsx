import React, { createContext, useContext, ReactNode, useCallback } from 'react';
import { bnToSlonFloatOrNaN, PartnersTodayResult, StoredEconomy } from './index.js';
import BN from 'bn.js';
interface LogContextType {
  logEvent: (category: string, action: string, name?: string, value?: number) => void;
  logEconomy: (storedEconomy: StoredEconomy) => void;
  logPartners: (partnersTodayResult: PartnersTodayResult) => void;
}

const defaultLogContext: LogContextType = {
  logEvent: (_category: string, _action: string, _name?: string, _value?: number) => { },
  logEconomy: (_storedEconomy: StoredEconomy) => { },
  logPartners: (_partnersTodayResult: PartnersTodayResult) => { },
};

const LogContext = createContext<LogContextType>(defaultLogContext);

interface LogProviderProps {
  children: ReactNode;
}

export const LogProvider: React.FC<LogProviderProps> = ({ children }) => {
  const logEvent = useCallback(
    (category: string, action: string, name?: string, value?: number) => {
      // SSR/Node safety
      if (typeof window === 'undefined') return;

      // Don't log on localhost (dev)
      const host = window.location.hostname;
      const isLocalhost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        // covers 127.x.x.x
        /^127(?:\.\d{1,3}){3}$/.test(host);

      if (isLocalhost) {
        const isValueDefined = value !== null && value !== undefined;
        console.log(`${category} - ${action}${name ? ' - ' + name : ''}${isValueDefined ? ' - ' + value : ''}`)
        return;
      }

      // Matomo allows queuing events before the tracker script is fully loaded.
      window._paq = window._paq || [];

      // Build args, only include optional params if provided
      const args: any[] = ['trackEvent', category, action];

      if (typeof name === 'string' && name.length > 0) {
        args.push(name);

        if (Number.isFinite(value)) {
          args.push(Math.round(value as number));
        }
      }

      window._paq.push(args as any);
    },
    []
  );

  const logEconomy = useCallback(
    (storedEconomy: StoredEconomy) => {
      logEvent('SETTINGS', 'ECONOMY_DIPLOMA_PRICE', 'tokens', bnToSlonFloatOrNaN(new BN(storedEconomy.diplomaPrice)));
      logEvent('SETTINGS', 'ECONOMY_DIPLOMA_WARRANTY', 'tokens', bnToSlonFloatOrNaN(new BN(storedEconomy.diplomaWarranty)));
      logEvent('SETTINGS', 'ECONOMY_DIPLOMA_VALIDITY', 'days', parseInt(storedEconomy.diplomaValidity, 10));
      logEvent('SETTINGS', 'ECONOMY_EXPECTED_AIRDROP', 'tokens', bnToSlonFloatOrNaN(new BN(storedEconomy.expectedAirdrop)));
      logEvent('SETTINGS', 'ECONOMY_INITIALIZED', storedEconomy.economyInitialized);
    },
    [logEvent]
  );

  const logPairs = useCallback(
    (r: PartnersTodayResult) => {
      if (r.isNewPartnerToday || r.isDifferentFromLast) {
        logEvent('CLASSROOM', 'NEW_PARTNER_FOUND');
      }
      if (r.isNewPartnerToday) {
        logEvent('CLASSROOM', 'UNIQUE_PARTNERS_COUNT', 'unique_partners_count_' + r.uniquePartnersToday.toString());
      }
    },
    [logEvent]
  );

  return <LogContext.Provider value={{ logEvent, logEconomy, logPartners: logPairs }}>{children}</LogContext.Provider>;
};

export const useLog = () => useContext(LogContext);
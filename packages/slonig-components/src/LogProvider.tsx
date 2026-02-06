import React, { createContext, useContext, ReactNode, useCallback } from 'react';
import { bnToSlonFloatOrNaN, PartnersTodayResult, StoredEconomy, stringToNumber } from './index.js';
import BN from 'bn.js';
import { getSetting, putScheduledEvent, SettingKey, storeSetting } from '@slonigiraf/db';
import { serializeEventData } from './utils.js';
import { MAX_TUTORIALS_BEFORE_TEACHER_SUPERVISION } from '@slonigiraf/utils';
interface LogContextType {
  logEvent: (category: string, action: string, name?: string, value?: number) => void;
  logEconomy: (storedEconomy: StoredEconomy) => void;
  logPartners: (partnersTodayResult: PartnersTodayResult) => void;
  logBan: (reason: string) => void;
}

const defaultLogContext: LogContextType = {
  logEvent: (_category: string, _action: string, _name?: string, _value?: number) => { },
  logEconomy: (_storedEconomy: StoredEconomy) => { },
  logPartners: (_partnersTodayResult: PartnersTodayResult) => { },
  logBan: (_reason: string) => { },
};

const LogContext = createContext<LogContextType>(defaultLogContext);

interface LogProviderProps {
  children: ReactNode;
}

export const LogProvider: React.FC<LogProviderProps> = ({ children }) => {
  const logEvent = useCallback(
    (category: string, action: string, name?: string, value?: number) => {
      const data = [category, action, name, value?.toString()].filter(
        (x): x is string => x !== undefined
      );

      putScheduledEvent({
        type: 'LOG',
        data: serializeEventData(data),
        deadline: Date.now()
      });
    },
    [putScheduledEvent]
  );

  const logBan = useCallback(
    async (reason: string) => {
      const now = Date.now();

      const banCount = stringToNumber(await getSetting(SettingKey.BAN_COUNT)) || 0;
      const currentBanCount = banCount + 1;
      await storeSetting(SettingKey.BAN_COUNT, currentBanCount.toString());

      logEvent('TUTORING', 'BAN', 'ban_' + reason);
      logEvent('TUTORING', 'BAN_COUNT', `ban_count_${currentBanCount}`);

      await storeSetting(SettingKey.LAST_BAN_START_TIME, now.toString());
      const requireSupervision = currentBanCount % MAX_TUTORIALS_BEFORE_TEACHER_SUPERVISION === 1;
      await putScheduledEvent({
        type: 'BAN',
        data: serializeEventData([requireSupervision ? 'require_supervision' : '']),
        deadline: now
      });
    },
    [putScheduledEvent]
  );

  const logEconomy = useCallback(
    (storedEconomy: StoredEconomy) => {
      logEvent('SETTINGS', 'ECONOMY_DIPLOMA_PRICE', 'economy_diploma_price_slon', bnToSlonFloatOrNaN(new BN(storedEconomy.diplomaPrice)));
      logEvent('SETTINGS', 'ECONOMY_DIPLOMA_WARRANTY', 'economy_diploma_warranty_slon', bnToSlonFloatOrNaN(new BN(storedEconomy.diplomaWarranty)));
      logEvent('SETTINGS', 'ECONOMY_DIPLOMA_VALIDITY', 'economy_diploma_validity_day', parseInt(storedEconomy.diplomaValidity, 10));
      logEvent('SETTINGS', 'ECONOMY_EXPECTED_AIRDROP', 'economy_expected_airdrop_slon', bnToSlonFloatOrNaN(new BN(storedEconomy.expectedAirdrop)));
      logEvent('SETTINGS', 'ECONOMY_INITIALIZED');
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

  return <LogContext.Provider value={{ logBan, logEvent, logEconomy, logPartners: logPairs }}>{children}</LogContext.Provider>;
};

export const useLog = () => useContext(LogContext);
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSetting, storeSetting, SettingKey } from '@slonigiraf/db';

interface Settings {
  ACCOUNT: string | undefined;
  ENCRYPTION_KEY: string | undefined;
  IV: string | undefined;
  TUTOR: string | undefined;
  LESSON: string | undefined;
  RESULTS_FOR_LESSON: string | undefined;
  DEVELOPER: string | undefined;
  TEACHER: string | undefined;
  DIPLOMA_PRICE: string | undefined;
  DIPLOMA_WARRANTY: string | undefined;
  DIPLOMA_VALIDITY: string | undefined;
  INSURANCE_VALIDITY: string | undefined;
  CID_CACHE_SIZE: string | undefined;
  ECONOMY_INITIALIZED: string | undefined;
  AIRDROP_COMPATIBLE: string | undefined;
  RECEIVED_AIRDROP: string | undefined;
  LESSON_RESULTS_ARE_SHOWN: string | undefined;
  TUTOR_TUTORIAL_COMPLETED: string | undefined;
  TUTEE_TUTORIAL_COMPLETED: string | undefined;
  SCAN_TUTORIAL_COMPLETED: string | undefined;
}

interface SettingsContextType {
  settings: Settings;
  saveSetting: (key: keyof Settings, value: string) => Promise<void>;
}

const defaultSettings: Settings = {
  ACCOUNT: undefined,
  ENCRYPTION_KEY: undefined,
  IV: undefined,
  TUTOR: undefined,
  LESSON: undefined,
  RESULTS_FOR_LESSON: undefined,
  DEVELOPER: undefined,
  TEACHER: undefined,
  DIPLOMA_PRICE: undefined,
  DIPLOMA_WARRANTY: undefined,
  DIPLOMA_VALIDITY: undefined,
  INSURANCE_VALIDITY: undefined,
  CID_CACHE_SIZE: undefined,
  ECONOMY_INITIALIZED: undefined,
  AIRDROP_COMPATIBLE: undefined,
  RECEIVED_AIRDROP: undefined,
  LESSON_RESULTS_ARE_SHOWN: undefined,
  TUTOR_TUTORIAL_COMPLETED: undefined,
  TUTEE_TUTORIAL_COMPLETED: undefined,
  SCAN_TUTORIAL_COMPLETED: undefined,
};

const defaultContext: SettingsContextType = {
  settings: defaultSettings,
  saveSetting: async () => { }
};

const SettingsContext = createContext<SettingsContextType>(defaultContext);

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, _setSettings] = useState<Settings>(defaultSettings);

  console.log('settings: ', settings)

  useEffect(() => {
    (async () => {
      const keys = Object.keys(defaultSettings) as (keyof Settings)[];
      const newState: Partial<Settings> = {};

      for (const key of keys) {
        try {
          const settingKey = (SettingKey as any)[key] ?? key;
          const storedValue = await getSetting(settingKey);
          if (storedValue !== undefined && storedValue !== null) {
            newState[key] = storedValue;
          }
        } catch (err) {
          console.warn(`Could not load setting for ${key}`, err);
        }
      }

      _setSettings(prev => ({ ...prev, ...newState }));
    })();
  }, []);

  const setSettings = async (key: keyof Settings, value: string) => {
    _setSettings(prev => ({ ...prev, [key]: value }));
    const settingKey = (SettingKey as any)[key] ?? key;
    await storeSetting(settingKey, value);
  };

  return (
    <SettingsContext.Provider value={{ settings: settings, saveSetting: setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
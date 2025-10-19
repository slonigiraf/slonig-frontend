import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSetting, storeSetting, SettingKey } from '@slonigiraf/db';

// --- Derive type from SettingKey ---
type SettingKeyType = typeof SettingKey;
type SettingName = keyof SettingKeyType;

interface Settings extends Record<SettingName, string | undefined> { }

interface SettingsContextType {
  settings: Settings;
  saveSetting: (key: SettingKeyType[keyof SettingKeyType], value: string) => Promise<void>;
}

// --- Default values ---
const defaultSettings = Object.keys(SettingKey).reduce((acc, key) => {
  acc[key as SettingName] = undefined;
  return acc;
}, {} as Settings);

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

  useEffect(() => {
    (async () => {
      const newState: Partial<Settings> = {};

      for (const key of Object.keys(SettingKey) as SettingName[]) {
        try {
          const settingKey = SettingKey[key];
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

  const saveSetting = async (key: SettingKeyType[keyof SettingKeyType], value: string) => {
    const entry = Object.entries(SettingKey).find(([_, v]) => v === key);
    if (!entry) throw new Error(`Invalid SettingKey: ${key}`);

    const [logicalKey] = entry as [SettingName, string];

    _setSettings(prev => ({ ...prev, [logicalKey]: value }));
    await storeSetting(key, value);
  };

  return (
    <SettingsContext.Provider value={{ settings, saveSetting }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
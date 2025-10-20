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
      try {
        const entries = Object.keys(SettingKey).map(async (key) => {
          const logicalKey = key as SettingName;
          const settingKey = SettingKey[logicalKey];
          try {
            const value = await getSetting(settingKey);
            return [logicalKey, value] as const;
          } catch (err) {
            console.warn(`Could not load setting for ${key}`, err);
            return [logicalKey, undefined] as const;
          }
        });

        const results = await Promise.all(entries);

        const newSettings = results.reduce((acc, [k, v]) => {
          acc[k] = v;
          return acc;
        }, {} as Settings);

        _setSettings((prev) => ({ ...prev, ...newSettings }));
      } catch (err) {
        console.error('Failed to initialize settings', err);
      }
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
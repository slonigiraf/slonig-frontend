import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSetting, storeSetting, SettingKey } from '@slonigiraf/db';

interface Settings {
  TUTOR_TUTORIAL_COMPLETED: string;
  TUTEE_TUTORIAL_COMPLETED: string;
  SCAN_TUTORIAL_COMPLETED: string;
}

interface SettingsContextType {
  settings: Settings;
  setSettings: (key: keyof Settings, value: string) => Promise<void>;
}

const defaultSettings: Settings = {
  TUTOR_TUTORIAL_COMPLETED: 'false',
  TUTEE_TUTORIAL_COMPLETED: 'false',
  SCAN_TUTORIAL_COMPLETED: 'false'
};

const defaultContext: SettingsContextType = {
  settings: defaultSettings,
  setSettings: async () => {}
};

const SettingsContext = createContext<SettingsContextType>(defaultContext);

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, _setSettings] = useState<Settings>(defaultSettings);

  console.log(settings)

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
    <SettingsContext.Provider value={{ settings: settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
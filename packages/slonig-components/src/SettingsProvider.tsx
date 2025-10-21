import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback
} from 'react';
import { getSetting, storeSetting, SettingKey } from '@slonigiraf/db';

// ---------- Types derived from SettingKey ----------
type SettingKeyType = typeof SettingKey;
type SettingName = keyof SettingKeyType;
type SettingValue = SettingKeyType[SettingName]; // union of all SettingKey values

interface Settings extends Record<SettingName, string | undefined> {}

interface SettingsContextType {
  settings: Settings;
  saveSetting: <K extends SettingName>(key: typeof SettingKey[K], value: string) => Promise<void>;
  isTrueSetting: <K extends SettingName>(key: typeof SettingKey[K]) => boolean;
  getBooleanOrUndefinedSetting: <K extends SettingName>(key: typeof SettingKey[K]) => boolean | undefined;
}

// ---------- Default values ----------
const defaultSettings = Object.keys(SettingKey).reduce((acc, key) => {
  acc[key as SettingName] = undefined;
  return acc;
}, {} as Settings);

const defaultContext: SettingsContextType = {
  settings: defaultSettings,
  saveSetting: async () => {},
  isTrueSetting: () => false,
  getBooleanOrUndefinedSetting: () => undefined
};

const SettingsContext = createContext<SettingsContextType>(defaultContext);

interface SettingsProviderProps {
  children: ReactNode;
}

// ---------- Provider ----------
export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, _setSettings] = useState<Settings>(defaultSettings);

  // Helper: reverse lookup map (for speed and clarity)
  const reverseSettingKey = Object.fromEntries(
    Object.entries(SettingKey).map(([k, v]) => [v, k])
  ) as Record<SettingValue, SettingName>;

  // --- isTrueSetting ---
  const isTrueSetting = useCallback(
    <K extends SettingName>(key: typeof SettingKey[K]): boolean => {
      const logicalKey = reverseSettingKey[key];
      if (!logicalKey) throw new Error(`Unknown SettingKey: ${key}`);
      return settings[logicalKey] === 'true';
    },
    [settings, reverseSettingKey]
  );

  // --- getBooleanOrUndefinedSetting ---
  const getBooleanOrUndefinedSetting = useCallback(
    <K extends SettingName>(key: typeof SettingKey[K]): boolean | undefined => {
      const logicalKey = reverseSettingKey[key];
      if (!logicalKey) throw new Error(`Unknown SettingKey: ${key}`);

      const value = settings[logicalKey];
      return value === undefined ? undefined : isTrueSetting(key);
    },
    [settings, isTrueSetting, reverseSettingKey]
  );

  // --- Load all settings once on mount ---
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

  // --- saveSetting ---
  const saveSetting = useCallback(
    async <K extends SettingName>(key: typeof SettingKey[K], value: string): Promise<void> => {
      const logicalKey = reverseSettingKey[key];
      if (!logicalKey) throw new Error(`Invalid SettingKey: ${key}`);

      _setSettings((prev) => ({ ...prev, [logicalKey]: value }));
      await storeSetting(key, value);
    },
    [reverseSettingKey]
  );

  // --- Context value ---
  return (
    <SettingsContext.Provider
      value={{ settings, saveSetting, isTrueSetting, getBooleanOrUndefinedSetting }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

// ---------- Hook ----------
export const useSettings = () => useContext(SettingsContext);
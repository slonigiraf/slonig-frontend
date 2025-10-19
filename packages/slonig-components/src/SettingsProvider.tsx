import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSetting, storeSetting, SettingKey } from '@slonigiraf/db';

interface TutorialStep {
  TUTOR_TUTORIAL_COMPLETED: boolean;
  TUTEE_TUTORIAL_COMPLETED: boolean;
  SCAN_TUTORIAL_COMPLETED: boolean;
}

interface SettingsContextType {
  tutorialStep: TutorialStep;
  setTutorialStep: (key: keyof TutorialStep, value: boolean) => void;
}

const defaultTutorialStep: TutorialStep = {
  TUTOR_TUTORIAL_COMPLETED: false,
  TUTEE_TUTORIAL_COMPLETED: false,
  SCAN_TUTORIAL_COMPLETED: false
};

const defaultContext: SettingsContextType = {
  tutorialStep: defaultTutorialStep,
  setTutorialStep: () => {}
};

const SettingsContext = createContext<SettingsContextType>(defaultContext);

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [tutorialStep, setTutorialStepState] = useState<TutorialStep>(defaultTutorialStep);

  console.log('tutorialStep: ', tutorialStep)

  // Load each key individually on mount
  useEffect(() => {
    (async () => {
      const keys = Object.keys(defaultTutorialStep) as (keyof TutorialStep)[];
      const newState: Partial<TutorialStep> = {};

      for (const key of keys) {
        try {
          // Convert to SettingKey dynamically
          const settingKey = (SettingKey as any)[key] ?? key;
          const storedValue = await getSetting(settingKey);
          newState[key] = storedValue === 'true';
        } catch (err) {
          console.warn(`Could not load setting for ${key}`, err);
        }
      }

      setTutorialStepState(prev => ({ ...prev, ...newState }));
    })();
  }, []);

  const setTutorialStep = async (key: keyof TutorialStep, value: boolean) => {
    setTutorialStepState(prev => ({ ...prev, [key]: value }));
    const settingKey = (SettingKey as any)[key] ?? key;
    await storeSetting(settingKey, value.toString());
  };

  return (
    <SettingsContext.Provider value={{ tutorialStep, setTutorialStep }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext);
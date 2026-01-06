import React, { createContext, useContext, ReactNode, useCallback } from 'react';

interface LogContextType {
  log: (category: string, action: string, name: string, value: number) => void;
}

const defaultLogContext: LogContextType = {
  log: (_category: string, _action: string, _name: string, _value: number) => {},
};

const LogContext = createContext<LogContextType>(defaultLogContext);

interface LogProviderProps {
  children: ReactNode;
}

export const LogProvider: React.FC<LogProviderProps> = ({ children }) => {
  const log = useCallback(
    (category: string, action: string, name: string, value: number) => {
      // SSR/Node safety
      if (typeof window === 'undefined') return;

      // Matomo allows queuing events before the tracker script is fully loaded.
      window._paq = window._paq || [];

      const v = Number.isFinite(value) ? Math.round(value) : 0;

      // Matomo event: ['trackEvent', category, action, name, value]
      window._paq.push(['trackEvent', category, action, name, v]);
    },
    []
  );

  return <LogContext.Provider value={{ log }}>{children}</LogContext.Provider>;
};

export const useLog = () => useContext(LogContext);
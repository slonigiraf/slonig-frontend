import React, { createContext, useContext, ReactNode, useCallback } from 'react';

interface LogContextType {
  log: (category: string, action: string, name?: string, value?: number) => void;
}

const defaultLogContext: LogContextType = {
  log: (_category: string, _action: string, _name?: string, _value?: number) => {},
};

const LogContext = createContext<LogContextType>(defaultLogContext);

interface LogProviderProps {
  children: ReactNode;
}

export const LogProvider: React.FC<LogProviderProps> = ({ children }) => {
  const log = useCallback(
    (category: string, action: string, name?: string, value?: number) => {
      // SSR/Node safety
      if (typeof window === 'undefined') return;

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

  return <LogContext.Provider value={{ log }}>{children}</LogContext.Provider>;
};

export const useLog = () => useContext(LogContext);
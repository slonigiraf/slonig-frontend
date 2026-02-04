import React, { createContext, useContext, ReactNode, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ScheduledEvent } from 'db/src/db/ScheduledEvent.js';
import { deserializeEventData } from './utils.js';
import { deleteScheduledEvent, getAllBanEvents, getAllLogEvents, getFirstScheduledEventByType, setSettingToTrue, SettingKey } from '@slonigiraf/db';
import { MATOMO_PAUSE_BETWEEN_EVENTS_MS } from '@slonigiraf/utils';

interface EventsQueueContextType {
}

const defaultContext: EventsQueueContextType = {
};

const EventsQueueContext = createContext<EventsQueueContextType>(defaultContext);

interface EventsQueueProviderProps {
  children: ReactNode;
}

const shortPause = () => new Promise<void>(resolve => setTimeout(resolve, MATOMO_PAUSE_BETWEEN_EVENTS_MS));


export const EventsQueueProvider: React.FC<EventsQueueProviderProps> = ({ children }) => {
  const allLogEvents = useLiveQuery(getAllLogEvents, []);
  const allBanEvents = useLiveQuery(getAllBanEvents, []);
  const lastEventId = useRef<number | null>(null);

  const scheduledLogEvent = useLiveQuery(async () => {
    return getFirstScheduledEventByType('LOG');
  }, [allLogEvents]);

  useEffect(() => {
    const scheduleBan = async () => {
      if (allBanEvents === undefined || allBanEvents.length === 0) return;
      await setSettingToTrue(SettingKey.BAN_TUTORING);
    }
    scheduleBan();
  }, [allBanEvents]);

  useEffect(() => {
    const submitLogEvent = async (scheduledLogEvent: ScheduledEvent) => {
      if(scheduledLogEvent === undefined || 
        scheduledLogEvent.id === undefined ||
        scheduledLogEvent.id === lastEventId.current){
        return;
      }
      lastEventId.current = scheduledLogEvent.id;

      const [category, action, name, value] = deserializeEventData(scheduledLogEvent.data) as [
        string,
        string,
        string?,
        string?
      ];

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
        console.log(`EVENT: ${category} - ${action}${name ? ' - ' + name : ''}${isValueDefined ? ' - ' + value : ''}`)
      } else {
        // Matomo allows queuing events before the tracker script is fully loaded.
        window._paq = window._paq || [];

        // Build args, only include optional params if provided
        const args: any[] = ['trackEvent', category, action];

        if (typeof name === 'string' && name.length > 0) {
          args.push(name);

          if (value !== undefined) {
            args.push(Math.round(parseInt(value, 10)));
          }
        }

        window._paq.push(args as any);
      }
      await shortPause();
      if (scheduledLogEvent.id) deleteScheduledEvent(scheduledLogEvent.id);
    }

    submitLogEvent(scheduledLogEvent);
  }, [scheduledLogEvent]);

  return <EventsQueueContext.Provider value={{}}>{children}</EventsQueueContext.Provider>;
};

export const useEventsQueue = () => useContext(EventsQueueContext);
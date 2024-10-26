import React, { useState, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { Modal } from '@polkadot/react-components';
import { styled } from '@polkadot/react-components';
import 'react-day-picker/dist/style.css';
import { useTranslation } from './translate.js';

interface DateInputProps {
  date: Date | null;
  onDateChange: (date: Date | null) => void;
  id: string;
  label?: string;
  sessionStorageId?: string;
}

const saveToSessionStorage = (key: string, value: any) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, JSON.stringify(value));
};

const loadFromSessionStorage = (key: string) => {
  if (typeof window === "undefined") return null;
  const storedValue = sessionStorage.getItem(key);
  return storedValue ? JSON.parse(storedValue) : null;
};

const StyledDayPicker = styled(DayPicker)`
  --rdp-accent-color: #F39200;
  .start_date_id {
    border: none;
  }
`;

function DateInput({ date, onDateChange, id, label, sessionStorageId }: DateInputProps) {
  const { t } = useTranslation();
  const [showCalendar, setShowCalendar] = useState(false);
  const [userLocale, setUserLocale] = useState('en-US');

  useEffect(() => {
    const locale = navigator.language || 'en-US';
    setUserLocale(locale);
  }, []);

  useEffect(() => {
    if (sessionStorageId) {
      const storedDate = loadFromSessionStorage(id);
      if (storedDate) {
        onDateChange(new Date(storedDate));
      }
    }
  }, [sessionStorageId, onDateChange]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onDateChange(selectedDate);
      setShowCalendar(false);
      if (sessionStorageId) {
        saveToSessionStorage(sessionStorageId, selectedDate.toISOString());
      }
    }
  };

  const handleInputClick = () => {
    setShowCalendar(true);
  };

  const formattedDate = date ? new Intl.DateTimeFormat(userLocale).format(date) : '';

  return (
    <div style={{ display: 'inline-block' }}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        type="text"
        id={id}
        value={formattedDate}
        readOnly
        onClick={handleInputClick}
        style={{
          cursor: 'pointer',
          height: '2.5em',
          textAlign: 'center',
          width: '120px',
          borderWidth: '0.5px',
        }}
      />
      {showCalendar && (
        <Modal
          header={t('Select date')}
          onClose={() => setShowCalendar(false)}
          size="tiny"
        >
          <Modal.Content>
            <StyledDayPicker
              mode="single"
              selected={date || undefined}
              onSelect={handleDateSelect}
              locale={userLocale}
            />
          </Modal.Content>
        </Modal>
      )}
    </div>
  );
}

export default DateInput;
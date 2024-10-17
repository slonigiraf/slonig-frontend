import React, { useState, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { Modal } from '@polkadot/react-components';
import { styled } from '@polkadot/react-components';
import 'react-day-picker/dist/style.css';

interface DateInputProps {
  date: Date | null;
  onDateChange: (date: Date | null) => void;
  id: string;
  label?: string;
}

const StyledDayPicker = styled(DayPicker)`
`;

function DateInput({ date, onDateChange, id, label }: DateInputProps) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [userLocale, setUserLocale] = useState('en-US');

  useEffect(() => {
    const locale = navigator.language || 'en-US';
    setUserLocale(locale);
  }, []);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onDateChange(selectedDate);
      setShowCalendar(false);
    }
  };

  const handleInputClick = () => {
    setShowCalendar(true);
  };

  // Use Intl.DateTimeFormat to format the date according to the user's locale
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
          }}
      />
      {showCalendar && (
        <Modal
          header="Select Date"
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
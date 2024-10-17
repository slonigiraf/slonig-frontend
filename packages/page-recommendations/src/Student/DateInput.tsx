// DateInput component with modal-based calendar popup

import React, { useState, useRef, useEffect } from 'react';
import moment from 'moment';
import { DayPicker } from 'react-day-picker';
import { Button, Modal } from '@polkadot/react-components';
import { styled } from '@polkadot/react-components';
import 'react-day-picker/dist/style.css';

interface DateInputProps {
  date: moment.Moment | null;
  onDateChange: (date: moment.Moment | null) => void;
  id: string;
  label?: string;
}

const StyledDayPicker = styled(DayPicker)`

`;

function DateInput({ date, onDateChange, id, label }: DateInputProps) {
  const [showCalendar, setShowCalendar] = useState(false);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onDateChange(moment(selectedDate));
      setShowCalendar(false);
    }
  };

  const handleInputClick = () => {
    setShowCalendar(true);
  };

  const formattedDate = date ? date.format('YYYY-MM-DD') : '';

  return (
    <div style={{ display: 'inline-block' }}>
      {label && <label htmlFor={id}>{label}</label>}
      <input
        type="text"
        id={id}
        value={formattedDate}
        readOnly
        onClick={handleInputClick}
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
              selected={date ? date.toDate() : undefined}
              onSelect={handleDateSelect}
            />
          </Modal.Content>
        </Modal>
      )}
    </div>
  );
}

export default React.memo(DateInput);
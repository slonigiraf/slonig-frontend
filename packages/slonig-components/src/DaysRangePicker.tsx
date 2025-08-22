import React, { useState, useEffect } from "react";
import { styled, Icon } from "@polkadot/react-components";
import { DateInput, loadFromSessionStorage, saveToSessionStorage } from "@slonigiraf/app-slonig-components";
import { useTranslation } from "./translate.js";

interface DaysRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  sessionStorageId: string;
}

const DaysRangePicker: React.FC<DaysRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  sessionStorageId,
}) => {
  const { t } = useTranslation();

  // Restore dates from sessionStorage or fallback to props
  const [localStart, setLocalStart] = useState<Date | null>(() => {
    const stored = loadFromSessionStorage(sessionStorageId, 'start');
    return stored ? new Date(stored) : startDate;
  });

  const [localEnd, setLocalEnd] = useState<Date | null>(() => {
    const stored = loadFromSessionStorage(sessionStorageId, 'end');
    return stored ? getEndOfDay(new Date(stored)) : (endDate ? getEndOfDay(endDate) : null);
  });

  useEffect(() => {
    onChange(localStart, localEnd);
  }, [localStart, localEnd, onChange]);

  function getEndOfDay(date: Date): Date {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  return (
    <StyledDiv>
      <DateInput
        id='start'
        date={localStart}
        onDateChange={(date) => {
          if (!date) {
            setLocalStart(null);
            saveToSessionStorage(sessionStorageId, 'start', null);
            return;
          }
          setLocalStart(date);
          saveToSessionStorage(sessionStorageId, 'start', date.toISOString());

          if (localEnd && localEnd < date) {
            const corrected = getEndOfDay(date);
            setLocalEnd(corrected);
            saveToSessionStorage(sessionStorageId, 'end', corrected.toISOString());
          }
        }}
        label={t("Dates of receipt")}
      />

      <StyledIcon icon="arrow-right" />

      <DateInput
        id='end'
        date={localEnd}
        onDateChange={(date) => {
          if (!date) {
            setLocalEnd(null);
            saveToSessionStorage(sessionStorageId, 'end', null);
            return;
          }

          const normalizedEnd = getEndOfDay(date);

          if (localStart && normalizedEnd < localStart) {
            const corrected = getEndOfDay(localStart);
            setLocalEnd(corrected);
            saveToSessionStorage(sessionStorageId, 'end', corrected.toISOString());
          } else {
            setLocalEnd(normalizedEnd);
            saveToSessionStorage(sessionStorageId, 'end', normalizedEnd.toISOString());
          }
        }}
      />
    </StyledDiv>
  );
};

const StyledDiv = styled.div``;

const StyledIcon = styled(Icon)`
  margin: 0 10px;
`;

export default DaysRangePicker;
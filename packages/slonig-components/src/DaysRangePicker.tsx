import React, { useState, useEffect } from "react";
import { styled, Icon } from "@polkadot/react-components";
import { DateInput } from "@slonigiraf/app-slonig-components";
import { useTranslation } from "./translate.js";

interface DaysRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  startDateId: string;
  endDateId: string;
}

const DaysRangePicker: React.FC<DaysRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  startDateId,
  endDateId,
}) => {
  const { t } = useTranslation();
  const [localStart, setLocalStart] = useState<Date | null>(startDate);
  const [localEnd, setLocalEnd] = useState<Date | null>(
    endDate ? getEndOfDay(endDate) : null
  );

  useEffect(() => {
    onChange(localStart, localEnd);
  }, [localStart, localEnd, onChange]);

  // Utility: end-of-day for a given date
  function getEndOfDay(date: Date): Date {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  return (
    <StyledDiv>
      <DateInput
        date={localStart}
        onDateChange={(date) => {
          if (!date) {
            setLocalStart(null);
            return;
          }
          setLocalStart(date);

          // adjust end if it's before the new start
          if (localEnd && localEnd < date) {
            setLocalEnd(getEndOfDay(date));
          }
        }}
        id={startDateId}
        sessionStorageId={startDateId}
        label={t("Dates of receipt")}
      />

      <StyledIcon icon="arrow-right" />

      <DateInput
        date={localEnd}
        onDateChange={(date) => {
          if (!date) {
            setLocalEnd(null);
            return;
          }

          const normalizedEnd = getEndOfDay(date);

          if (localStart && normalizedEnd < localStart) {
            // fallback: snap to end of startDate
            setLocalEnd(getEndOfDay(localStart));
          } else {
            setLocalEnd(normalizedEnd);
          }
        }}
        id={endDateId}
        sessionStorageId={endDateId}
      />
    </StyledDiv>
  );
};

const StyledDiv = styled.div``;

const StyledIcon = styled(Icon)`
  margin: 0 10px;
`;

export default DaysRangePicker;
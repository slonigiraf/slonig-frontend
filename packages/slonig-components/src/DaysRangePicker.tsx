import React from "react";
import { styled, Icon } from "@polkadot/react-components";
import { DateInput } from "@slonigiraf/app-slonig-components";
import { useTranslation } from "./translate.js";

interface DaysRangePickerProps {
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
}

const DaysRangePicker: React.FC<DaysRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
}) => {
  const { t } = useTranslation();

  function getStartOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function getEndOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  return (
    <StyledDiv>
      <DateInput
        id='start'
        date={startDate}
        onDateChange={(selectedStartDate) => {
          if (selectedStartDate) {
            if (selectedStartDate > endDate) {
              onChange(getStartOfDay(selectedStartDate), getEndOfDay(selectedStartDate));
            } else {
              onChange(getStartOfDay(selectedStartDate), endDate);
            }
          }
        }}
        label={t("Dates of receipt")}
      />

      <StyledIcon icon="arrow-right" />

      <DateInput
        id='end'
        date={endDate}
        onDateChange={(selectedEndDate) => {
          if (selectedEndDate) {
            if (startDate > selectedEndDate) {
              onChange(getStartOfDay(selectedEndDate), getEndOfDay(selectedEndDate));
            } else {
              onChange(startDate, getEndOfDay(selectedEndDate));
            }
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
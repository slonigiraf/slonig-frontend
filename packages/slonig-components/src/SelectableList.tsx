import React, { useState, useCallback, useEffect } from 'react';
import { Button, styled, Table } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

interface SelectableListProps<T> {
  items: T[];
  renderItem: (
    item: T,
    isSelected: boolean,
    isSelectionAllowed: boolean,
    onToggleSelection: (item: T) => void,
  ) => React.ReactNode;
  onSelectionChange: (selectedItems: T[]) => void;
  onItemsUpdate?: (selectedItems: T[]) => void;
  maxSelectableItems?: number;
  isSelectionAllowed?: boolean;
  className?: string;
  additionalControls?: React.ReactNode;
  keyExtractor: (item: T) => string;
  filterOutSelection: (item: T) => boolean;
  header?: ([React.ReactNode?, string?, number?, (() => void)?] | false | null | undefined)[];
  allSelected?: boolean;
}

function SelectableList<T>({
  items,
  renderItem,
  onSelectionChange,
  maxSelectableItems = Infinity,
  isSelectionAllowed = true,
  className = '',
  additionalControls,
  keyExtractor,
  filterOutSelection = () => false,
  header,
  allSelected=false
}: SelectableListProps<T>): React.ReactElement {
  const { t } = useTranslation();
  const [selectedItems, setSelectedItems] = useState<T[]>([]);

  useEffect(() => {
    onSelectionChange(selectedItems);
  }, [selectedItems, onSelectionChange]);

  const toggleItemSelection = (item: T) => {
    setSelectedItems((prevSelected) => {
      const isSelected = prevSelected.some((i) => keyExtractor(i) === keyExtractor(item));
      let newSelected;

      if (isSelected) {
        newSelected = prevSelected.filter((i) => keyExtractor(i) !== keyExtractor(item));
      } else if (prevSelected.length < maxSelectableItems) {
        newSelected = [...prevSelected, item];
      } else {
        return prevSelected;
      }

      return newSelected;
    });
  };

  const selectAll = useCallback(() => {
    const allSelectable = items
      .filter(item => !filterOutSelection(item))
      .slice(0, maxSelectableItems);
    setSelectedItems(allSelectable);
  }, [items, maxSelectableItems, filterOutSelection]);

  const deselectAll = useCallback(() => {
    setSelectedItems([]);
  }, []);

  useEffect(() => {
    selectAll();
  }, [allSelected, items]);

  return (
    <div className={className}>
      {isSelectionAllowed && (
        <div className="ui--row">
          {selectedItems.length === 0 ? (
            <Button icon="square" label={t('Select all')} onClick={selectAll} />
          ) : (
            <Button icon="check" label={t('Deselect all')} onClick={deselectAll} />
          )}
          {additionalControls}
        </div>
      )}
      <Table
        empty={t('No items available')}
        header={header}
      >
        {items.map((item) => (
          <tr key={keyExtractor(item)+isSelectionAllowed}>
            <StyledTd>
              {renderItem(
                item,
                selectedItems.some((selectedItem) => keyExtractor(selectedItem) === keyExtractor(item)),
                isSelectionAllowed,
                toggleItemSelection
              )}
            </StyledTd>
          </tr>
        ))}
      </Table>
    </div>
  );
}

// Wrap with React.memo and preserve the generic type parameter
const MemorizedSelectableList = React.memo(
  SelectableList
) as <T>(props: SelectableListProps<T>) => React.ReactElement;

const StyledTd = styled.td`
  padding: 7px !important;
`;

export default MemorizedSelectableList;
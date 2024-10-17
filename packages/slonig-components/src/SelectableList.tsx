import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

interface SelectableListProps<T> {
  items: T[];
  renderItem: (
    item: T,
    isSelected: boolean,
    onToggleSelection: (item: T) => void
  ) => React.ReactNode;
  onSelectionChange: (selectedItems: T[]) => void;
  maxSelectableItems?: number;
  selectionButtons?: boolean;
  className?: string;
  additionalControls?: React.ReactNode;
  keyExtractor: (item: T, index: number) => string | number;
}

function SelectableList<T>({
  items,
  renderItem,
  onSelectionChange,
  maxSelectableItems = Infinity,
  selectionButtons = true,
  className = '',
  additionalControls,
  keyExtractor,
}: SelectableListProps<T>): React.ReactElement {
  const { t } = useTranslation();
  const [selectedItems, setSelectedItems] = useState<T[]>([]);

  useEffect(() => {
    onSelectionChange(selectedItems);
  }, [selectedItems, onSelectionChange]);

  const toggleItemSelection = (item: T) => {
    setSelectedItems((prevSelected) => {
      const isSelected = prevSelected.includes(item);
      let newSelected;

      if (isSelected) {
        newSelected = prevSelected.filter((i) => i !== item);
      } else if (prevSelected.length < maxSelectableItems) {
        newSelected = [...prevSelected, item];
      } else {
        // Optionally show info or warning if needed
        return prevSelected;
      }

      return newSelected;
    });
  };

  const selectAll = useCallback(() => {
    const allSelectable = items.slice(0, maxSelectableItems);
    setSelectedItems(allSelectable);
  }, [items, maxSelectableItems]);

  const deselectAll = useCallback(() => {
    setSelectedItems([]);
  }, []);

  return (
    <div className={className}>
      {selectionButtons && (
        <div className="ui--row">
          {selectedItems.length === 0 ? (
            <Button icon="square" label={t('Select all')} onClick={selectAll} />
          ) : (
            <Button icon="check" label={t('Deselect all')} onClick={deselectAll} />
          )}
          {additionalControls}
        </div>
      )}
      {items.map((item, index) => (
        <div key={keyExtractor(item, index)} className="ui--row">
          {renderItem(item, selectedItems.includes(item), toggleItemSelection)}
        </div>
      ))}
    </div>
  );
}

// Wrap with React.memo and preserve the generic type parameter
const MemoizedSelectableList = React.memo(
  SelectableList
) as <T>(props: SelectableListProps<T>) => React.ReactElement;

export default MemoizedSelectableList;
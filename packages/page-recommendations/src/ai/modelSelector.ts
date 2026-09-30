import React from 'react';

export type ModelSelectorRenderer = (value: string, onChange: (value: string) => void) => React.ReactNode;

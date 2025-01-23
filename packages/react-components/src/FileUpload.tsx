import React, { useRef, FC } from 'react';

interface FileUploadProps {
  accept: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
}

const FileUpload: FC<FileUploadProps> = ({ onChange, accept, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = (): void => {
    fileInputRef.current?.click(); // Trigger the hidden file input
  };

  return (
    <div>
      {/* Hidden input */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={onChange}
        accept={accept}
        disabled={disabled}
      />

      {/* Custom button */}
      <button type="button" onClick={handleClick}>
        Upload File
      </button>
    </div>
  );
};

export default FileUpload;

import React, { ChangeEvent, DragEvent, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { ACCEPTED_FILE_EXTENSIONS } from '../constants';

interface FileUploadAreaProps {
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  multiple?: boolean;
}

const FileUploadArea: React.FC<FileUploadAreaProps> = ({ onChange, disabled, multiple }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
     if (!disabled) setIsDragging(true); 
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const syntheticEvent = {
        target: { files: e.dataTransfer.files }
      } as unknown as ChangeEvent<HTMLInputElement>;
      onChange(syntheticEvent);
      e.dataTransfer.clearData();
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <label
        htmlFor="file-upload"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`w-full flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out
          ${disabled ? 'bg-neutral-700 border-neutral-600 cursor-not-allowed' : 
            isDragging ? 'border-primary bg-neutral-700' : 'border-neutral-600 hover:border-neutral-500 bg-neutral-700/50 hover:bg-neutral-700'
          }`}
      >
        <UploadCloud size={48} className={`mb-3 ${isDragging ? 'text-primary' : 'text-neutral-500'}`} />
        <p className={`text-lg font-medium ${isDragging ? 'text-primary-light' : 'text-neutral-300'}`}>
          Drag & Drop your file(s) here
        </p>
        <p className="text-sm text-neutral-400">or click to browse</p>
        <p className="text-xs text-neutral-500 mt-1">(Max file size: ~5MB per file recommended)</p>
        <input
          id="file-upload"
          type="file"
          className="hidden"
          onChange={onChange}
          accept={ACCEPTED_FILE_EXTENSIONS}
          disabled={disabled}
          multiple={multiple}
        />
      </label>
    </div>
  );
};

export default FileUploadArea;

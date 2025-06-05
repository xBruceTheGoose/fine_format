import React from 'react';
import { Download } from 'lucide-react';

interface DownloadButtonsProps {
  onDownload: (format: 'csv' | 'jsonl' | 'json') => void;
  disabled?: boolean;
}

const DownloadButtons: React.FC<DownloadButtonsProps> = ({ onDownload, disabled }) => {
  return (
    <div className="space-y-3 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-4">
      <button
        onClick={() => onDownload('csv')}
        disabled={disabled}
        className="w-full sm:w-auto flex items-center justify-center bg-secondary hover:bg-gray-700 text-white font-medium py-2.5 px-6 rounded-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download size={18} className="mr-2" />
        Download CSV
      </button>
      <button
        onClick={() => onDownload('jsonl')}
        disabled={disabled}
        className="w-full sm:w-auto flex items-center justify-center bg-secondary hover:bg-gray-700 text-white font-medium py-2.5 px-6 rounded-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download size={18} className="mr-2" />
        Download JSONL
      </button>
      <button
        onClick={() => onDownload('json')}
        disabled={disabled}
        className="w-full sm:w-auto flex items-center justify-center bg-secondary hover:bg-gray-700 text-white font-medium py-2.5 px-6 rounded-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download size={18} className="mr-2" />
        Download JSON
      </button>
    </div>
  );
};

export default DownloadButtons;

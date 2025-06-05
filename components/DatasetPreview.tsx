
import React from 'react';
import { QAPair } from '../types';
import { MessageSquare, Bot } from 'lucide-react';

interface DatasetPreviewProps {
  qaPairs: QAPair[];
}

const DatasetPreview: React.FC<DatasetPreviewProps> = ({ qaPairs }) => {
  if (!qaPairs || qaPairs.length === 0) {
    return <p className="text-neutral-400">No Q&A pairs generated yet, or the source was too short.</p>;
  }

  const previewPairs = qaPairs.slice(0, 3); // Show first 3 pairs as preview

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold text-primary-light">Generated Q&A Preview ({qaPairs.length} pairs total):</h3>
      <div className="space-y-4 max-h-96 overflow-y-auto bg-neutral-700 p-4 rounded-lg shadow">
        {previewPairs.map((pair, index) => (
          <div key={index} className="p-4 bg-neutral-800 rounded-md shadow-sm">
            <div className="flex items-start mb-2">
              <MessageSquare size={20} className="text-primary-light mr-2 mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-neutral-200">User Question:</p>
                <p className="text-neutral-300 text-sm">{pair.user}</p>
              </div>
            </div>
            <div className="flex items-start">
              <Bot size={20} className="text-accent mr-2 mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-neutral-200">Model Answer:</p>
                <p className="text-neutral-300 text-sm">{pair.model}</p>
              </div>
            </div>
          </div>
        ))}
        {qaPairs.length > 3 && (
          <p className="text-center text-neutral-400 text-sm mt-4">...and {qaPairs.length - 3} more pairs.</p>
        )}
      </div>
    </div>
  );
};

export default DatasetPreview;

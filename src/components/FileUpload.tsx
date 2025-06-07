import React, { useState, useCallback } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import { FileData } from '../types';
import { FileService } from '../services/fileService';
import { ACCEPTED_FILE_EXTENSIONS } from '../constants';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';

interface FileUploadProps {
  files: FileData[];
  onFilesChange: (files: FileData[]) => void;
  disabled?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  files,
  onFilesChange,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = useCallback(async (selectedFiles: FileList) => {
    if (disabled || selectedFiles.length === 0) return;

    const newFiles = await FileService.processFiles(selectedFiles);
    const updatedFiles = [...files, ...newFiles];
    
    // Remove duplicates based on name and last modified
    const uniqueFiles = updatedFiles.filter((file, index, self) =>
      index === self.findIndex(f => 
        f.file.name === file.file.name && 
        f.file.lastModified === file.file.lastModified
      )
    );

    onFilesChange(uniqueFiles);
  }, [files, onFilesChange, disabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = useCallback((fileId: string) => {
    onFilesChange(files.filter(f => f.id !== fileId));
  }, [files, onFilesChange]);

  const getStatusColor = (status: FileData['status']) => {
    switch (status) {
      case 'read': return 'text-blue-400';
      case 'cleaned': return 'text-green-400';
      case 'failed': return 'text-red-400';
      case 'cleaning': case 'reading': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = (status: FileData['status']) => {
    switch (status) {
      case 'read': return 'Ready';
      case 'cleaned': return 'Processed';
      case 'failed': return 'Failed';
      case 'cleaning': return 'Processing...';
      case 'reading': return 'Reading...';
      default: return 'Pending';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-0">
          <label
            htmlFor="file-upload"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              block w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200
              ${disabled 
                ? 'border-gray-600 bg-gray-700/50 cursor-not-allowed' 
                : isDragging 
                  ? 'border-primary bg-primary/10' 
                  : 'border-gray-600 hover:border-gray-500 bg-gray-700/30 hover:bg-gray-700/50'
              }
            `}
          >
            <div className="flex flex-col items-center justify-center space-y-3">
              <UploadCloud 
                size={48} 
                className={isDragging ? 'text-primary' : 'text-gray-400'} 
              />
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2">
                  <p className={`text-lg font-medium ${isDragging ? 'text-primary' : 'text-gray-300'}`}>
                    Drop files here or click to browse
                  </p>
                  <Tooltip content="Upload documents, PDFs, text files, or web pages. Supported formats: .txt, .md, .html, .jsonl, .pdf, .docx. Maximum file size: 5MB per file." />
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Supports: .txt, .md, .html, .jsonl, .pdf, .docx
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Maximum file size: 5MB
                </p>
              </div>
            </div>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              accept={ACCEPTED_FILE_EXTENSIONS}
              multiple
              disabled={disabled}
              onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
            />
          </label>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardContent>
            <h3 className="text-lg font-semibold text-gray-300 mb-4">
              Selected Files ({files.length})
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {files.map((fileData) => (
                <div
                  key={fileData.id}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border
                    ${fileData.status === 'failed' 
                      ? 'bg-red-900/20 border-red-700' 
                      : fileData.status === 'cleaned'
                        ? 'bg-green-900/20 border-green-700'
                        : 'bg-gray-700/50 border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <FileText size={20} className="text-primary flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-300 truncate">
                        {fileData.file.name}
                      </p>
                      <div className="flex items-center space-x-2 text-xs text-gray-400">
                        <span>{fileData.mimeType}</span>
                        <span>•</span>
                        <span className={getStatusColor(fileData.status)}>
                          {getStatusText(fileData.status)}
                        </span>
                      </div>
                      {fileData.error && (
                        <p className="text-xs text-red-400 mt-1">{fileData.error}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeFile(fileData.id)}
                    className="ml-2 p-1 border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-400"
                  >
                    <X size={16} />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
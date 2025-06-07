import React, { useState, useCallback } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import { FileData } from '../types';
import { FileService } from '../services/fileService';
import { ACCEPTED_FILE_EXTENSIONS } from '../constants';
import { Card, CardContent, CardHeader } from './ui/Card';
import { Button } from './ui/Button';

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
      case 'read': return 'status-correct';
      case 'cleaned': return 'status-correct';
      case 'failed': return 'status-incorrect';
      case 'cleaning': case 'reading': return 'status-processing';
      default: return 'text-muted';
    }
  };

  const getStatusText = (status: FileData['status']) => {
    switch (status) {
      case 'read': return 'READY';
      case 'cleaned': return 'PROCESSED';
      case 'failed': return 'FAILED';
      case 'cleaning': return 'PROCESSING...';
      case 'reading': return 'READING...';
      default: return 'PENDING';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-xl font-bold text-primary font-mono tracking-wide">
            UPLOAD FILES
          </h3>
        </CardHeader>
        <CardContent className="p-0">
          <label
            htmlFor="file-upload"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              block w-full p-10 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-300 relative overflow-hidden
              ${disabled 
                ? 'border-border bg-surface/30 cursor-not-allowed opacity-50' 
                : isDragging 
                  ? 'border-primary bg-primary/10 shadow-cyber' 
                  : 'border-border hover:border-primary/50 bg-surface/20 hover:bg-surface/40'
              }
            `}
            style={{
              background: isDragging 
                ? 'linear-gradient(135deg, rgba(0, 255, 65, 0.08), rgba(0, 255, 65, 0.04))'
                : 'linear-gradient(135deg, rgba(26, 26, 26, 0.3), rgba(26, 26, 26, 0.1))'
            }}
          >
            <div className="flex flex-col items-center justify-center space-y-4">
              <UploadCloud 
                size={64} 
                className={`${isDragging ? 'text-primary animate-bounce' : 'text-accent'} transition-all duration-300`}
                style={{
                  filter: `drop-shadow(0 0 5px ${isDragging ? '#00FF41' : '#00FFFF'})`
                }}
              />
              <div className="text-center">
                <p className={`text-xl font-bold font-mono tracking-wide ${isDragging ? 'neon-text' : 'text-foreground'}`}>
                  {isDragging ? 'DROP FILES HERE' : 'DROP FILES OR CLICK TO BROWSE'}
                </p>
                <p className="text-accent font-semibold mt-2 font-mono">
                  SUPPORTS: .txt, .md, .html, .jsonl, .pdf, .docx
                </p>
                <p className="text-warning text-sm mt-1 font-mono font-bold">
                  MAXIMUM FILE SIZE: 5MB PER FILE
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
            <h3 className="text-xl font-bold text-primary mb-6 font-mono tracking-wide">
              SELECTED FILES ({files.length})
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {files.map((fileData) => (
                <div
                  key={fileData.id}
                  className={`
                    flex items-center justify-between p-4 rounded-lg border transition-all duration-300
                    ${fileData.status === 'failed' 
                      ? 'cyber-alert-error border-error' 
                      : fileData.status === 'cleaned' || fileData.status === 'read'
                        ? 'cyber-alert-success border-success'
                        : 'bg-surface/50 border-border hover:border-primary/50'
                    }
                  `}
                >
                  <div className="flex items-center space-x-4 flex-1 min-w-0">
                    <FileText 
                      size={24} 
                      className="text-accent flex-shrink-0" 
                      style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground font-semibold truncate font-mono">
                        {fileData.file.name}
                      </p>
                      <div className="flex items-center space-x-3 text-sm mt-1">
                        <span className="text-muted font-mono">{fileData.mimeType}</span>
                        <span className="text-border">•</span>
                        <span className={`${getStatusColor(fileData.status)} font-bold font-mono tracking-wide`}>
                          {getStatusText(fileData.status)}
                        </span>
                      </div>
                      {fileData.error && (
                        <p className="text-error text-sm mt-1 font-mono">{fileData.error}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeFile(fileData.id)}
                    className="ml-4 p-2 border-error text-error hover:bg-error hover:text-background"
                  >
                    <X size={18} />
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
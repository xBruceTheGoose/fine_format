import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Settings } from 'lucide-react';
import { buildshipService } from '../services/buildshipService';
import { Card, CardContent, CardHeader } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';

export const BuildShipStatus: React.FC = () => {
  const [status, setStatus] = useState(buildshipService.getStatus());
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<boolean | null>(null);

  useEffect(() => {
    // Update status when component mounts
    setStatus(buildshipService.getStatus());
  }, []);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);

    try {
      const result = await buildshipService.testConnection();
      setConnectionTestResult(result);
    } catch (error) {
      console.error('Connection test failed:', error);
      setConnectionTestResult(false);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const getStatusIcon = () => {
    if (!status.hasApiKey) {
      return <XCircle size={20} className="text-error" style={{ filter: 'drop-shadow(0 0 3px #dc1aff)' }} />;
    }
    
    if (connectionTestResult === true) {
      return <CheckCircle size={20} className="text-success" style={{ filter: 'drop-shadow(0 0 3px #00FF41)' }} />;
    }
    
    if (connectionTestResult === false) {
      return <XCircle size={20} className="text-error" style={{ filter: 'drop-shadow(0 0 3px #dc1aff)' }} />;
    }
    
    if (status.ready) {
      return <AlertCircle size={20} className="text-warning" style={{ filter: 'drop-shadow(0 0 3px #FFFF00)' }} />;
    }
    
    return <XCircle size={20} className="text-error" style={{ filter: 'drop-shadow(0 0 3px #dc1aff)' }} />;
  };

  const getStatusText = () => {
    if (!status.hasApiKey) {
      return 'API Key Missing';
    }
    
    if (connectionTestResult === true) {
      return 'Connected & Ready';
    }
    
    if (connectionTestResult === false) {
      return 'Connection Failed';
    }
    
    if (status.ready) {
      return 'Ready (Untested)';
    }
    
    return 'Not Configured';
  };

  const getStatusColor = () => {
    if (!status.hasApiKey) return 'text-error';
    if (connectionTestResult === true) return 'text-success';
    if (connectionTestResult === false) return 'text-error';
    if (status.ready) return 'text-warning';
    return 'text-error';
  };

  return (
    <Card className="cyber-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Settings size={24} className="text-accent" style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }} />
            <h3 className="text-lg font-bold text-primary font-mono tracking-wide">
              BUILDSHIP PREPROCESSING
            </h3>
            <Tooltip content="BuildShip handles advanced preprocessing of files and URLs, including binary content extraction, text cleaning, and content optimization before passing to Gemini for Q&A generation." />
          </div>
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <span className={`font-bold font-mono text-sm ${getStatusColor()}`}>
              {getStatusText()}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Status Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-mono">
            <div>
              <span className="text-accent font-bold">API Key:</span>
              <span className={`ml-2 ${status.hasApiKey ? 'text-success' : 'text-error'}`}>
                {status.hasApiKey ? 'Configured' : 'Missing'}
              </span>
            </div>
            <div>
              <span className="text-accent font-bold">Service:</span>
              <span className={`ml-2 ${status.ready ? 'text-success' : 'text-error'}`}>
                {status.ready ? 'Ready' : 'Not Ready'}
              </span>
            </div>
          </div>

          {/* Endpoint Information */}
          <div className="p-3 bg-surface/30 rounded-lg border border-border">
            <div className="text-xs font-mono text-muted">
              <span className="text-accent font-bold">Endpoint:</span>
              <br />
              <span className="break-all">{status.endpoint}</span>
            </div>
          </div>

          {/* Test Connection Button */}
          {status.ready && (
            <div className="flex justify-center">
              <Button
                onClick={handleTestConnection}
                loading={isTestingConnection}
                disabled={isTestingConnection}
                variant="outline"
                size="sm"
                className="px-6"
              >
                {isTestingConnection ? 'TESTING...' : 'TEST CONNECTION'}
              </Button>
            </div>
          )}

          {/* Connection Test Result */}
          {connectionTestResult !== null && (
            <div className={`p-3 rounded-lg border ${
              connectionTestResult 
                ? 'cyber-alert-success border-success' 
                : 'cyber-alert-error border-error'
            }`}>
              <div className="flex items-center space-x-2">
                {connectionTestResult ? (
                  <CheckCircle size={16} className="text-success" />
                ) : (
                  <XCircle size={16} className="text-error" />
                )}
                <span className={`font-bold font-mono text-sm ${
                  connectionTestResult ? 'text-success' : 'text-error'
                }`}>
                  {connectionTestResult 
                    ? 'Connection successful! BuildShip preprocessing is ready.' 
                    : 'Connection failed. Please check your API key and endpoint configuration.'
                  }
                </span>
              </div>
            </div>
          )}

          {/* Configuration Instructions */}
          {!status.hasApiKey && (
            <div className="cyber-alert-warning border-warning p-4 rounded-lg">
              <div className="text-warning font-bold font-mono mb-2">
                CONFIGURATION REQUIRED
              </div>
              <div className="text-foreground font-mono text-sm leading-relaxed">
                To enable BuildShip preprocessing:
                <br />
                1. Add <span className="text-accent">VITE_BUILDSHIP_API_KEY</span> to your environment variables
                <br />
                2. Restart the development server
                <br />
                3. Test the connection using the button above
              </div>
            </div>
          )}

          {/* Benefits Information */}
          <div className="cyber-alert-info border-accent p-4 rounded-lg">
            <div className="text-accent font-bold font-mono mb-2">
              BUILDSHIP BENEFITS
            </div>
            <div className="text-foreground font-mono text-sm leading-relaxed">
              • Advanced binary file processing (PDF, DOCX)
              <br />
              • Robust text extraction and cleaning
              <br />
              • Scalable preprocessing pipeline
              <br />
              • Reduced client-side processing load
              <br />
              • Better handling of large files and complex content
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
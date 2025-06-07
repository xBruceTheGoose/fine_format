import React, { useState } from 'react';
import { MessageSquare, Bot, Download, Search, Lightbulb, CheckCircle, XCircle, Target, TrendingUp, ChevronDown, FileText, Brain, Zap } from 'lucide-react';
import { QAPair, GroundingMetadata, FineTuningMethod, KnowledgeGap } from '../types';
import { Card, CardHeader, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Tooltip } from './ui/Tooltip';
import { DownloadService } from '../services/downloadService';
import { GuideService } from '../services/guideService';
import { FINE_TUNING_METHODS } from '../constants';

interface DatasetPreviewProps {
  qaPairs: QAPair[];
  sourceFileCount: number;
  sourceUrlCount: number;
  identifiedThemes: string[];
  correctAnswerCount: number;
  incorrectAnswerCount: number;
  isAugmented?: boolean;
  groundingMetadata?: GroundingMetadata;
  syntheticPairCount?: number;
  validatedPairCount?: number;
  identifiedGaps?: KnowledgeGap[];
  gapFillingEnabled?: boolean;
}

export const DatasetPreview: React.FC<DatasetPreviewProps> = ({
  qaPairs,
  sourceFileCount,
  sourceUrlCount,
  identifiedThemes,
  correctAnswerCount,
  incorrectAnswerCount,
  isAugmented = false,
  groundingMetadata,
  syntheticPairCount = 0,
  validatedPairCount = 0,
  identifiedGaps = [],
  gapFillingEnabled = false,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<FineTuningMethod>('generic');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedConfig = FINE_TUNING_METHODS.find(m => m.id === selectedMethod);

  const generateFilename = (format: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const augmentedSuffix = isAugmented ? '_augmented' : '';
    const gapFilledSuffix = syntheticPairCount > 0 ? '_gapfilled' : '';
    const totalSources = sourceFileCount + sourceUrlCount;
    const methodSuffix = selectedMethod !== 'generic' ? `_${selectedMethod}` : '';
    return `fine_format_${totalSources}_sources_${qaPairs.length}pairs${augmentedSuffix}${gapFilledSuffix}${methodSuffix}_${timestamp}.${format}`;
  };

  const handleDownload = (format: string) => {
    const filename = generateFilename(format);
    
    switch (format) {
      case 'csv':
        DownloadService.downloadAsCSV(qaPairs, filename, selectedMethod);
        break;
      case 'jsonl':
        DownloadService.downloadAsJSONL(qaPairs, filename, selectedMethod);
        break;
      case 'json':
        DownloadService.downloadAsJSON(qaPairs, filename, selectedMethod);
        break;
    }
  };

  const handleDownloadGuide = () => {
    const totalSources = sourceFileCount + sourceUrlCount;
    GuideService.downloadGuide(selectedMethod, qaPairs, totalSources, identifiedThemes);
  };

  if (qaPairs.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-muted text-center py-8 font-mono">
            No Q&A pairs generated. The content might be too short or not suitable for Q&A generation.
          </p>
        </CardContent>
      </Card>
    );
  }

  const previewPairs = qaPairs.slice(0, 4);
  const webSources = groundingMetadata?.groundingChunks?.filter(chunk => chunk.web?.uri) || [];
  const totalSources = sourceFileCount + sourceUrlCount;
  const originalPairCount = qaPairs.filter(pair => pair.source === 'original' || !pair.source).length;

  return (
    <div className="space-y-8">
      {/* Dataset Overview */}
      <Card>
        <CardHeader>
          <h3 className="text-2xl font-bold text-primary flex items-center font-mono tracking-wide">
            <Lightbulb size={28} className="mr-3 text-accent" style={{ filter: 'drop-shadow(0 0 5px #00FFFF)' }} />
            GENERATED DATASET OVERVIEW
          </h3>
          <p className="text-foreground font-mono mt-2">
            <span className="neon-text">{qaPairs.length} Q&A PAIRS</span> from{' '}
            <span className="text-accent">{totalSources} source{totalSources !== 1 ? 's' : ''}</span>
            {sourceFileCount > 0 && ` (${sourceFileCount} file${sourceFileCount !== 1 ? 's' : ''})`}
            {sourceUrlCount > 0 && ` (${sourceUrlCount} URL${sourceUrlCount !== 1 ? 's' : ''})`}
            <div className="flex items-center space-x-4 mt-3">
              {isAugmented && (
                <span className="inline-flex items-center px-3 py-1 bg-accent/20 text-accent rounded-full text-sm font-bold border border-accent/30">
                  <Search size={14} className="mr-2" />
                  WEB ENHANCED
                </span>
              )}
              {gapFillingEnabled && syntheticPairCount > 0 && (
                <span className="inline-flex items-center px-3 py-1 bg-secondary/20 text-secondary rounded-full text-sm font-bold border border-secondary/30">
                  <Brain size={14} className="mr-2" />
                  GAP FILLED
                </span>
              )}
            </div>
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="cyber-alert-success border-success rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-success font-bold text-2xl font-mono">{correctAnswerCount}</p>
                  <p className="text-success font-semibold font-mono tracking-wide">CORRECT ANSWERS</p>
                </div>
                <CheckCircle size={32} className="text-success" style={{ filter: 'drop-shadow(0 0 5px #00FF41)' }} />
              </div>
            </div>
            <div className="cyber-alert-warning border-warning rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-warning font-bold text-2xl font-mono">{incorrectAnswerCount}</p>
                  <p className="text-warning font-semibold font-mono tracking-wide">INCORRECT ANSWERS</p>
                </div>
                <XCircle size={32} className="text-warning" style={{ filter: 'drop-shadow(0 0 5px #FFFF00)' }} />
              </div>
            </div>
            <div className="cyber-alert-info border-accent rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-accent font-bold text-2xl font-mono">{identifiedThemes.length}</p>
                  <p className="text-accent font-semibold font-mono tracking-wide">KEY THEMES</p>
                </div>
                <Target size={32} className="text-accent" style={{ filter: 'drop-shadow(0 0 5px #00FFFF)' }} />
              </div>
            </div>
            {syntheticPairCount > 0 && (
              <div className="cyber-alert-info border-secondary rounded-lg p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-secondary font-bold text-2xl font-mono">{validatedPairCount}</p>
                    <p className="text-secondary font-semibold font-mono tracking-wide">SYNTHETIC PAIRS</p>
                  </div>
                  <Zap size={32} className="text-secondary" style={{ filter: 'drop-shadow(0 0 5px #FF0080)' }} />
                </div>
              </div>
            )}
          </div>

          {/* Dataset Composition */}
          {syntheticPairCount > 0 && (
            <div className="mb-8 p-4 bg-surface/30 rounded-lg border border-border">
              <h4 className="text-lg font-bold text-primary mb-3 flex items-center font-mono tracking-wide">
                <Brain size={20} className="mr-3 text-secondary" style={{ filter: 'drop-shadow(0 0 3px #FF0080)' }} />
                DATASET COMPOSITION
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm font-mono">
                <div>
                  <span className="text-primary font-bold">Original Q&A:</span>
                  <span className="text-foreground ml-2">{originalPairCount} pairs</span>
                </div>
                <div>
                  <span className="text-secondary font-bold">Synthetic Generated:</span>
                  <span className="text-foreground ml-2">{syntheticPairCount} pairs</span>
                </div>
                <div>
                  <span className="text-success font-bold">Cross-Validated:</span>
                  <span className="text-foreground ml-2">{validatedPairCount} pairs included</span>
                </div>
              </div>
            </div>
          )}

          {/* Knowledge Gaps Addressed */}
          {identifiedGaps.length > 0 && (
            <div className="mb-8">
              <h4 className="text-xl font-bold text-primary mb-4 flex items-center font-mono tracking-wide">
                <Brain size={24} className="mr-3 text-secondary" style={{ filter: 'drop-shadow(0 0 3px #FF0080)' }} />
                KNOWLEDGE GAPS ADDRESSED ({identifiedGaps.length})
              </h4>
              <div className="space-y-3">
                {identifiedGaps.map((gap, index) => (
                  <div
                    key={gap.id}
                    className="p-4 bg-surface/50 rounded-lg border border-border"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 0, 128, 0.05), rgba(255, 0, 128, 0.02))'
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-bold font-mono ${
                            gap.priority === 'high' ? 'bg-error/20 text-error' :
                            gap.priority === 'medium' ? 'bg-warning/20 text-warning' :
                            'bg-accent/20 text-accent'
                          }`}>
                            {gap.priority.toUpperCase()}
                          </span>
                          <span className="text-accent font-semibold font-mono">{gap.theme}</span>
                        </div>
                        <p className="text-foreground font-mono text-sm leading-relaxed">{gap.description}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {gap.suggestedQuestionTypes.map((type, i) => (
                            <span
                              key={i}
                              className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-mono"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Identified Themes */}
          {identifiedThemes.length > 0 && (
            <div className="mb-8">
              <h4 className="text-xl font-bold text-primary mb-4 flex items-center font-mono tracking-wide">
                <TrendingUp size={24} className="mr-3 text-accent" style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }} />
                IDENTIFIED THEMES
              </h4>
              <div className="flex flex-wrap gap-3">
                {identifiedThemes.map((theme, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 bg-primary/10 text-primary border border-primary/30 rounded-full font-semibold font-mono tracking-wide"
                    style={{
                      background: 'linear-gradient(135deg, rgba(0, 255, 65, 0.08), rgba(0, 255, 65, 0.04))',
                      boxShadow: '0 0 5px rgba(0, 255, 65, 0.2)'
                    }}
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Sample Q&A Pairs */}
          <div className="space-y-6">
            <h4 className="text-xl font-bold text-primary font-mono tracking-wide">SAMPLE Q&A PAIRS</h4>
            {previewPairs.map((pair, index) => (
              <div key={index} className={`p-5 rounded-lg border transition-all duration-300 ${
                pair.isCorrect 
                  ? 'cyber-alert-success border-success' 
                  : 'cyber-alert-warning border-warning'
              }`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start flex-1">
                    <MessageSquare size={24} className="text-accent mr-3 mt-1 flex-shrink-0" style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }} />
                    <div className="flex-1">
                      <p className="font-bold text-foreground font-mono tracking-wide">QUESTION:</p>
                      <p className="text-foreground font-mono mt-2 leading-relaxed">{pair.user}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 ml-6">
                    {pair.source === 'synthetic' && (
                      <span className="text-xs px-2 py-1 bg-secondary/20 text-secondary rounded font-bold font-mono border border-secondary/30">
                        SYNTHETIC
                      </span>
                    )}
                    {pair.isCorrect ? (
                      <CheckCircle size={20} className="text-success" style={{ filter: 'drop-shadow(0 0 3px #00FF41)' }} />
                    ) : (
                      <XCircle size={20} className="text-warning" style={{ filter: 'drop-shadow(0 0 3px #FFFF00)' }} />
                    )}
                    <span className={`text-sm px-3 py-1 rounded-full font-bold font-mono tracking-wide ${
                      pair.isCorrect 
                        ? 'bg-success/20 text-success border border-success/30' 
                        : 'bg-warning/20 text-warning border border-warning/30'
                    }`}>
                      {pair.isCorrect ? 'CORRECT' : 'INCORRECT'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start">
                  <Bot size={24} className="text-secondary mr-3 mt-1 flex-shrink-0" style={{ filter: 'drop-shadow(0 0 3px #FF0080)' }} />
                  <div>
                    <p className="font-bold text-foreground font-mono tracking-wide">ANSWER:</p>
                    <p className="text-foreground font-mono mt-2 leading-relaxed">{pair.model}</p>
                    {pair.confidence && (
                      <p className="text-accent font-bold font-mono mt-2 tracking-wide">
                        CONFIDENCE: {(pair.confidence * 100).toFixed(0)}%
                      </p>
                    )}
                    {pair.validationStatus && pair.source === 'synthetic' && (
                      <p className={`font-bold font-mono mt-2 tracking-wide ${
                        pair.validationStatus === 'validated' ? 'text-success' : 'text-warning'
                      }`}>
                        VALIDATION: {pair.validationStatus.toUpperCase()}
                        {pair.validationConfidence && ` (${(pair.validationConfidence * 100).toFixed(0)}%)`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {qaPairs.length > 4 && (
              <p className="text-center text-accent font-mono font-semibold">
                ...and <span className="neon-text-accent">{qaPairs.length - 4} MORE PAIRS</span> ({correctAnswerCount - previewPairs.filter(p => p.isCorrect).length} correct, {incorrectAnswerCount - previewPairs.filter(p => !p.isCorrect).length} incorrect)
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Web Sources */}
      {webSources.length > 0 && (
        <Card>
          <CardHeader>
            <h4 className="text-xl font-bold text-primary flex items-center font-mono tracking-wide">
              <Search size={24} className="mr-3 text-accent" style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }} />
              WEB SOURCES USED ({webSources.length})
            </h4>
            <p className="text-foreground font-mono mt-2">
              Content was enhanced with information from these web sources
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {webSources.map((chunk, index) => (
                chunk.web && (
                  <a
                    key={index}
                    href={chunk.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-4 bg-surface/50 rounded-lg font-mono text-accent hover:text-primary hover:bg-surface/70 transition-all duration-300 border border-border hover:border-primary/50"
                    style={{
                      background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.5), rgba(26, 26, 26, 0.3))'
                    }}
                  >
                    <div className="font-bold tracking-wide">{chunk.web.title || 'Web Source'}</div>
                    <div className="text-muted text-sm mt-1 truncate">{chunk.web.uri}</div>
                  </a>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Download Options */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <h4 className="text-xl font-bold text-primary flex items-center font-mono tracking-wide">
              <Download size={24} className="mr-3" style={{ filter: 'drop-shadow(0 0 3px #00FF41)' }} />
              DOWNLOAD FINE-TUNING DATASET
            </h4>
            <Tooltip content="Select your fine-tuning platform to get the optimal dataset format. Each platform has specific requirements for data structure, labeling, and file format." />
          </div>
          <p className="text-foreground font-mono mt-2">
            Choose your fine-tuning method for optimized dataset formatting
          </p>
        </CardHeader>
        <CardContent>
          {/* Fine-tuning Method Selector */}
          <div className="mb-8">
            <label className="block text-lg font-bold text-primary mb-3 font-mono tracking-wide">
              FINE-TUNING PLATFORM
            </label>
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-5 py-4 cyber-input text-foreground text-left flex items-center justify-between hover:border-primary/50 focus:border-primary font-mono"
                style={{
                  background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.8), rgba(26, 26, 26, 0.6))'
                }}
              >
                <div>
                  <div className="font-bold text-lg text-primary">{selectedConfig?.name}</div>
                  <div className="text-accent font-semibold mt-1">{selectedConfig?.description}</div>
                </div>
                <ChevronDown size={24} className={`text-accent transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute z-10 w-full mt-2 bg-surface border border-border rounded-lg shadow-lg max-h-80 overflow-y-auto"
                     style={{
                       background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.95), rgba(26, 26, 26, 0.9))',
                       backdropFilter: 'blur(10px)',
                       boxShadow: '0 0 20px rgba(0, 255, 65, 0.1)'
                     }}>
                  {FINE_TUNING_METHODS.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => {
                        setSelectedMethod(method.id);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full px-5 py-4 text-left hover:bg-surface/70 transition-all duration-300 font-mono ${
                        selectedMethod === method.id ? 'bg-primary/10 text-primary border-l-4 border-primary' : 'text-foreground'
                      }`}
                    >
                      <div className="font-bold text-lg">{method.name}</div>
                      <div className="text-accent font-semibold mt-1">{method.description}</div>
                      <div className="text-accent font-bold text-sm mt-2 tracking-wider">
                        FORMATS: {method.formats.join(', ').toUpperCase()}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Download Buttons */}
          <div className="space-y-6">
            <div className="flex flex-wrap gap-4">
              {selectedConfig?.formats.map((format) => (
                <Button
                  key={format}
                  variant="secondary"
                  icon={Download}
                  onClick={() => handleDownload(format)}
                  className="px-6 py-3 font-bold"
                >
                  DOWNLOAD {format.toUpperCase()}
                </Button>
              ))}
            </div>

            {/* Fine-Tuning Guide Download */}
            <div className="border-t border-border pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-lg font-bold text-primary flex items-center font-mono tracking-wide">
                    <FileText size={20} className="mr-3 text-accent" style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }} />
                    FINE-TUNING GUIDE
                  </h5>
                  <p className="text-accent font-semibold mt-1 font-mono">
                    Complete setup instructions and optimal parameters for {selectedConfig?.name}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="md"
                  icon={FileText}
                  onClick={handleDownloadGuide}
                  className="ml-6 px-6 py-3"
                >
                  DOWNLOAD GUIDE
                </Button>
              </div>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-surface/30 rounded-lg border border-border">
            <p className="text-accent font-semibold font-mono leading-relaxed">
              <strong className="text-primary">{selectedConfig?.name} FORMAT:</strong> Each Q&A pair includes correctness labels and confidence scores optimized for {selectedConfig?.name}. 
              {syntheticPairCount > 0 && ` Includes ${validatedPairCount} cross-validated synthetic pairs addressing knowledge gaps.`}
              {' '}Incorrect answers are strategically included to improve model discrimination and reduce hallucination.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
import React, { useState } from 'react';
import { Zap, Search, HelpCircle, FlagTriangleRight, BookOpen, PenTool, Target, Brain, ChevronLeft, ChevronRight } from 'lucide-react';
import { FileData, UrlData, FineTuningGoal } from './types';
import { geminiService } from './services/geminiService';
import { openRouterService } from './services/openRouterService';
import { useDatasetGeneration } from './hooks/useDatasetGeneration';
import { FileUpload } from './components/FileUpload';
import { UrlInput } from './components/UrlInput';
import { ProcessingStatus } from './components/ProcessingStatus';
import { DatasetPreview } from './components/DatasetPreview';
import { Button } from './components/ui/Button';
import { Alert } from './components/ui/Alert';
import { Card, CardContent, CardHeader } from './components/ui/Card';
import { Tooltip } from './components/ui/Tooltip';
import { FINE_TUNING_GOALS } from './constants';

const App: React.FC = () => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [urls, setUrls] = useState<UrlData[]>([]);
  const [enableWebAugmentation, setEnableWebAugmentation] = useState(false);
  const [enableGapFilling, setEnableGapFilling] = useState(true);
  const [fineTuningGoal, setFineTuningGoal] = useState<FineTuningGoal>('knowledge');
  const [currentGoalIndex, setCurrentGoalIndex] = useState(1); // Start with 'knowledge' (index 1)
  
  const {
    processedData,
    isProcessing,
    currentStep,
    progress,
    estimatedTimeRemaining,
    totalEstimatedTime,
    error,
    generateDataset,
    clearError,
  } = useDatasetGeneration();

  const isGeminiReady = geminiService.isReady();
  const isOpenRouterReady = openRouterService.isReady();
  const readyFileCount = files.filter(f => f.status === 'read').length;
  const readyUrlCount = urls.filter(u => u.status === 'fetched').length;
  const totalReadySources = readyFileCount + readyUrlCount;
  const canGenerate = totalReadySources > 0 && isGeminiReady && !isProcessing;

  const handleGenerateDataset = () => {
    if (canGenerate) {
      generateDataset(files, urls, enableWebAugmentation, fineTuningGoal, enableGapFilling);
    }
  };

  const getGoalIcon = (goalId: FineTuningGoal) => {
    switch (goalId) {
      case 'topic': return Target;
      case 'knowledge': return BookOpen;
      case 'style': return PenTool;
      default: return Target;
    }
  };

  const nextGoal = () => {
    const nextIndex = (currentGoalIndex + 1) % FINE_TUNING_GOALS.length;
    setCurrentGoalIndex(nextIndex);
    setFineTuningGoal(FINE_TUNING_GOALS[nextIndex].id);
  };

  const prevGoal = () => {
    const prevIndex = currentGoalIndex === 0 ? FINE_TUNING_GOALS.length - 1 : currentGoalIndex - 1;
    setCurrentGoalIndex(prevIndex);
    setFineTuningGoal(FINE_TUNING_GOALS[prevIndex].id);
  };

  const selectGoal = (goalId: FineTuningGoal) => {
    const index = FINE_TUNING_GOALS.findIndex(g => g.id === goalId);
    setCurrentGoalIndex(index);
    setFineTuningGoal(goalId);
  };

  const currentGoal = FINE_TUNING_GOALS[currentGoalIndex];
  const IconComponent = getGoalIcon(currentGoal.id);

  // Get previous and next goals for carousel display
  const prevGoalIndex = currentGoalIndex === 0 ? FINE_TUNING_GOALS.length - 1 : currentGoalIndex - 1;
  const nextGoalIndex = (currentGoalIndex + 1) % FINE_TUNING_GOALS.length;
  const prevGoalConfig = FINE_TUNING_GOALS[prevGoalIndex];
  const nextGoalConfig = FINE_TUNING_GOALS[nextGoalIndex];

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-x-hidden">
      {/* Cyberpunk background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-surface to-background opacity-90"></div>
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-secondary to-transparent opacity-50"></div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl relative z-10">
        {/* Header */}
        <header className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <Zap size={56} className="text-primary mr-4 animate-pulse" style={{
              filter: 'drop-shadow(0 0 5px #00FF41)',
              animation: 'glow-pulse 2s ease-in-out infinite alternate'
            }} />
            <h1 
              className="text-5xl md:text-7xl font-black glitch font-mono tracking-wider"
              data-text="FINE FORMAT"
              style={{
                color: '#00FF41',
                textShadow: '0 0 2px #00FF41, 0 0 4px #00FF41',
                letterSpacing: '0.1em'
              }}
            >
              FINE FORMAT
            </h1>
          </div>
          <div className="relative">
            <p className="text-xl md:text-2xl text-accent max-w-3xl mx-auto font-semibold">
              <span className="text-foreground">Efficiently</span>{' '}
              <span className="neon-text-accent">TRANSFORM</span>{' '}
              <span className="text-foreground">content from diverse document types, public URLs, and curated relevant web sources into</span>{' '}
              <span className="neon-text-secondary">HIGH-QUALITY</span>,{' '}
              <span className="text-foreground">domain specific</span>{' '}
              <span className="neon-text-accent">DATASETS</span>{' '}
              <span className="text-foreground">for fine-tuning AI models.</span>
            </p>
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary to-transparent"></div>
          </div>
        </header>

        <div className="space-y-8">
          {/* API Key Warning */}
          {!isGeminiReady && (
            <Alert
              type="warning"
              title="GEMINI API KEY REQUIRED"
              message="Please set your Gemini API key in the .env.local file and restart the development server."
            />
          )}

          {/* OpenRouter Warning for Gap Filling */}
          {enableGapFilling && !isOpenRouterReady && (
            <Alert
              type="warning"
              title="OPENROUTER API KEY REQUIRED FOR GAP FILLING"
              message="Knowledge gap filling requires OpenRouter API access. Please set your OpenRouter API key in .env.local to enable synthetic Q&A generation."
            />
          )}

          {/* Error Display */}
          {error && (
            <Alert
              type="error"
              title="PROCESSING ERROR"
              message={error}
              onClose={clearError}
            />
          )}

          {/* Fine-Tuning Goal Selection - Carousel Style */}
          <Card className="cyber-card">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <h3 className="text-xl font-bold text-primary flex items-center font-mono tracking-wide">
                  <FlagTriangleRight 
                    size={24} 
                    className="mr-3 text-accent" 
                    style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }}
                  />
                  SELECT YOUR FINE-TUNING GOAL
                </h3>
                <Tooltip content="Choose the primary focus for your dataset generation. This determines how the AI will analyze your content and generate Q&A pairs optimized for your specific fine-tuning objectives." />
              </div>
              <p className="text-accent font-semibold mt-2 font-mono">
                <span className="neon-text-accent">NAVIGATE</span> through different objectives using arrows or click cards
              </p>
            </CardHeader>
            <CardContent>
              {/* Carousel Container */}
              <div className="relative">
                {/* Carousel Display */}
                <div className="relative h-80 overflow-hidden">
                  <div className="flex items-center justify-center h-full relative">
                    
                    {/* Previous Goal Card (Left) */}
                    <div 
                      className="absolute left-0 w-64 h-64 cursor-pointer transition-all duration-500 transform -translate-x-8 scale-75 opacity-60 hover:opacity-80 hover:scale-80"
                      onClick={() => selectGoal(prevGoalConfig.id)}
                      style={{
                        background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.8), rgba(26, 26, 26, 0.6))',
                        border: '1px solid rgba(102, 102, 102, 0.3)',
                        borderRadius: '12px',
                        zIndex: 1
                      }}
                    >
                      <div className="p-6 h-full flex flex-col items-center justify-center text-center">
                        <div className="text-4xl mb-3">{prevGoalConfig.icon}</div>
                        <h4 className="text-muted font-bold text-lg font-mono mb-2">{prevGoalConfig.name}</h4>
                        <p className="text-muted text-sm font-mono leading-tight">{prevGoalConfig.description.substring(0, 80)}...</p>
                      </div>
                    </div>

                    {/* Current Goal Card (Center) */}
                    <div 
                      className="w-80 h-72 relative z-10 transition-all duration-500"
                      style={{
                        background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.12), rgba(0, 255, 255, 0.06))',
                        border: '2px solid #00FFFF',
                        borderRadius: '16px',
                        boxShadow: '0 0 30px rgba(0, 255, 255, 0.4), inset 0 0 30px rgba(0, 255, 255, 0.08)'
                      }}
                    >
                      {/* Selection Indicator */}
                      <div className="absolute top-4 right-4">
                        <div className="w-4 h-4 bg-accent rounded-full animate-pulse"
                             style={{ boxShadow: '0 0 8px #00FFFF' }} />
                      </div>

                      {/* Goal Content */}
                      <div className="p-6 h-full flex flex-col justify-center">
                        <div className="flex items-center justify-center space-x-4 mb-4">
                          <div className="text-5xl">{currentGoal.icon}</div>
                          <IconComponent 
                            size={36} 
                            className="text-accent"
                            style={{ filter: 'drop-shadow(0 0 5px #00FFFF)' }}
                          />
                        </div>
                        <h4 className="neon-text-accent font-bold text-xl mb-3 font-mono tracking-wide text-center">
                          {currentGoal.name}
                        </h4>
                        <p className="text-foreground text-sm mb-4 font-mono leading-relaxed text-center">
                          {currentGoal.description}
                        </p>
                        <div className="p-3 bg-surface/40 rounded-lg border border-accent/30">
                          <p className="text-accent text-xs font-mono text-center">
                            <span className="neon-text-accent font-bold">FOCUS:</span>{' '}
                            {currentGoal.promptFocus}
                          </p>
                        </div>
                      </div>

                      {/* Animated background effect */}
                      <div className="absolute inset-0 pointer-events-none rounded-16">
                        <div 
                          className="absolute top-0 left-0 right-0 h-px bg-accent opacity-70"
                          style={{
                            animation: 'scanline 3s linear infinite',
                            boxShadow: '0 0 5px #00FFFF'
                          }}
                        />
                      </div>
                    </div>

                    {/* Next Goal Card (Right) */}
                    <div 
                      className="absolute right-0 w-64 h-64 cursor-pointer transition-all duration-500 transform translate-x-8 scale-75 opacity-60 hover:opacity-80 hover:scale-80"
                      onClick={() => selectGoal(nextGoalConfig.id)}
                      style={{
                        background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.8), rgba(26, 26, 26, 0.6))',
                        border: '1px solid rgba(102, 102, 102, 0.3)',
                        borderRadius: '12px',
                        zIndex: 1
                      }}
                    >
                      <div className="p-6 h-full flex flex-col items-center justify-center text-center">
                        <div className="text-4xl mb-3">{nextGoalConfig.icon}</div>
                        <h4 className="text-muted font-bold text-lg font-mono mb-2">{nextGoalConfig.name}</h4>
                        <p className="text-muted text-sm font-mono leading-tight">{nextGoalConfig.description.substring(0, 80)}...</p>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Navigation Controls */}
                <div className="flex items-center justify-between mt-6">
                  {/* Previous Button */}
                  <button
                    onClick={prevGoal}
                    disabled={isProcessing}
                    className="flex items-center space-x-2 px-6 py-3 bg-surface/50 hover:bg-surface/70 border border-border hover:border-accent/50 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.5), rgba(26, 26, 26, 0.3))'
                    }}
                  >
                    <ChevronLeft size={20} className="text-accent" />
                    <span className="text-accent font-mono font-semibold">PREVIOUS</span>
                  </button>

                  {/* Goal Indicators */}
                  <div className="flex items-center space-x-3">
                    {FINE_TUNING_GOALS.map((goal, index) => (
                      <button
                        key={goal.id}
                        onClick={() => selectGoal(goal.id)}
                        disabled={isProcessing}
                        className={`w-3 h-3 rounded-full transition-all duration-300 ${
                          index === currentGoalIndex 
                            ? 'bg-accent shadow-neon' 
                            : 'bg-border hover:bg-accent/50'
                        }`}
                        style={{
                          boxShadow: index === currentGoalIndex ? '0 0 8px #00FFFF' : undefined
                        }}
                        title={goal.name}
                      />
                    ))}
                  </div>

                  {/* Next Button */}
                  <button
                    onClick={nextGoal}
                    disabled={isProcessing}
                    className="flex items-center space-x-2 px-6 py-3 bg-surface/50 hover:bg-surface/70 border border-border hover:border-accent/50 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(135deg, rgba(26, 26, 26, 0.5), rgba(26, 26, 26, 0.3))'
                    }}
                  >
                    <span className="text-accent font-mono font-semibold">NEXT</span>
                    <ChevronRight size={20} className="text-accent" />
                  </button>
                </div>

                {/* Quick Selection Pills */}
                <div className="flex flex-wrap justify-center gap-3 mt-6">
                  {FINE_TUNING_GOALS.map((goal, index) => {
                    const isSelected = index === currentGoalIndex;
                    return (
                      <button
                        key={goal.id}
                        onClick={() => selectGoal(goal.id)}
                        disabled={isProcessing}
                        className={`px-4 py-2 rounded-full font-mono font-semibold text-sm transition-all duration-300 ${
                          isSelected 
                            ? 'bg-accent/20 text-accent border-2 border-accent shadow-neon' 
                            : 'bg-surface/30 text-muted border border-border hover:border-accent/50 hover:text-accent'
                        }`}
                        style={{
                          boxShadow: isSelected ? '0 0 10px rgba(0, 255, 255, 0.3)' : undefined
                        }}
                      >
                        {goal.icon} {goal.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* File Upload */}
          <FileUpload
            files={files}
            onFilesChange={setFiles}
            disabled={isProcessing}
          />

          {/* URL Input */}
          <UrlInput
            urls={urls}
            onUrlsChange={setUrls}
            disabled={isProcessing}
          />

          {/* Optional Additional Steps Header */}
          <div className="text-center py-4">
            <h3 className="text-2xl font-bold text-primary font-mono tracking-wide">
              <span className="neon-text">OPTIONAL ADDITIONAL STEPS</span>
            </h3>
            <div className="mt-2 w-48 h-px bg-gradient-to-r from-transparent via-primary to-transparent mx-auto"></div>
          </div>

          {/* Enhancement Options */}
          <Card className="cyber-card">
            <CardContent>
              <div className="space-y-4">
                {/* Web Augmentation */}
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <input
                      type="checkbox"
                      id="webAugmentation"
                      checked={enableWebAugmentation}
                      onChange={(e) => setEnableWebAugmentation(e.target.checked)}
                      disabled={isProcessing || !isGeminiReady}
                      className="h-6 w-6 rounded border-2 border-primary bg-surface text-primary focus:ring-primary focus:ring-2 focus:ring-offset-0 disabled:opacity-50"
                      style={{
                        accentColor: '#00FF41',
                        filter: 'drop-shadow(0 0 3px #00FF41)'
                      }}
                    />
                  </div>
                  <label htmlFor="webAugmentation" className="text-foreground font-semibold cursor-pointer text-lg">
                    <span className="neon-text">ENHANCE</span> with Targeted Web Content
                  </label>
                  <Tooltip content="AI will identify key themes from your content and search for relevant information online to create a comprehensive 100+ Q&A dataset with both correct and incorrect answers for optimal fine-tuning." />
                </div>
                {enableWebAugmentation && (
                  <div className="mt-4 flex items-center text-accent font-medium">
                    <Search size={18} className="mr-3 animate-pulse" style={{
                      filter: 'drop-shadow(0 0 3px #00FFFF)'
                    }} />
                    <span className="neon-text-accent">THEME-BASED WEB SEARCH</span> - will enhance content quality and coverage
                  </div>
                )}

                {/* Knowledge Gap Filling */}
                <div className="flex items-center space-x-4 pt-4 border-t border-border">
                  <div className="relative">
                    <input
                      type="checkbox"
                      id="gapFilling"
                      checked={enableGapFilling}
                      onChange={(e) => setEnableGapFilling(e.target.checked)}
                      disabled={isProcessing || !isGeminiReady}
                      className="h-6 w-6 rounded border-2 border-secondary bg-surface text-secondary focus:ring-secondary focus:ring-2 focus:ring-offset-0 disabled:opacity-50"
                      style={{
                        accentColor: '#dc1aff',
                        filter: 'drop-shadow(0 0 3px #dc1aff)'
                      }}
                    />
                  </div>
                  <label htmlFor="gapFilling" className="text-foreground font-semibold cursor-pointer text-lg">
                    <span className="neon-text-secondary">INTELLIGENT GAP FILLING</span> with Cross-Validated Synthetic Data
                  </label>
                  <Tooltip content="After generating 100 Q&A pairs from your content, Gemini analyzes the dataset to identify knowledge gaps, then Nvidia Nemotron generates 50-100 additional synthetic Q&A pairs. Each synthetic pair is cross-validated by Gemini to ensure accuracy and quality before inclusion." />
                </div>
                {enableGapFilling && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center text-secondary font-medium">
                      <Brain size={18} className="mr-3 animate-pulse" style={{
                        filter: 'drop-shadow(0 0 3px #dc1aff)'
                      }} />
                      <span className="neon-text-secondary">KNOWLEDGE GAP ANALYSIS</span> - Initial dataset generation will be analyzed to identify knowledge gaps
                    </div>
                    <div className="text-success text-sm font-mono ml-7">
                      ✅ Identified knowledge gaps will be targeted for synthetic data generation
                    </div>
                    <div className="text-accent text-sm font-mono ml-7">
                      🔍 Dual-model cross validation guarantees validity and relevance of synthetic data augments
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Generate Button */}
          <div className="flex justify-center">
            <Button
              size="lg"
              onClick={handleGenerateDataset}
              disabled={!canGenerate}
              loading={isProcessing}
              className="px-12 py-6 text-xl font-bold cyber-button"
            >
              {isProcessing 
                ? <span className="neon-text">GENERATING DATASET...</span>
                : <span>
                    <span className="neon-text">GENERATE 100{enableGapFilling && isOpenRouterReady ? '+' : ''} Q&A DATASET</span>
                    <span className="text-accent ml-2">({totalReadySources} source{totalReadySources !== 1 ? 's' : ''})</span>
                  </span>
              }
            </Button>
          </div>

          {/* Processing Status */}
          <ProcessingStatus
            isProcessing={isProcessing}
            currentStep={currentStep}
            progress={progress}
            estimatedTimeRemaining={estimatedTimeRemaining}
            totalEstimatedTime={totalEstimatedTime}
          />

          {/* Dataset Preview */}
          {processedData && (
            <DatasetPreview
              qaPairs={processedData.qaPairs}
              sourceFileCount={processedData.sourceFileCount}
              sourceUrlCount={processedData.sourceUrlCount}
              identifiedThemes={processedData.identifiedThemes}
              correctAnswerCount={processedData.correctAnswerCount}
              incorrectAnswerCount={processedData.incorrectAnswerCount}
              isAugmented={processedData.isAugmented}
              groundingMetadata={processedData.groundingMetadata}
              syntheticPairCount={processedData.syntheticPairCount}
              validatedPairCount={processedData.validatedPairCount}
              identifiedGaps={processedData.identifiedGaps}
              gapFillingEnabled={processedData.gapFillingEnabled}
            />
          )}
        </div>

        {/* Footer */}
        <footer className="text-center mt-20 pt-8 border-t border-border relative">
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-primary to-transparent"></div>
          <p className="text-accent text-sm mb-4 font-mono">
            <span className="neon-text-accent">POWERED BY LEADING AI MODELS</span>
          </p>
          <p className="text-gray-400 text-sm font-mono mb-2">
            &copy; {new Date().getFullYear()} DappGoose Labs DAO.
          </p>
          <p className="text-gray-400 text-sm font-mono">
            Made with <span className="text-red-500 neon-text-red">{'<3'}</span> and{' '}
            <span className="text-accent neon-text-accent">bolt.new</span> by{' '}
            <span className="text-foreground">brucethegoose.eth</span>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default App;
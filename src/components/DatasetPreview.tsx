import { useState } from 'react';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  EyeOff, 
  BarChart3
} from 'lucide-react';
import type { ProcessedData, QAPair } from '../types';

interface DatasetPreviewProps {
  data: ProcessedData;
}

export function DatasetPreview({ data }: DatasetPreviewProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    qaPairs: false,
    validation: false,
    synthetic: false
  });
  const [showAnswers, setShowAnswers] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const totalPairs = data.qaPairs.length + (data.syntheticPairCount || 0);
  const validPairs = data.validatedPairCount || 0;
  const avgConfidence = 0; // This needs to be recalculated

  // Pagination for QA pairs
  const allPairs = [...data.qaPairs] as QAPair[];
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPairs = allPairs.slice(startIndex, endIndex);
  const totalPages = Math.ceil(allPairs.length / itemsPerPage);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'hard': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Section */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-indigo-600" />
              Dataset Overview
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSection('overview')}
            >
              {expandedSections.overview ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>

          {expandedSections.overview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{totalPairs}</div>
                <div className="text-sm text-blue-800">Total Q&A Pairs</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{validPairs}</div>
                <div className="text-sm text-green-800">Valid Pairs</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{Math.round(avgConfidence * 100)}%</div>
                <div className="text-sm text-purple-800">Avg Confidence</div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{data.identifiedThemes?.length || 0}</div>
                <div className="text-sm text-orange-800">Themes Identified</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Q&A Pairs Section */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Question & Answer Pairs ({allPairs.length})
            </h2>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAnswers(!showAnswers)}
              >
                {showAnswers ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                {showAnswers ? 'Hide' : 'Show'} Answers
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleSection('qaPairs')}
              >
                {expandedSections.qaPairs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {expandedSections.qaPairs && (
            <div className="space-y-4">
              {currentPairs.map((pair, index) => {
                return (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className={getDifficultyColor('medium')}>
                          Medium
                        </Badge>
                        <Badge variant="outline">
                          General
                        </Badge>
                      </div>
                      <Badge variant={pair.source === 'synthetic' ? 'secondary' : 'default'}>
                        {pair.source || 'Original'}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="text-sm font-medium text-gray-700 mb-1">Question:</div>
                        <div className="text-gray-900">{pair.user}</div>
                      </div>

                      {showAnswers && (
                        <div>
                          <div className="text-sm font-medium text-gray-700 mb-1">Answer:</div>
                          <div className="text-gray-900 bg-gray-50 p-3 rounded">
                            {pair.model}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-gray-500">
                    Showing {startIndex + 1}-{Math.min(endIndex, allPairs.length)} of {allPairs.length} pairs
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-500">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Themes Section */}
      {data.identifiedThemes && data.identifiedThemes.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Identified Themes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.identifiedThemes.map((theme: any, index: number) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">{theme}</h3>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
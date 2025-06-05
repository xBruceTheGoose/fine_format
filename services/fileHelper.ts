import { QAPair, StandardFormatQAPair, StandardFormatQAPairMessage } from '../types';

const escapeCSVField = (field: string): string => {
  // Enclose in double quotes if it contains a comma, double quote, or newline
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
};

const transformToStandardFormat = (pair: QAPair): StandardFormatQAPair => {
  return {
    input: {
      messages: [
        {
          role: 'assistant',
          content: 'This Q&A pair is part of a generated dataset.', // Generic context
        },
        {
          role: 'user',
          content: pair.user,
        },
      ],
    },
    preferred_output: [
      {
        role: 'assistant',
        content: pair.model,
      },
    ],
    non_preferred_output: [], // Empty array as we don't generate non-preferred outputs
  };
};

export const downloadAsCSV = (data: QAPair[], filename: string): void => {
  if (data.length === 0) return;

  const csvHeader = "user_question,model_answer\n";
  const csvRows = data
    .map(pair => `${escapeCSVField(pair.user)},${escapeCSVField(pair.model)}`)
    .join("\n");
  
  const csvContent = csvHeader + csvRows;
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
};

export const downloadAsJSONL = (data: QAPair[], filename: string): void => {
  if (data.length === 0) return;

  const jsonlContent = data
    .map(pair => JSON.stringify(transformToStandardFormat(pair)))
    .join("\n");

  const blob = new Blob([jsonlContent], { type: 'application/jsonl;charset=utf-8;' });
  triggerDownload(blob, filename);
};

export const downloadAsJSON = (data: QAPair[], filename: string): void => {
  if (data.length === 0) return;

  const transformedData = data.map(transformToStandardFormat);
  const jsonContent = JSON.stringify(transformedData, null, 2); // Pretty print with 2 spaces

  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  triggerDownload(blob, filename);
};


const triggerDownload = (blob: Blob, filename: string): void => {
  const link = document.createElement("a");
  if (link.download !== undefined) { // feature detection
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

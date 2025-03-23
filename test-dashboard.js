import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateConsolidatedReport } from './scripts/reports/consolidated-report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const previewUrlsPath = path.join(__dirname, 'temp', 'preview-urls.json');

// Read the preview URLs
const previewUrls = JSON.parse(fs.readFileSync(previewUrlsPath, 'utf8'));
console.log('Preview URLs:', previewUrls);

// Generate the dashboard
generateConsolidatedReport({
  reportPath: 'preview-dashboard.html',
  previewUrls: previewUrls,
  title: 'Preview Workflow Dashboard with URLs'
}).then(result => {
  if (result) {
    console.log('Dashboard generated successfully with preview URLs!');
  } else {
    console.error('Failed to generate dashboard.');
  }
}); 
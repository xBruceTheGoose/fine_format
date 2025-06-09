# Fine Format - AI Fine-Tuning Dataset Generator

A powerful tool for generating high-quality Q&A datasets from documents and URLs, optimized for fine-tuning AI models.

## 🚀 Quick Start

### Local Development
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.local.example` to `.env.local` and add your API keys
4. Start development server: `npm run dev`

### Production Deployment on Netlify

#### Option 1: Deploy from GitHub (Recommended)
1. Fork this repository to your GitHub account
2. Go to [Netlify](https://netlify.com) and sign in
3. Click "New site from Git"
4. Connect your GitHub account and select your forked repository
5. Netlify will automatically detect the build settings from `netlify.toml`
6. Add your environment variables in Netlify dashboard:
   - `GEMINI_API_KEY` - Your Google Gemini API key
   - `OPENROUTER_API_KEY` - Your OpenRouter API key
7. Deploy!

#### Option 2: Manual Deploy
1. Build the project: `npm run build`
2. Drag and drop the `dist` folder to Netlify
3. Configure environment variables in Netlify dashboard
4. Set up Netlify functions manually

## 🔧 Environment Variables

### For Local Development (.env.local)
```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_OPENROUTER_API_KEY=your_openrouter_api_key_here
```

### For Netlify Production
Set these in your Netlify dashboard under Site Settings > Environment Variables:
```
GEMINI_API_KEY=your_gemini_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

## 📁 Project Structure

```
├── src/                    # React application source
├── netlify/functions/      # Netlify serverless functions
├── dist/                   # Built application (generated)
├── netlify.toml           # Netlify configuration
└── package.json           # Dependencies and scripts
```

## 🔒 Security

- **Development**: API keys are used client-side for easy testing
- **Production**: API keys are secured server-side via Netlify functions
- All API calls in production go through `/api/*` endpoints that proxy to Netlify functions

## 🌟 Features

- Upload multiple file types (PDF, DOCX, TXT, MD, HTML, JSONL)
- Fetch content from URLs
- AI-powered content analysis and theme identification
- Generate 100+ Q&A pairs with correct/incorrect examples
- Web augmentation with Google Search integration
- Knowledge gap analysis and synthetic Q&A generation
- Multiple export formats (JSON, JSONL, CSV)
- Fine-tuning guides for popular platforms

## 🛠️ Development

### Branches
- `main` - Production branch with Netlify functions
- `development` - Development branch with client-side API calls

### Local Development
```bash
# Switch to development branch for local testing
git checkout development
npm run dev

# Switch to main branch for production deployment
git checkout main
npm run build
```

## 📝 License

MIT License - see LICENSE file for details
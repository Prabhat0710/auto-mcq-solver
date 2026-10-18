# 🧠 Auto MCQ Solver - Chrome Extension

AI-powered Chrome extension that automatically detects and solves Multiple Choice Questions on any webpage using Google's Gemini API (free tier).

## ✨ Features

- **Auto-detect MCQs** on any webpage (supports forms, LMS platforms, quiz sites)
- **Video context extraction** - grabs subtitles/transcripts to answer more accurately
- **One-click solving** - click the floating button or use the popup
- **Multi-strategy detection** - 4 different strategies to find questions on any page
- **Works with popular LMS** - Moodle, Canvas, Coursera, edX, Google Forms, and more
- **Free to use** - powered by Gemini API free tier (gemini-2.0-flash)

## 🚀 Setup

### 1. Get a Free Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key (it's completely free!)

### 2. Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **"Developer mode"** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `auto-mcq-solver` folder
5. The extension icon will appear in your toolbar

### 3. Configure

1. Click the extension icon in the toolbar
2. Paste your Gemini API key
3. Click **"Save Key"**
4. Click **"Test"** to verify it works

## 📖 How to Use

### Method 1: Floating Button (Recommended)
1. Go to any page with MCQs
2. Click the purple floating button (bottom-right corner)
3. Click **"🧠 Solve Questions"**
4. Wait for AI to process and auto-select answers

### Method 2: Popup
1. Click the extension icon in the toolbar
2. See how many questions were detected
3. Click **"🧠 Solve All Questions"**

### Debug Options
- **📋 Extract Only** - Shows detected questions in the browser console (F12)
- **🎬 Video Context** - Shows any detected video transcript in the console

## 🏗️ Architecture

```
auto-mcq-solver/
├── manifest.json          # Extension configuration (Manifest V3)
├── background/
│   └── background.js      # Service worker - Gemini API calls
├── content/
│   ├── content.js         # Page scraper + floating UI
│   └── content.css        # Styles for floating button & status
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
├── icons/                 # Extension icons
└── README.md
```

## 🔍 Question Detection Strategies

The extension uses 4 strategies to find MCQs:

1. **Form-based** - Finds `<form>` elements with radio/checkbox inputs
2. **Input groups** - Groups radio/checkbox inputs by name attribute
3. **LMS blocks** - Matches common LMS class names (`.question`, `.quiz-item`, etc.)
4. **Heuristic** - Pattern-matches numbered questions and nearby options

## 🎬 Supported Video/Transcript Sources

- HTML5 `<track>` subtitles/captions
- Platform-specific transcript containers (Coursera, edX, Udemy, YouTube)
- Video description and lesson content areas

## ⚠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| "No questions found" | The page may use an unusual format. Try "Extract Only" and check the console. |
| "Cannot reach page" | Refresh the page and try again. Extension needs to inject its content script. |
| "API key error" | Make sure you copied the full key from AI Studio. Test it in the popup. |
| Answers not clicking | Some sites use custom components. The AI will still show answers in the console. |

## 🛡️ Privacy

- Your API key is stored locally in Chrome storage (never sent anywhere except Google's API)
- Page content is sent to Gemini API only when you click "Solve"
- No data collection, no analytics, no tracking

## 📄 License

MIT - Use freely, study AI/ML instead of wasting time on mandatory quizzes! 🎓

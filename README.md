# 🧠 Auto MCQ Solver & Course Auto-Pilot

> An AI-powered Chromium browser extension that automatically detects questions, finds correct answers using Google's Gemini AI, auto-submits, and advances through courses, videos, and quizzes autonomously.

[![GitHub license](https://img.shields.io/github/license/Prabhat0710/auto-mcq-solver)](https://github.com/Prabhat0710/auto-mcq-solver/blob/master/LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Gemini API](https://img.shields.io/badge/AI-Gemini%203.8%20Flash-blueviolet.svg)](https://ai.google.dev/)
[![Chromium Supported](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Brave%20%7C%20Edge%20%7C%20Opera%20%7C%20Arc-orange.svg)](#-supported-browsers)

---

## ✨ Features

- 🚀 **Full Auto-Pilot Mode**: Solves questions, auto-submits, and clicks "Next Lesson" continuously until the entire course or module is complete.
- ⚡ **Smart Video Fast-Forward**: Detects video lectures, plays them at customizable speeds (**1x**, **2x**, **4x**, **8x**, or **16x**), and auto-advances the moment they finish.
- 🎯 **Multi-Strategy Question Detection**: 4 distinct scraping strategies support forms, radio buttons, checkboxes, LMS blocks, and plain text heuristics.
- 🎬 **Context-Aware AI**: Automatically extracts lecture transcripts and captions to answer niche or course-specific questions with high accuracy.
- 🛡️ **Resilient AI Pipeline**: Includes automatic exponential backoff retries and fallback from `gemini-3.8-flash` to `gemini-3.8-flash-lite` during high server traffic (503 handling).
- 🆓 **100% Free Tier**: Built entirely on Google's free Gemini API. Zero subscriptions or paid credits required.
- 🔒 **Privacy First**: Your API key and answers never leave your browser except to make direct requests to Google AI Studio.

---

## 🌐 Supported Platforms & Browsers

### Supported Platforms
- **GUVI** (Interactive player, quizzes, and lessons)
- **Moodle** (Standard quizzes, multi-choice, true/false)
- **Canvas LMS** (Assessments, question banks)
- **Coursera & edX** (In-video quizzes and assignments)
- **Google Forms & Microsoft Forms**
- **Blackboard & Brightspace**
- **Custom College / University Portals**

### Supported Browsers
Works on **any Chromium-based web browser** on Windows, macOS, or Linux:
- Google Chrome
- Brave Browser
- Microsoft Edge
- Opera / Opera GX
- Arc Browser
- Vivaldi

---

## 🚀 Quick Setup (Your Own Machine)

### 1. Get a Free Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/apikey).
2. Sign in with your Google Account.
3. Click **"Create API Key"** and copy the generated key.

### 2. Load the Extension
1. Open your browser and navigate to:
   - **Chrome / Brave:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Opera:** `opera://extensions`
2. Enable **"Developer mode"** (toggle in the top-right or sidebar).
3. Click **"Load unpacked"**.
4. Select the `auto-mcq-solver` folder.

### 3. Activate
1. Click the extension icon in your browser toolbar (pin it for convenience).
2. Paste your Gemini API key and click **"Save Key"**.
3. Click **"Test"** to verify connection.

---

## 💻 How to Use on Someone Else's Laptop (Quick 2-Minute Setup)

If you are using a friend's laptop, college lab computer, or library workstation, you don't need Git or programming tools installed.

### Option A: Direct Download via GitHub (No tools needed)
1. Open their browser and go to:
   **[https://github.com/Prabhat0710/auto-mcq-solver](https://github.com/Prabhat0710/auto-mcq-solver)**
2. Click the green **`<> Code`** button and select **"Download ZIP"**.
3. Right-click the downloaded `.zip` file and select **"Extract All..."**.
4. Open their browser extensions page:
   - Go to `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
   - Turn on **"Developer mode"** in the top-right.
   - Click **"Load unpacked"** and select the unzipped `auto-mcq-solver` folder.
5. Click the extension puzzle icon in the toolbar, paste your Gemini API key, click **Save Key**, and you're ready!

---

### Option B: USB Drive or Cloud Storage (Fastest Offline Method)
Keep a copy of the extension on a USB flash drive or your Google Drive:
1. Copy the `auto-mcq-solver` folder to your USB drive or upload it as a `.zip` to Google Drive.
2. Plug the USB into the other computer (or download and extract the ZIP from Drive).
3. Go to `chrome://extensions` → enable **Developer mode** → click **Load unpacked** → choose the folder from the USB or desktop.
4. Paste your API key and activate.

---

### Option C: Via Terminal / Git (For Developer Machines)
If the machine already has Git installed:
```bash
git clone https://github.com/Prabhat0710/auto-mcq-solver.git
```
Then load the folder via `chrome://extensions` → **Load unpacked**.

---

### 🧹 Leaving Someone Else's Laptop (Clean Removal)
When you are done using someone else's machine:
1. Click the extension icon → select the API key input, delete your key, and click **Save Key**.
2. Go to `chrome://extensions` and click **"Remove"** on the Auto MCQ Solver card.
3. Delete the downloaded `auto-mcq-solver` folder from their Downloads or Desktop.
4. Empty the Recycle Bin / Trash.

---

## 🎮 How to Use

### Mode 1: Full Auto-Pilot (Hands-Free)
1. Open your course or quiz page.
2. Click the extension icon in the toolbar.
3. Switch **🚀 Auto-Pilot Mode** to **ON**.
4. Choose your preferred video speed (**2x** or **4x** recommended).
5. The extension will automatically:
   - Solve questions as they appear.
   - Click **Submit** or **Next**.
   - Watch and accelerate videos.
   - Advance to the next lesson or module.
6. A floating banner at the top shows live progress (`🚀 Auto-Pilot ACTIVE`). Click **⏹️ Stop** anytime to pause.

### Mode 2: Manual Trigger (One Question at a Time)
1. Navigate to any quiz page.
2. Click the floating purple button at the bottom-right corner.
3. Click **"🧠 Solve Questions"** to answer questions without auto-submitting.
4. Review the AI's highlighted answers, then submit when you're ready.

---

## 🏗️ Project Architecture

```text
auto-mcq-solver/
├── manifest.json          # Chrome Extension Manifest V3 configuration
├── background/
│   └── background.js      # Service Worker: Gemini API caller with retries & fallbacks
├── content/
│   ├── content.js         # Core Engine: Scraping, Auto-Pilot, video & DOM handlers
│   └── content.css        # Styles: Floating FAB, on-screen HUD, answer highlights
├── popup/
│   ├── popup.html         # User Interface: API key, Auto-Pilot toggle, scan details
│   ├── popup.js           # Popup controller & chrome.storage state manager
│   └── popup.css          # Modern purple-themed UI styling
├── icons/                 # Extension logos (16x16, 48x48, 128x128)
├── CONTRIBUTING.md        # Guidelines for adding new platform scrapers
├── LICENSE                # MIT License
└── README.md              # Project documentation
```

---

## ⚙️ Question Scraping Engine

The extension uses 4 cascaded strategies in `content/content.js`:

| Strategy | Target Architecture | Description |
|---|---|---|
| **1. Form Groups** | Standard HTML `<form>` | Groups radio and checkbox inputs by `name` attribute |
| **2. Input Matching** | Dynamic / Div-wrapped Inputs | Groups unnested inputs by shared attributes and parent labels |
| **3. LMS Blocks** | Moodle, Canvas, GUVI, Coursera | Matches recognized CSS classes (`.question`, `.que`, `.rc-Option`, etc.) |
| **4. Text Heuristics** | Unstructured Webpages | Matches numbered questions (`Q1.`, `1)`) and identifies neighboring option labels |

---

## ⚠️ Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| **API Error 503 (High Demand)** | Google's server is temporarily busy | The extension automatically retries with backoff and switches to `gemini-3.8-flash-lite`. |
| **API Error 404 (Model Retired)** | Deprecated model name | Extension uses the latest `gemini-3.8-flash` model. Ensure your extension is up to date. |
| **"No questions detected"** | The page hasn't finished loading or uses unusual HTML | Click **Refresh Page Scan** or use **📋 Extract Only** to inspect the DOM. |
| **"Cannot reach page"** | Content script not injected yet | Refresh the course webpage tab (press `F5`) and reopen the popup. |
| **Auto-Pilot pauses unexpectedly** | Page reached final quiz or manual login required | Check the on-screen banner for status messages or click **Next** manually. |

---

## 🛡️ Privacy & Security

- **Local Storage Only**: Your Gemini API key is stored strictly on your local machine using Chrome's secure `chrome.storage.local`.
- **Zero Third-Party Relays**: Network calls are made directly between your browser and `https://generativelanguage.googleapis.com`.
- **No Analytics or Trackers**: No telemetry, tracking pixels, or remote logging scripts.

---

## 📜 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

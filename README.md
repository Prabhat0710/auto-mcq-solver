# 🧠 Auto MCQ Solver & Course Auto-Pilot

> An intelligent, autonomous Chromium browser extension that automatically detects quiz questions, solves them using Google Gemini AI via a secure Cloudflare serverless proxy, auto-submits answers, and fast-forwards through video lectures — all hands-free with **zero API keys required** for end-users!

[![GitHub license](https://img.shields.io/github/license/Prabhat0710/auto-mcq-solver)](https://github.com/Prabhat0710/auto-mcq-solver/blob/master/LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Cloudflare Backend](https://img.shields.io/badge/Backend-Cloudflare%20Pages%20Functions-orange.svg)](https://pages.cloudflare.com/)
[![Gemini AI](https://img.shields.io/badge/AI-Gemini%203.8%20Flash-blueviolet.svg)](https://ai.google.dev/)
[![Chromium Compatible](https://img.shields.io/badge/Browsers-Chrome%20%7C%20Brave%20%7C%20Edge%20%7C%20Opera%20%7C%20Arc-brightgreen.svg)](#-supported-browsers)

---

## ✨ Features

- ⚡ **Zero-Config "Just Add and Use"**: Comes pre-configured with a live, high-speed Cloudflare proxy. Friends and classmates can install and start solving immediately without creating Google AI Studio accounts or generating API keys!
- 🚀 **Full Auto-Pilot Mode**: Autonomously solves quizzes, selects the right answers, clicks **Submit / Next**, and advances to the next lesson or module automatically.
- 🎬 **Smart Video Fast-Forward**: Automatically detects video lectures, accelerates playback up to **16x** (**1x**, **2x**, **4x**, **8x**, **16x**), and auto-clicks "Next Lesson" the second the video completes.
- 🎯 **Multi-Strategy Question Scraper**: 4 specialized detection strategies extract questions from `<form>` inputs, dynamic radio/checkbox elements, LMS wrappers, and heuristic numbered text.
- 🧠 **Context-Aware Solving**: Extracts video transcripts, subtitles, and lesson descriptions on the fly, feeding lecture context to Gemini for near-100% quiz accuracy.
- 🛡️ **Enterprise-Grade AI Pipeline**: Cloudflare serverless edge proxy automatically handles high server loads with retries, exponential backoff, and model fallbacks (`gemini-3.8-flash` & `gemini-2.5-flash`).
- 🔑 **Optional Custom Key Override**: Power users can still provide their own private Gemini API key inside the extension settings.
- 🔒 **Privacy & Safety First**: Zero tracking, zero telemetry, and your Gemini API key is safely encrypted on Cloudflare edge servers.

---

## 🌐 Supported Platforms & Browsers

### Tested LMS & Course Platforms
- **GUVI** (Course player, interactive quizzes, multi-question flows)
- **Moodle** (Standard quizzes, multiple-choice, true/false)
- **Canvas LMS** (Assessments, question banks)
- **Coursera & edX** (In-video quizzes, graded assignments)
- **Google Forms & Microsoft Forms**
- **Blackboard & Brightspace**
- **Custom University & College Portals**

### Supported Browsers
Works seamlessly on all Chromium-based browsers:
- Google Chrome
- Brave Browser
- Microsoft Edge
- Opera / Opera GX
- Arc Browser
- Vivaldi

---

## ⚡ Instant Setup (30 Seconds — Zero Config)

Because the extension is connected to our live Cloudflare proxy, you **do not need any API key** to start.

### 1. Download the Extension
- Click the green **`<> Code`** button at the top of this repository and select **"Download ZIP"**.
- Extract the downloaded `.zip` file on your computer.

### 2. Load into Your Browser
1. Open your browser and go to:
   - **Chrome / Brave:** `chrome://extensions`
   - **Edge:** `edge://extensions`
   - **Opera:** `opera://extensions`
2. Turn ON **"Developer mode"** (toggle in the top-right corner).
3. Click **"Load unpacked"**.
4. Select the `auto-mcq-solver` folder.

### 3. Start Auto-Pilot!
1. Open your course or quiz page (e.g., GUVI, Coursera, Moodle).
2. Click the extension icon in your browser toolbar.
3. Toggle **🚀 Auto-Pilot Mode** to **ON**!
4. Sit back and watch it complete questions and advance through lessons automatically!

---

## 💻 Using on Someone Else's Laptop (Friend's PC or College Lab)

Need to finish your coursework on a friend's laptop or college lab computer? It takes under 1 minute:

1. **Open their browser** and go to:
   `https://github.com/Prabhat0710/auto-mcq-solver`
2. Click **`Code`** → **Download ZIP**, then right-click and extract it.
3. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the folder.
4. **No login or API key required!** Open your course, turn on Auto-Pilot, and let it finish.
5. **Clean Removal**: When finished, simply go to `chrome://extensions`, click **Remove** on the extension, and delete the folder from Downloads.

---

## 🎮 Modes of Operation

### Mode 1: Hands-Free Auto-Pilot
1. Open any course module.
2. In the extension popup, turn **🚀 Auto-Pilot Mode** **ON**.
3. Choose your preferred video speed (**2x** or **4x** recommended).
4. The extension will automatically:
   - Solve questions as they appear.
   - Click **Next** or **Submit**.
   - Watch and accelerate videos.
   - Advance to the next lesson or module.
5. A floating banner appears at the top of the webpage:
   `🚀 Auto-Pilot ACTIVE: Solving Q1... | [⏹️ Stop]`
   Click **⏹️ Stop** at any time to pause Auto-Pilot.

### Mode 2: Manual Control
1. Click the purple floating button at the bottom-right of your screen.
2. Click **"🧠 Solve Current Questions"** to answer questions without automatically submitting.
3. Review the highlighted answers and click submit whenever you're ready.

---

## 🏗️ Architecture & How It Works

```text
[ Course Page (GUVI / Moodle / Canvas) ]
                     │
         (Content Script Scraper)
                     ▼
       [ Auto MCQ Solver Extension ]
                     │
            (Encrypted HTTPS)
                     ▼
 [ Cloudflare Pages / Worker Proxy ]  <──  Secret GEMINI_API_KEY (Encrypted)
       (https://auto-mcq-solver.pages.dev)
                     │
            (Edge API Pipeline)
                     ▼
          [ Google Gemini AI ]
   (Gemini 3.8 Flash & Gemini 2.5 Flash)
```

### Repository Structure
```text
auto-mcq-solver/
├── manifest.json          # Chrome Extension Manifest V3
├── functions/             # Cloudflare Pages Serverless Edge Functions
│   ├── solve.js           # Secure /solve endpoint (Gemini proxy + fallbacks)
│   └── index.js           # Live health check endpoint (/)
├── server/                # Standalone Cloudflare Worker alternative
│   ├── worker.js          # Direct Worker script
│   └── wrangler.toml      # Cloudflare Wrangler CLI configuration
├── background/
│   └── background.js      # Service Worker: Handles Cloudflare proxy & direct API calls
├── content/
│   ├── content.js         # Core Engine: Auto-Pilot loop, question scraping, video acceleration
│   └── content.css        # Styles: Floating action button, on-screen HUD, answer highlights
├── popup/
│   ├── popup.html         # User Interface: Auto-Pilot toggle, speed selector, backend badge
│   ├── popup.js           # UI Controller & state management
│   └── popup.css          # Modern purple-themed design
├── icons/                 # Extension logos (16x16, 48x48, 128x128)
├── CONTRIBUTING.md        # Guide for adding new platform scrapers
├── LICENSE                # MIT License
└── README.md              # Project documentation
```

---

## 🛠️ For Developers: Self-Hosting Your Own Proxy

If you want to deploy your own Cloudflare backend instead of using the pre-configured one:

1. Fork this repository on GitHub.
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create Application** → **Pages** → **Connect to Git**.
3. Select your forked `auto-mcq-solver` repository and click **Begin setup** → **Save and Deploy**.
4. In your project settings, go to **Settings** → **Environment variables** → **Add variable**:
   - Variable name: `GEMINI_API_KEY`
   - Value: *(Your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey))*
5. In the extension popup, paste your newly deployed `.pages.dev` URL under **⚙️ AI Backend Settings**!

---

## ⚠️ Troubleshooting

| Issue | Solution |
|---|---|
| **"Cannot reach page"** | Refresh the course tab (press `F5`) so the content script can inject. |
| **"No questions detected"** | Click **Refresh Page Scan** in the popup or ensure the quiz has fully rendered on screen. |
| **Video doesn't speed up** | Some platforms wrap videos in custom iframes. The extension will still monitor playback and advance when done. |
| **Need personal quota** | Open **⚙️ AI Backend Settings** in the popup and enter your personal Gemini API key. |

---

## 🛡️ Privacy & Security

- **Encrypted Secrets**: Your Gemini API key is never bundled in client code or pushed to Git; it lives strictly in encrypted Cloudflare server environment variables.
- **Zero Data Collection**: We do not store, log, or track user browsing history, cookies, or course credentials.
- **Direct Edge Routing**: Requests travel directly from your browser to Cloudflare and Google Gemini over TLS 1.3 encryption.

---

## 📜 License

Distributed under the **MIT License**. Free to use, modify, and distribute. See [`LICENSE`](LICENSE) for details.

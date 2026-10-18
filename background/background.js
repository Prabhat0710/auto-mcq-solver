// ============================================================
// Background Service Worker - Gemini Direct & Cloudflare Proxy
// ============================================================

// Optional default Cloudflare Worker URL (e.g. "https://auto-mcq-solver.your-subdomain.workers.dev")
const DEFAULT_PROXY_URL = ""; 

const GEMINI_MODELS = [
  "gemini-3.8-flash",      // Primary - fast & free
  "gemini-3.8-flash-lite", // Fallback - lighter, less load
];

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "solveQuestions") {
    handleSolveQuestions(request.data)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (request.action === "analyzeVideoContext") {
    handleAnalyzeVideo(request.data)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (request.action === "testApiKey") {
    testApiKey(request.apiKey)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (request.action === "testProxyUrl") {
    testProxyUrl(request.proxyUrl)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test if a direct Gemini API key works
 */
async function testApiKey(apiKey) {
  try {
    const response = await callGeminiWithRetry(apiKey, "Say 'API key is working!' in exactly those words.");
    if (response) {
      return { success: true, message: "Gemini API key is valid!" };
    }
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Test if Cloudflare Worker Proxy is online
 */
async function testProxyUrl(proxyUrl) {
  try {
    const res = await fetch(proxyUrl, { method: "GET" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return {
      success: true,
      message: `Proxy online! (Configured: ${data.configured ? "Yes" : "Missing GEMINI_API_KEY secret"})`
    };
  } catch (err) {
    return { success: false, message: `Proxy unreachable: ${err.message}` };
  }
}

/**
 * Main Solver Handler: Uses Cloudflare Worker Proxy OR Direct Gemini Key
 */
async function handleSolveQuestions(data) {
  const config = await chrome.storage.local.get(["geminiApiKey", "proxyUrl"]);
  const proxyUrl = config.proxyUrl || DEFAULT_PROXY_URL;
  const apiKey = config.geminiApiKey;

  // 1. If Proxy URL is configured and user hasn't forced a custom key:
  if (proxyUrl && proxyUrl.trim() && !apiKey) {
    console.log("[Auto MCQ] Using Cloudflare Worker Proxy:", proxyUrl);
    return await solveViaProxy(proxyUrl.trim(), data);
  }

  // 2. If User provided a custom Gemini API Key:
  if (apiKey && apiKey.trim()) {
    console.log("[Auto MCQ] Using Custom Gemini API Key");
    return await solveViaDirectGemini(apiKey.trim(), data);
  }

  // 3. If Proxy URL is set even with empty key:
  if (proxyUrl && proxyUrl.trim()) {
    return await solveViaProxy(proxyUrl.trim(), data);
  }

  throw new Error(
    "No AI backend configured. Either enter a Gemini API Key or set up your free Cloudflare Worker proxy URL in the popup!"
  );
}

/**
 * Method A: Solve via Cloudflare Worker Proxy (Zero API Key on client!)
 */
async function solveViaProxy(proxyUrl, data) {
  const cleanUrl = proxyUrl.replace(/\/+$/, "");
  const response = await fetch(`${cleanUrl}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(
      `Cloudflare Proxy error (${response.status}): ${errData.error || response.statusText}`
    );
  }

  const result = await response.json();
  if (result.error) throw new Error(result.error);
  return result;
}

/**
 * Method B: Solve via Direct Gemini API Call
 */
async function solveViaDirectGemini(apiKey, data) {
  const { questions, videoContext } = data;

  const systemPrompt = `You are an expert quiz solver. Your job is to analyze questions and select the correct answers.

RULES:
- You MUST respond ONLY in valid JSON format, no markdown, no extra text.
- For each question, return the index (0-based) of the correct option(s).
- If there is video/lecture context provided, prioritize it for factual answers.
- Be accurate and concise.

Response format (strict JSON array):
[
  {
    "questionIndex": 0,
    "selectedOptions": [0],
    "confidence": "high",
    "reasoning": "Brief explanation"
  }
]`;

  let prompt = "";
  if (videoContext && videoContext.trim()) {
    prompt += `=== VIDEO/LECTURE CONTEXT ===\n${videoContext}\n\n`;
  }

  prompt += "=== QUESTIONS TO SOLVE ===\n\n";
  questions.forEach((q, i) => {
    prompt += `Question ${i + 1}: ${q.questionText}\n`;
    q.options.forEach((opt, j) => {
      prompt += `  ${String.fromCharCode(65 + j)}) ${opt.text}\n`;
    });
    prompt += `Type: ${q.type || "single-choice"}\n\n`;
  });

  prompt += "\nAnalyze each question and respond with the strict JSON array.";

  const responseText = await callGeminiWithRetry(apiKey, prompt, systemPrompt);

  let answers;
  try {
    answers = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      answers = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Failed to parse AI response. Raw: " + responseText.substring(0, 200));
    }
  }

  return { success: true, answers };
}

/**
 * Video context summarization
 */
async function handleAnalyzeVideo(data) {
  const config = await chrome.storage.local.get(["geminiApiKey", "proxyUrl"]);
  const apiKey = config.geminiApiKey;
  const { transcript } = data;

  if (!transcript || !transcript.trim()) return { success: true, summary: "" };

  if (apiKey) {
    const systemPrompt = "Summarize the key quiz-relevant points from this lecture transcript.";
    const summary = await callGeminiWithRetry(apiKey, transcript, systemPrompt);
    return { success: true, summary };
  }

  return { success: true, summary: transcript.substring(0, 3000) };
}

/**
 * Call Gemini with retries and model fallbacks
 */
async function callGeminiWithRetry(apiKey, prompt, systemInstruction = null) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await callGeminiAPI(apiKey, prompt, systemInstruction, model);
      } catch (err) {
        lastError = err;
        if (err.message.includes("401") || err.message.includes("403")) {
          throw new Error("Invalid Gemini API key.");
        }
        if (err.message.includes("404")) break;

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
        }
      }
    }
  }

  throw new Error(`AI generation failed: ${lastError?.message || "Unknown error"}`);
}

async function callGeminiAPI(apiKey, prompt, systemInstruction, model) {
  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini error (${res.status}): ${err?.error?.message || res.statusText}`);
  }

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

console.log("Auto MCQ Solver: Background service worker started (Proxy & Direct supported)");

// ============================================================
// Background Service Worker - Handles Gemini API Communication
// ============================================================

const GEMINI_MODELS = [
  "gemini-3.8-flash",      // Primary - fast & free
  "gemini-3.8-flash-lite", // Fallback - lighter, less load
];

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000; // Start with 2s, doubles each retry

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
});

/**
 * Get the stored API key from chrome.storage
 */
async function getApiKey() {
  const result = await chrome.storage.local.get(["geminiApiKey"]);
  if (!result.geminiApiKey) {
    throw new Error("API key not set. Please set your Gemini API key in the extension popup.");
  }
  return result.geminiApiKey;
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test if the API key is valid
 */
async function testApiKey(apiKey) {
  try {
    const response = await callGeminiWithRetry(apiKey, "Say 'API key is working!' in exactly those words.");
    if (response) {
      return { success: true, message: "API key is valid!" };
    }
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Call Gemini API with automatic retry and model fallback
 * Tries each model with retries before falling back to the next model
 */
async function callGeminiWithRetry(apiKey, prompt, systemInstruction = null) {
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[Auto MCQ] Trying ${model} (attempt ${attempt}/${MAX_RETRIES})...`);
        const result = await callGeminiAPI(apiKey, prompt, systemInstruction, model);
        console.log(`[Auto MCQ] ✅ Success with ${model}`);
        return result;
      } catch (err) {
        lastError = err;
        console.warn(`[Auto MCQ] ${model} attempt ${attempt} failed: ${err.message}`);

        // Don't retry on auth errors (401/403) - key is wrong
        if (err.message.includes("401") || err.message.includes("403")) {
          throw new Error("Invalid API key. Please check your key in the popup.");
        }

        // Don't retry on 404 - model doesn't exist
        if (err.message.includes("404")) {
          console.warn(`[Auto MCQ] Model ${model} not available, trying next...`);
          break; // Skip to next model
        }

        // For 429 (rate limit) or 503 (overloaded), retry with backoff
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
          console.log(`[Auto MCQ] Retrying in ${delay}ms...`);
          await sleep(delay);
        }
      }
    }
    console.log(`[Auto MCQ] All retries exhausted for ${model}, trying next model...`);
  }

  throw new Error(`All models failed after retries. Last error: ${lastError?.message || "Unknown error"}`);
}

/**
 * Call the Gemini API (single attempt)
 */
async function callGeminiAPI(apiKey, prompt, systemInstruction = null, model = "gemini-3.8-flash") {
  const url = `${API_BASE}/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.1, // Low temperature for factual/accurate answers
      topP: 0.95,
      maxOutputTokens: 4096
    }
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Gemini API error (${response.status}): ${errorData?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/**
 * Main handler: Solve MCQ questions
 */
async function handleSolveQuestions(data) {
  const apiKey = await getApiKey();
  const { questions, videoContext } = data;

  const systemPrompt = `You are an expert quiz solver. Your job is to analyze questions and select the correct answers.

RULES:
- You MUST respond ONLY in valid JSON format, no markdown, no extra text.
- For each question, return the index (0-based) of the correct option(s).
- If there is video/lecture context provided, use it to answer more accurately.
- If you're unsure, pick the most likely correct answer based on your knowledge.
- Be accurate — these are typically educational/course quiz questions.

Response format (strict JSON array):
[
  {
    "questionIndex": 0,
    "selectedOptions": [0],
    "confidence": "high",
    "reasoning": "Brief explanation"
  },
  ...
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

  prompt += "\nAnalyze each question carefully and respond with the JSON array as specified.";

  const responseText = await callGeminiWithRetry(apiKey, prompt, systemPrompt);

  // Parse the JSON response - handle potential markdown wrapping
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
 * Analyze video context (subtitles/transcript)
 */
async function handleAnalyzeVideo(data) {
  const apiKey = await getApiKey();
  const { transcript } = data;

  if (!transcript || !transcript.trim()) {
    return { success: true, summary: "" };
  }

  const systemPrompt = `You are a lecture summarizer. Summarize the key points, facts, definitions, and concepts from this lecture/video transcript. Focus on information that would be asked in a quiz. Be concise but thorough.`;

  const summary = await callGeminiWithRetry(apiKey, transcript, systemPrompt);
  return { success: true, summary };
}

console.log("Auto MCQ Solver: Background service worker started");

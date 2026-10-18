// ============================================================
// Background Service Worker - Handles Gemini API Communication
// ============================================================

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "solveQuestions") {
    handleSolveQuestions(request.data)
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keep the message channel open for async response
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
 * Test if the API key is valid
 */
async function testApiKey(apiKey) {
  try {
    const response = await callGeminiAPI(apiKey, "Say 'API key is working!' in exactly those words.");
    if (response) {
      return { success: true, message: "API key is valid!" };
    }
  } catch (err) {
    return { success: false, message: `Invalid API key: ${err.message}` };
  }
}

/**
 * Call the Gemini API
 */
async function callGeminiAPI(apiKey, prompt, systemInstruction = null) {
  const url = `${GEMINI_API_URL}?key=${apiKey}`;

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

  const responseText = await callGeminiAPI(apiKey, prompt, systemPrompt);

  // Parse the JSON response - handle potential markdown wrapping
  let answers;
  try {
    // Try direct parse first
    answers = JSON.parse(responseText);
  } catch {
    // Try extracting JSON from markdown code blocks
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

  const summary = await callGeminiAPI(apiKey, transcript, systemPrompt);
  return { success: true, summary };
}

// Log when service worker starts
console.log("Auto MCQ Solver: Background service worker started");

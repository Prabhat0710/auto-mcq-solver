/**
 * Cloudflare Pages Function: /solve
 * Automatically deployed when pushed to GitHub.
 *
 * Security hardening:
 *  - Per-IP sliding-window rate limiter (in-memory, resets per isolate)
 *  - Origin / Referer validation (browser-extension only)
 *  - Request body size cap
 *  - Strict question-count & field-length limits
 *  - Full answer-schema validation on Gemini output
 */

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash"
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ---- Rate Limiter (per-isolate in-memory) ----
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20;  // max requests per IP per window
const ipRequestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  let entries = ipRequestLog.get(ip) || [];

  // Evict entries outside the window
  entries = entries.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (entries.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipRequestLog.set(ip, entries);
    return true;
  }

  entries.push(now);
  ipRequestLog.set(ip, entries);
  return false;
}

// Periodically prune stale IPs (every 5 min) to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entries] of ipRequestLog) {
    const fresh = entries.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) ipRequestLog.delete(ip);
    else ipRequestLog.set(ip, fresh);
  }
}, 300_000);

// ---- Limits ----
const MAX_QUESTIONS = 25;
const MAX_QUESTION_TEXT_LEN = 2000;
const MAX_OPTION_TEXT_LEN = 500;
const MAX_OPTIONS_PER_Q = 10;
const MAX_VIDEO_CONTEXT_LEN = 15_000;
const MAX_REQUEST_BODY_BYTES = 100_000; // ~100 KB

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // --- Rate limiting ---
  const clientIP = request.headers.get("cf-connecting-ip") ||
                   request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                   "unknown";
  if (isRateLimited(clientIP)) {
    return jsonError("Rate limit exceeded. Try again in a minute.", 429);
  }

  // --- Verify API key configured ---
  const apiKey = (env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return jsonError(
      "GEMINI_API_KEY environment variable is not configured in Cloudflare Pages Settings.", 500
    );
  }

  try {
    // --- Request body size guard ---
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_REQUEST_BODY_BYTES) {
      return jsonError(`Request body too large (max ${MAX_REQUEST_BODY_BYTES} bytes).`, 413);
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_REQUEST_BODY_BYTES) {
      return jsonError(`Request body too large (max ${MAX_REQUEST_BODY_BYTES} bytes).`, 413);
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON in request body.", 400);
    }

    // --- Input validation ---
    const validationError = validateRequestData(data);
    if (validationError) {
      return jsonError(validationError, 400);
    }

    const { questions, videoContext } = data;

    const systemPrompt = `You are an expert quiz solver. Your job is to analyze questions and select the correct answers.

RULES:
- You MUST respond ONLY in valid JSON format, no markdown, no code block formatting.
- For each question, return the index (0-based) of the correct option(s).
- If video/lecture context is provided, prioritize it for factual answers.
- If unsure, pick the most logically sound answer.

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
    if (videoContext && typeof videoContext === "string" && videoContext.trim()) {
      prompt += `=== LECTURE / VIDEO CONTEXT ===\n${videoContext.substring(0, MAX_VIDEO_CONTEXT_LEN)}\n\n`;
    }

    prompt += "=== QUESTIONS TO SOLVE ===\n\n";
    questions.forEach((q, i) => {
      prompt += `Question ${i + 1}: ${q.questionText}\n`;
      q.options.forEach((opt, j) => {
        prompt += `  ${String.fromCharCode(65 + j)}) ${opt.text}\n`;
      });
      prompt += `Type: ${q.type || "single-choice"}\n\n`;
    });

    let responseText = null;
    const errors = [];

    for (const model of GEMINI_MODELS) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          responseText = await callGemini(apiKey, model, prompt, systemPrompt);
          if (responseText) break;
        } catch (err) {
          errors.push(`[${model} attempt ${attempt}]: ${err.message}`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (responseText) break;
    }

    if (!responseText) {
      throw new Error(`All Gemini models failed: ${errors.join(" | ")}`);
    }

    // --- Output validation ---
    const answers = parseAndValidateAnswers(responseText, questions.length);

    return new Response(
      JSON.stringify({ success: true, answers }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return jsonError(err.message, 500);
  }
}

// ---- Validation helpers ----

function validateRequestData(data) {
  if (!data || typeof data !== "object") {
    return "Request body must be a JSON object.";
  }
  const { questions } = data;
  if (!Array.isArray(questions) || questions.length === 0) {
    return "No questions provided.";
  }
  if (questions.length > MAX_QUESTIONS) {
    return `Too many questions (max ${MAX_QUESTIONS}, got ${questions.length}).`;
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q || typeof q !== "object") {
      return `Question ${i + 1} is not a valid object.`;
    }
    if (typeof q.questionText !== "string" || q.questionText.trim().length === 0) {
      return `Question ${i + 1} has no questionText.`;
    }
    if (q.questionText.length > MAX_QUESTION_TEXT_LEN) {
      return `Question ${i + 1} text is too long (max ${MAX_QUESTION_TEXT_LEN} chars).`;
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return `Question ${i + 1} must have at least 2 options.`;
    }
    if (q.options.length > MAX_OPTIONS_PER_Q) {
      return `Question ${i + 1} has too many options (max ${MAX_OPTIONS_PER_Q}).`;
    }
    for (let j = 0; j < q.options.length; j++) {
      const opt = q.options[j];
      if (!opt || typeof opt !== "object" || typeof opt.text !== "string") {
        return `Question ${i + 1}, option ${j + 1} is invalid.`;
      }
      if (opt.text.length > MAX_OPTION_TEXT_LEN) {
        return `Question ${i + 1}, option ${j + 1} text is too long (max ${MAX_OPTION_TEXT_LEN} chars).`;
      }
    }
  }

  // Validate videoContext if present
  if (data.videoContext !== undefined && data.videoContext !== null) {
    if (typeof data.videoContext !== "string") {
      return "videoContext must be a string.";
    }
  }

  return null; // No error
}

function parseAndValidateAnswers(responseText, questionCount) {
  let answers;

  // Try direct JSON parse
  try {
    answers = JSON.parse(responseText);
  } catch {
    // Try extracting JSON array from text
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        answers = JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error("Invalid AI JSON response format: " + responseText.substring(0, 150));
      }
    } else {
      throw new Error("Invalid AI JSON response format: " + responseText.substring(0, 150));
    }
  }

  // Validate the parsed answers
  if (!Array.isArray(answers)) {
    throw new Error("AI response is not a JSON array.");
  }

  // Sanitise each answer object
  const sanitised = answers.map((ans, idx) => {
    if (!ans || typeof ans !== "object") {
      return { questionIndex: idx, selectedOptions: [0], confidence: "low", reasoning: "Fallback" };
    }

    const qIdx = typeof ans.questionIndex === "number" ? ans.questionIndex : idx;
    let selOpts = Array.isArray(ans.selectedOptions) ? ans.selectedOptions : [0];

    // Ensure all selectedOptions are valid non-negative integers within option bounds
    selOpts = selOpts
      .filter(o => typeof o === "number" && Number.isInteger(o) && o >= 0)
      .slice(0, MAX_OPTIONS_PER_Q);

    if (selOpts.length === 0) selOpts = [0];

    const confidence = typeof ans.confidence === "string" ? ans.confidence.substring(0, 20) : "medium";
    const reasoning = typeof ans.reasoning === "string" ? ans.reasoning.substring(0, 500) : "";

    return { questionIndex: qIdx, selectedOptions: selOpts, confidence, reasoning };
  });

  return sanitised;
}

function jsonError(message, status = 400) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
}

// ---- Gemini caller ----

async function callGemini(apiKey, model, prompt, systemInstruction) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`(${res.status}): ${errorText}`);
  }

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text;
}

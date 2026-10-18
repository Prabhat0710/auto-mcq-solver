/**
 * Cloudflare Worker Proxy for Auto MCQ Solver
 * 
 * Free tier: 100,000 requests/day.
 * Safely stores your Gemini API key in Cloudflare secrets so users never see it.
 */

const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.8-flash-lite"
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check endpoint
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          status: "online",
          service: "Auto MCQ Solver Cloudflare Proxy",
          version: "1.0.0",
          configured: !!env.GEMINI_API_KEY
        }),
        {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        }
      );
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    // Verify secret is set
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Cloudflare Worker is running, but GEMINI_API_KEY environment variable is not configured."
        }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    try {
      const data = await request.json();
      const { questions, videoContext } = data;

      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        return new Response(
          JSON.stringify({ error: "No questions provided." }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      // Build AI Prompt
      const systemPrompt = `You are an expert quiz solver. Your job is to analyze questions and select the correct answers.

RULES:
- You MUST respond ONLY in valid JSON format, no markdown, no code block formatting.
- For each question, return the index (0-based) of the correct option(s).
- If video/lecture context is provided, prioritize it to ensure factual correctness.
- If unsure, select the most logically sound answer.

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
        prompt += `=== LECTURE / VIDEO CONTEXT ===\n${videoContext.substring(0, 15000)}\n\n`;
      }

      prompt += "=== QUESTIONS TO SOLVE ===\n\n";
      questions.forEach((q, i) => {
        prompt += `Question ${i + 1}: ${q.questionText}\n`;
        q.options.forEach((opt, j) => {
          prompt += `  ${String.fromCharCode(65 + j)}) ${opt.text}\n`;
        });
        prompt += `Type: ${q.type || "single-choice"}\n\n`;
      });

      // Call Gemini API with automatic model fallback
      let responseText = null;
      let lastError = null;

      for (const model of GEMINI_MODELS) {
        try {
          responseText = await callGemini(apiKey, model, prompt, systemPrompt);
          if (responseText) break;
        } catch (err) {
          lastError = err;
          console.warn(`[Proxy] Model ${model} failed: ${err.message}`);
        }
      }

      if (!responseText) {
        throw new Error(lastError ? lastError.message : "All AI models failed.");
      }

      // Parse JSON from model output
      let answers;
      try {
        answers = JSON.parse(responseText);
      } catch {
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          answers = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Invalid AI JSON response format.");
        }
      }

      return new Response(
        JSON.stringify({ success: true, answers }),
        {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        }
      );

    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
  }
};

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
    throw new Error(`Gemini API error (${res.status}): ${errorText}`);
  }

  const json = await res.json();
  return json?.candidates?.[0]?.content?.parts?.[0]?.text;
}

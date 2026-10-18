/**
 * Cloudflare Pages Function: /solve
 * Automatically deployed when pushed to GitHub.
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

export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Verify secret is configured
  const apiKey = (env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "GEMINI_API_KEY environment variable is not configured in Cloudflare Pages Settings."
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

    let answers;
    try {
      answers = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        answers = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Invalid AI JSON response format: " + responseText.substring(0, 150));
      }
    }

    return new Response(
      JSON.stringify({ success: true, answers }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
}

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

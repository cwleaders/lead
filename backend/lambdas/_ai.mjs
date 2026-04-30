/* Shared AI provider router.
   Strategy:  Gemini Flash → Groq Llama → Claude Sonnet → Mock (deterministic).
   Local models (Whisper/CLIP/Tesseract) run on the user's machine and never
   touch this code path — they cost zero credits.

   Each call returns:
     {
       text:     string,
       provider: 'gemini' | 'groq' | 'claude' | 'mock',
       creditsUsed: number,
       latencyMs: number
     }

   Required env vars (any one provider works; missing = skip + try next):
     GEMINI_API_KEY     (https://aistudio.google.com/apikey — generous free tier)
     GROQ_API_KEY       (https://console.groq.com — free tier 30 RPM)
     CLAUDE_API_KEY     (https://console.anthropic.com — premium)
*/

import { withBreaker, fetchWithTimeout } from './_breaker.mjs';

const COSTS = {
  gemini: { in: 0.000075,  out: 0.0003   },   // $/1K tokens — Flash
  groq:   { in: 0.00,      out: 0.00      },  // free tier
  claude: { in: 0.003,     out: 0.015     },  // Sonnet 4.6
  mock:   { in: 0.0,       out: 0.0       },
};

// 1 credit ≈ 1K tokens of model use (rough but legible to users)
function tokensToCredits(inTok, outTok, provider) {
  const c = COSTS[provider];
  const dollars = (inTok/1000)*c.in + (outTok/1000)*c.out;
  // 1 credit = $0.0001 of provider spend, floor at 1 per call
  return Math.max(1, Math.ceil(dollars / 0.0001));
}

async function tryGemini(prompt, system, opts) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const t0 = Date.now();
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: opts?.temperature ?? 0.4, maxOutputTokens: opts?.maxTokens ?? 1024 },
  };
  try {
    return await withBreaker('gemini', async () => {
      const r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
        9000
      );
      if (!r.ok) throw new Error('gemini ' + r.status);
      const data = await r.json();
      const text = data.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || '';
      const inTok = data.usageMetadata?.promptTokenCount || 0;
      const outTok = data.usageMetadata?.candidatesTokenCount || 0;
      return { text, provider: 'gemini', creditsUsed: tokensToCredits(inTok, outTok, 'gemini'), latencyMs: Date.now()-t0 };
    });
  } catch (err) {
    console.warn('gemini skipped:', err.message);
    return null;
  }
}

async function tryGroq(prompt, system, opts) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const t0 = Date.now();
  try {
    return await withBreaker('groq', async () => {
      const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: opts?.temperature ?? 0.4,
          max_tokens: opts?.maxTokens ?? 1024,
        }),
      }, 9000);
      if (!r.ok) throw new Error('groq ' + r.status);
      const data = await r.json();
      const text = data.choices?.[0]?.message?.content || '';
      const inTok = data.usage?.prompt_tokens || 0;
      const outTok = data.usage?.completion_tokens || 0;
      return { text, provider: 'groq', creditsUsed: tokensToCredits(inTok, outTok, 'groq'), latencyMs: Date.now()-t0 };
    });
  } catch (err) {
    console.warn('groq skipped:', err.message);
    return null;
  }
}

async function tryClaude(prompt, system, opts) {
  const key = process.env.CLAUDE_API_KEY;
  if (!key) return null;
  const t0 = Date.now();
  try {
    return await withBreaker('claude', async () => {
      const r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: opts?.maxTokens ?? 1024,
          temperature: opts?.temperature ?? 0.4,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      }, 12000);
      if (!r.ok) throw new Error('claude ' + r.status);
      const data = await r.json();
      const text = data.content?.[0]?.text || '';
      const inTok = data.usage?.input_tokens || 0;
      const outTok = data.usage?.output_tokens || 0;
      return { text, provider: 'claude', creditsUsed: tokensToCredits(inTok, outTok, 'claude'), latencyMs: Date.now()-t0 };
    });
  } catch (err) {
    console.warn('claude skipped:', err.message);
    return null;
  }
}

function mockResponse(prompt, system, opts) {
  // Deterministic-ish mock so the UX flow works even with no API keys configured.
  // Identifies whether the prompt asks for JSON and synthesizes appropriate output.
  const wantsJson = /json|return.*\[|return.*\{/i.test(prompt) || /json/i.test(system || '');
  if (wantsJson) {
    return {
      text: '[]',
      provider: 'mock',
      creditsUsed: 1,
      latencyMs: 5,
      _hint: 'Add GEMINI_API_KEY (free tier at aistudio.google.com) to get real AI responses.'
    };
  }
  const oneLiner = `Here's a quick take on what you sent.
(Mock response — real AI activates the moment you set GEMINI_API_KEY.)

Prompt was about: "${prompt.slice(0, 100)}…"

Suggested next step: Add an API key to your Lambda env vars to unlock real model output.`;
  return { text: oneLiner, provider: 'mock', creditsUsed: 1, latencyMs: 5 };
}

/** Run a prompt through the cheapest available provider. */
export async function aiCall({ prompt, system, temperature, maxTokens } = {}) {
  if (!prompt) throw new Error('prompt required');
  const opts = { temperature, maxTokens };
  return (
    (await tryGemini(prompt, system, opts)) ||
    (await tryGroq(prompt, system, opts))   ||
    (await tryClaude(prompt, system, opts)) ||
    mockResponse(prompt, system, opts)
  );
}

/** Premium-quality call (Claude first when budget matters less than quality). */
export async function aiCallPremium({ prompt, system, temperature, maxTokens } = {}) {
  if (!prompt) throw new Error('prompt required');
  const opts = { temperature, maxTokens };
  return (
    (await tryClaude(prompt, system, opts)) ||
    (await tryGemini(prompt, system, opts)) ||
    (await tryGroq(prompt, system, opts))   ||
    mockResponse(prompt, system, opts)
  );
}

/** Try to extract a JSON object/array from a model response that may have prose around it. */
export function extractJson(text) {
  if (!text) return null;
  const tryParse = s => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(text);
  if (parsed) return parsed;
  // Strip markdown code fence
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    parsed = tryParse(fenced[1].trim());
    if (parsed) return parsed;
  }
  // Find first { or [ and try to parse from there
  const idx = text.search(/[\[{]/);
  if (idx >= 0) {
    const tail = text.slice(idx);
    parsed = tryParse(tail);
    if (parsed) return parsed;
  }
  return null;
}

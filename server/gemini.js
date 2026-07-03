const fetch = require('node-fetch');

// Fallback model chain — tries each until one works
const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
];

function getApiUrl(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

/**
 * Analyzes a face image and generates fighter stats using Gemini Vision API.
 * @param {string} base64Image - Base64 encoded image (without data URL prefix)
 * @param {string} mimeType - e.g., 'image/jpeg' or 'image/png'
 * @returns {Object} Fighter stats JSON
 */
async function analyzeFaceForStats(base64Image, mimeType = 'image/jpeg') {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.warn('[GEMINI] No real API key. Returning mock stats.');
    return getMockStats();
  }

  const prompt = `You are an AI fighting game character generator for a game called MECH ARENA. 
Analyze this face image carefully and generate unique fighter stats based on the person's appearance, expression, and energy.
Return ONLY valid JSON with no additional text, no markdown, no code blocks. Just pure JSON:
{
  "power": <integer between 60 and 95>,
  "speed": <integer between 60 and 95>,
  "defense": <integer between 60 and 95>,
  "special_move": "<creative unique special move name based on face analysis>",
  "element": "<one of: fire, ice, lightning, shadow, earth, wind, plasma, void>",
  "fighter_title": "<a dramatic fighter title like 'The Iron Fist' or 'Shadow Striker'>",
  "backstory": "<one dramatic sentence about this fighter's origin>"
}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image
            }
          },
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 512
    }
  };

  // Try each model in fallback order
  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      console.log(`[GEMINI] Trying model: ${model}`);
      const response = await fetch(`${getApiUrl(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const status = response.status;

        if (status === 429) {
          console.warn(`[GEMINI] Rate limited on ${model}, trying next...`);
          lastError = new Error('RATE_LIMIT');
          continue; // try next model
        }
        if (status === 404) {
          console.warn(`[GEMINI] Model ${model} not found, trying next...`);
          lastError = new Error('NOT_FOUND');
          continue;
        }
        throw new Error(`Gemini API error ${status}: ${JSON.stringify(errJson)}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini returned empty response');

      console.log(`[GEMINI] Success with model: ${model}`);

      // Strip markdown code fences if present
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const stats = JSON.parse(cleaned);

      // Validate and clamp values
      return {
        power: clamp(stats.power, 60, 95),
        speed: clamp(stats.speed, 60, 95),
        defense: clamp(stats.defense, 60, 95),
        special_move: stats.special_move || 'Phantom Strike',
        element: validateElement(stats.element),
        fighter_title: stats.fighter_title || 'The Unknown',
        backstory: stats.backstory || 'A warrior of mystery.'
      };

    } catch (err) {
      if (err.message === 'RATE_LIMIT' || err.message === 'NOT_FOUND') {
        lastError = err;
        continue;
      }
      throw err; // real error, don't retry
    }
  }

  // All models failed — use mock stats with a warning
  console.warn('[GEMINI] All models failed, using mock stats. Last error:', lastError?.message);
  return getMockStats();
}

/**
 * Generates MK-style announcer commentary for a KO using Gemini text API.
 * @param {string} winnerName - Name of the winner
 * @param {string} loserName - Name of the loser
 * @returns {string} Announcer line
 */
async function generateKOCommentary(winnerName, loserName) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    const lines = [
      `${winnerName.toUpperCase()} WINS! FLAWLESS VICTORY!`,
      `FINISH HIM! ${winnerName.toUpperCase()} DOMINATES!`,
      `K.O.! ${winnerName.toUpperCase()} IS UNSTOPPABLE!`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  const prompt = `You are the announcer for a brutal fighting game called MECH ARENA, inspired by Mortal Kombat.
Generate a single dramatic, over-the-top announcer line (max 15 words) for when "${winnerName}" defeats "${loserName}".
Include classic MK phrases. Be dramatic, fierce, and epic.
Return ONLY the announcer line text, nothing else.`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 64 }
  };

  // Try each model in fallback order
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(`${getApiUrl(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429 || status === 404) continue;
        break;
      }

      const data = await response.json();
      const line = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (line) return line;
    } catch (e) {
      continue;
    }
  }

  return `${winnerName.toUpperCase()} WINS! FLAWLESS VICTORY!`;
}

function clamp(val, min, max) {
  const num = parseInt(val) || min;
  return Math.min(Math.max(num, min), max);
}

function validateElement(el) {
  const valid = ['fire', 'ice', 'lightning', 'shadow', 'earth', 'wind', 'plasma', 'void'];
  return valid.includes(el) ? el : valid[Math.floor(Math.random() * valid.length)];
}

function getMockStats() {
  const elements = ['fire', 'ice', 'lightning', 'shadow', 'earth', 'wind', 'plasma', 'void'];
  const moves = ['Dragon Uppercut', 'Shadow Kick', 'Plasma Burst', 'Ice Spear', 'Earth Slam', 'Thunder Clap'];
  const titles = ['The Iron Fist', 'Shadow Striker', 'The Phantom', 'Stone Breaker', 'The Tempest'];
  return {
    power: Math.floor(Math.random() * 36) + 60,
    speed: Math.floor(Math.random() * 36) + 60,
    defense: Math.floor(Math.random() * 36) + 60,
    special_move: moves[Math.floor(Math.random() * moves.length)],
    element: elements[Math.floor(Math.random() * elements.length)],
    fighter_title: titles[Math.floor(Math.random() * titles.length)],
    backstory: 'A warrior forged in the fires of battle, seeking ultimate glory.'
  };
}

module.exports = { analyzeFaceForStats, generateKOCommentary };

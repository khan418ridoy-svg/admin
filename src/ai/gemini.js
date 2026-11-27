
/**
 * Gemini AI Service
 *
 * Responsibilities:
 * - Gemini API key management
 * - Model fallback
 * - API request handling
 * - Retry handling
 * - Response extraction
 *
 * Prompts must remain outside this file.
 * Node.js 20+ built-in fetch is used.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const REQUEST_TIMEOUT_MS = 30000;

const MAX_OUTPUT_TOKENS = 4096;

function createGeminiError(
  message,
  status = 500,
  details = {}
) {
  const error = new Error(message);

  error.status = status;
  error.details = details;

  return error;
}

function parseList(value) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
    )
  ];
}

/**
 * API Keys
 *
 * Supported:
 *
 * GEMINI_API_KEYS=key1,key2,key3
 *
 * Or:
 *
 * GEMINI_API_KEY_1=key1
 * GEMINI_API_KEY_2=key2
 * GEMINI_API_KEY_3=key3
 */
function getApiKeys() {
  const keys = [
    ...parseList(process.env.GEMINI_API_KEYS)
  ];

  for (let i = 1; i <= 20; i++) {
    const key = process.env[
      `GEMINI_API_KEY_${i}`
    ]?.trim();

    if (key) {
      keys.push(key);
    }
  }

  if (process.env.GEMINI_API_KEY?.trim()) {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }

  const uniqueKeys = [...new Set(keys)];

  if (uniqueKeys.length === 0) {
    throw createGeminiError(
      "No Gemini API keys configured",
      503
    );
  }

  return uniqueKeys;
}

/**
 * Models
 *
 * Configure model priority in .env:
 *
 * GEMINI_MODELS=model-one,model-two,model-three
 *
 * The first available model is tried first.
 */
function getModels() {
  const models = parseList(
    process.env.GEMINI_MODELS
  );

  if (models.length === 0) {
    throw createGeminiError(
      "GEMINI_MODELS is not configured",
      503
    );
  }

  return models;
}

function normalizePrompt(prompt) {
  if (
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {
    throw createGeminiError(
      "Gemini prompt must be a non-empty string",
      400
    );
  }

  if (prompt.length > 100000) {
    throw createGeminiError(
      "Gemini prompt is too large",
      400
    );
  }

  return prompt.trim();
}

function normalizeGenerationConfig(options = {}) {
  const temperature =
    options.temperature ?? 0.7;

  const maxOutputTokens =
    options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;

  if (
    typeof temperature !== "number" ||
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 2
  ) {
    throw createGeminiError(
      "Temperature must be between 0 and 2",
      400
    );
  }

  if (
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > 8192
  ) {
    throw createGeminiError(
      "maxOutputTokens must be between 1 and 8192",
      400
    );
  }

  return {
    temperature,
    maxOutputTokens
  };
}

function extractText(data) {
  const candidates = data?.candidates;

  if (!Array.isArray(candidates) || !candidates.length) {
    throw createGeminiError(
      "Gemini returned no candidates",
      502
    );
  }

  const parts =
    candidates[0]?.content?.parts || [];

  const text = parts
    .filter(part => typeof part.text === "string")
    .map(part => part.text)
    .join("")
    .trim();

  if (!text) {
    throw createGeminiError(
      "Gemini returned an empty response",
      502
    );
  }

  return text;
}

function shouldRetryStatus(status) {
  return [
    400,
    401,
    403,
    404,
    408,
    429,
    500,
    502,
    503,
    504
  ].includes(status);
}

async function requestGemini({
  apiKey,
  model,
  prompt,
  generationConfig
}) {
  const url =
    `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS
      ),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: generationConfig.temperature,
          maxOutputTokens:
            generationConfig.maxOutputTokens
        }
      })
    });
  } catch (error) {
    throw createGeminiError(
      error.name === "TimeoutError" ||
      error.name === "AbortError"
        ? "Gemini request timed out"
        : "Unable to connect to Gemini API",
      503
    );
  }

  const responseText = await response.text();

  let data;

  try {
    data = responseText
      ? JSON.parse(responseText)
      : {};
  } catch {
    throw createGeminiError(
      "Gemini returned an invalid JSON response",
      502
    );
  }

  if (!response.ok) {
    const apiMessage =
      data?.error?.message ||
      "Gemini API request failed";

    throw createGeminiError(
      apiMessage,
      response.status,
      {
        model,
        retryable: shouldRetryStatus(response.status)
      }
    );
  }

  return extractText(data);
}

/**
 * Generate Text
 *
 * Tries:
 * 1. First configured model + first API key
 * 2. Same model + next API key
 * 3. Next model + available API keys
 *
 * Returns generated plain text.
 */
export async function generateGeminiText(
  prompt,
  options = {}
) {
  const normalizedPrompt = normalizePrompt(prompt);

  const generationConfig =
    normalizeGenerationConfig(options);

  const apiKeys = getApiKeys();
  const models = getModels();

  const failures = [];

  for (const model of models) {
    for (let index = 0; index < apiKeys.length; index++) {
      const apiKey = apiKeys[index];

      try {
        const result = await requestGemini({
          apiKey,
          model,
          prompt: normalizedPrompt,
          generationConfig
        });

        return {
          success: true,
          text: result,
          model,
          keyIndex: index + 1
        };
      } catch (error) {
        const status = Number(error.status) || 500;

        failures.push({
          model,
          keyIndex: index + 1,
          status,
          message: error.message
        });

        console.error(
          `[Gemini] Failed: model=${model}, keyIndex=${index + 1}, status=${status}`
        );

        if (!error.details?.retryable &&
            !shouldRetryStatus(status)) {
          throw error;
        }
      }
    }
  }

  console.error(
    `[Gemini] All models and API keys failed. Attempts: ${failures.length}`
  );

  throw createGeminiError(
    "All Gemini models and API keys failed",
    503,
    {
      attempts: failures.length
    }
  );
}

/**
 * Check Gemini Configuration
 *
 * Does not expose API keys.
 */
export function getGeminiConfigStatus() {
  let apiKeyCount = 0;
  let models = [];

  try {
    apiKeyCount = getApiKeys().length;
  } catch {
    apiKeyCount = 0;
  }

  try {
    models = getModels();
  } catch {
    models = [];
  }

  return {
    configured: apiKeyCount > 0 && models.length > 0,
    apiKeyCount,
    models
  };
}

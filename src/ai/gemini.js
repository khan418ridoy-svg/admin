
/**
 * Gemini AI Service
 *
 * Responsibilities:
 * - Gemini API key management
 * - Automatic text model discovery
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
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_MODEL_PAGES = 100;

let modelCache = {
  expiresAt: 0,
  models: null
};

let modelDiscoveryPromise = null;

// --------------------------------------------------
// ERROR
// --------------------------------------------------

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

// --------------------------------------------------
// API KEYS
// --------------------------------------------------

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

  if (!uniqueKeys.length) {
    throw createGeminiError(
      "No Gemini API keys configured",
      503
    );
  }

  return uniqueKeys;
}

// --------------------------------------------------
// HTTP JSON
// --------------------------------------------------

async function fetchJson(url, apiKey) {
  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey
      },
      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS
      )
    });
  } catch (error) {
    throw createGeminiError(
      "Unable to connect to Gemini API",
      503,
      {
        retryable: true
      }
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
      "Gemini returned invalid JSON",
      502,
      {
        retryable: true
      }
    );
  }

  if (!response.ok) {
    throw createGeminiError(
      data?.error?.message ||
        "Gemini API request failed",
      response.status,
      {
        retryable: shouldRetryStatus(
          response.status
        )
      }
    );
  }

  return data;
}

// --------------------------------------------------
// AUTOMATIC MODEL DISCOVERY
// --------------------------------------------------

async function discoverModelsForKey(apiKey, keyIndex) {
  const discovered = [];

  let pageToken = "";
  const usedTokens = new Set();

  for (
    let page = 0;
    page < MAX_MODEL_PAGES;
    page++
  ) {
    const params = new URLSearchParams({
      pageSize: "1000"
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const url =
      `${GEMINI_API_BASE}?${params.toString()}`;

    const data = await fetchJson(url, apiKey);

    const models = Array.isArray(data.models)
      ? data.models
      : [];

    for (const item of models) {
      const methods = Array.isArray(
        item.supportedGenerationMethods
      )
        ? item.supportedGenerationMethods
        : [];

      // Only text-generation capable models.
      if (!methods.includes("generateContent")) {
        continue;
      }

      if (typeof item.name !== "string") {
        continue;
      }

      const model = item.name.replace(
        /^models\//,
        ""
      );

      if (!model) {
        continue;
      }

      discovered.push({
        model,
        keyIndex
      });
    }

    const nextToken = data.nextPageToken;

    if (!nextToken) {
      break;
    }

    if (usedTokens.has(nextToken)) {
      break;
    }

    usedTokens.add(nextToken);
    pageToken = nextToken;
  }

  return discovered;
}

async function discoverTextModels(apiKeys) {
  const modelMap = new Map();
  const discoveryErrors = [];

  for (
    let index = 0;
    index < apiKeys.length;
    index++
  ) {
    try {
      const discovered =
        await discoverModelsForKey(
          apiKeys[index],
          index + 1
        );

      for (const item of discovered) {
        if (!modelMap.has(item.model)) {
          modelMap.set(item.model, {
            model: item.model,
            keyIndexes: []
          });
        }

        const entry = modelMap.get(item.model);

        if (!entry.keyIndexes.includes(item.keyIndex)) {
          entry.keyIndexes.push(item.keyIndex);
        }
      }
    } catch (error) {
      discoveryErrors.push({
        keyIndex: index + 1,
        status: Number(error.status) || 500
      });

      console.error(
        `[Gemini] Model discovery failed for key ${index + 1}: ${error.message}`
      );
    }
  }

  const models = [...modelMap.values()];

  if (!models.length) {
    throw createGeminiError(
      "No text generation models found from Gemini API",
      503,
      {
        discoveryErrors
      }
    );
  }

  return models;
}

async function getTextModels(apiKeys) {
  if (
    modelCache.models &&
    Date.now() < modelCache.expiresAt
  ) {
    return modelCache.models;
  }

  if (modelDiscoveryPromise) {
    return modelDiscoveryPromise;
  }

  modelDiscoveryPromise = discoverTextModels(
    apiKeys
  );

  try {
    const models = await modelDiscoveryPromise;

    modelCache = {
      models,
      expiresAt: Date.now() + MODEL_CACHE_TTL_MS
    };

    return models;
  } finally {
    modelDiscoveryPromise = null;
  }
}

// --------------------------------------------------
// PROMPT VALIDATION
// --------------------------------------------------

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

// --------------------------------------------------
// GENERATION CONFIG
// --------------------------------------------------

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

// --------------------------------------------------
// RESPONSE EXTRACTION
// --------------------------------------------------

function extractText(data) {
  const candidates = data?.candidates;

  if (
    !Array.isArray(candidates) ||
    !candidates.length
  ) {
    throw createGeminiError(
      "Gemini returned no candidates",
      502,
      {
        retryable: true
      }
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
      502,
      {
        retryable: true
      }
    );
  }

  return text;
}

// --------------------------------------------------
// RETRY STATUS
// --------------------------------------------------

function shouldRetryStatus(status) {
  return [
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

// --------------------------------------------------
// GENERATE CONTENT
// --------------------------------------------------

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
          temperature:
            generationConfig.temperature,
          maxOutputTokens:
            generationConfig.maxOutputTokens
        }
      })
    });
  } catch (error) {
    throw createGeminiError(
      "Unable to connect to Gemini API",
      503,
      {
        retryable: true
      }
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
      "Gemini returned invalid JSON",
      502,
      {
        retryable: true
      }
    );
  }

  if (!response.ok) {
    throw createGeminiError(
      data?.error?.message ||
        "Gemini API request failed",
      response.status,
      {
        model,
        retryable: shouldRetryStatus(
          response.status
        )
      }
    );
  }

  return extractText(data);
}

// --------------------------------------------------
// MAIN TEXT GENERATION
// --------------------------------------------------

export async function generateGeminiText(
  prompt,
  options = {}
) {
  const normalizedPrompt =
    normalizePrompt(prompt);

  const generationConfig =
    normalizeGenerationConfig(options);

  const apiKeys = getApiKeys();

  const models = await getTextModels(apiKeys);

  const failures = [];

  // Try every discovered text model.
  // Each model is tried with the API keys
  // that discovered that model.

  for (const entry of models) {
    for (const keyIndex of entry.keyIndexes) {
      const apiKey = apiKeys[keyIndex - 1];

      try {
        const result = await requestGemini({
          apiKey,
          model: entry.model,
          prompt: normalizedPrompt,
          generationConfig
        });

        return {
          success: true,
          text: result,
          model: entry.model,
          keyIndex
        };
      } catch (error) {
        const status =
          Number(error.status) || 500;

        failures.push({
          model: entry.model,
          keyIndex,
          status
        });

        console.error(
          `[Gemini] Failed: model=${entry.model}, keyIndex=${keyIndex}, status=${status}`
        );

        if (
          !error.details?.retryable &&
          !shouldRetryStatus(status)
        ) {
          throw error;
        }
      }
    }
  }

  console.error(
    `[Gemini] All discovered models failed. Attempts: ${failures.length}`
  );

  throw createGeminiError(
    "All Gemini text models and API keys failed",
    503,
    {
      attempts: failures.length
    }
  );
}

// --------------------------------------------------
// CONFIG STATUS
// --------------------------------------------------

export function getGeminiConfigStatus() {
  let apiKeyCount = 0;

  try {
    apiKeyCount = getApiKeys().length;
  } catch {
    apiKeyCount = 0;
  }

  return {
    configured: apiKeyCount > 0,
    apiKeyCount,
    modelDiscovery: "automatic",
    models: []
  };
}


/**
 * Gemini AI Service
 *
 * Responsibilities:
 * - Gemini API key management
 * - Automatic model discovery
 * - Real text-generation model testing
 * - Working model and API key detection
 * - Automatic fallback
 * - Model test result caching
 * - Gemini response extraction
 *
 * Prompts must remain outside this file.
 * Uses Node.js built-in fetch.
 */

import { createHash } from "node:crypto";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const REQUEST_TIMEOUT_MS = 30000;
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_MODEL_PAGES = 100;

const TEST_PROMPT =
  "Reply with exactly this text: TEST_OK";

const TEST_MAX_OUTPUT_TOKENS = 32;
const MAX_OUTPUT_TOKENS = 4096;

let modelCache = {
  expiresAt: 0,
  keySignature: "",
  models: null,
  diagnostics: null
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
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
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

  const singleKey =
    process.env.GEMINI_API_KEY?.trim();

  if (singleKey) {
    keys.push(singleKey);
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

function getKeySignature(apiKeys) {
  return createHash("sha256")
    .update(apiKeys.join("|"))
    .digest("hex");
}

// --------------------------------------------------
// HTTP REQUEST
// --------------------------------------------------

async function requestJson({
  url,
  apiKey,
  method = "GET",
  body
}) {
  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      ...(body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT_MS
      )
    });
  } catch (error) {
    throw createGeminiError(
      "Unable to connect to Gemini API",
      503,
      {
        retryable: true,
        cause: error.message
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
        `Gemini API request failed: HTTP ${response.status}`,
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
// MODEL DISCOVERY
// --------------------------------------------------

async function discoverModelsForKey(
  apiKey,
  keyIndex
) {
  const discovered = new Map();

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

    const data = await requestJson({
      url,
      apiKey
    });

    const models = Array.isArray(data.models)
      ? data.models
      : [];

    for (const item of models) {
      const methods = Array.isArray(
        item.supportedGenerationMethods
      )
        ? item.supportedGenerationMethods
        : [];

      if (!methods.includes("generateContent")) {
        continue;
      }

      if (typeof item.name !== "string") {
        continue;
      }

      const modelName = item.name.replace(
        /^models\//,
        ""
      );

      if (!modelName) {
        continue;
      }

      // Only Gemini models are considered.
      // Other model families are excluded.
      if (!modelName.startsWith("gemini-")) {
        continue;
      }

      if (!discovered.has(modelName)) {
        discovered.set(modelName, {
          model: modelName,
          displayName:
            item.displayName || modelName,
          description:
            item.description || "",
          keyIndex
        });
      }
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

  return [...discovered.values()];
}

// --------------------------------------------------
// TEXT EXTRACTION
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
    .filter(part =>
      typeof part.text === "string"
    )
    .map(part => part.text)
    .join("")
    .trim();

  if (!text) {
    throw createGeminiError(
      "Model did not return a text response",
      502,
      {
        retryable: true
      }
    );
  }

  return text;
}

// --------------------------------------------------
// GENERATION REQUEST
// --------------------------------------------------

async function requestGemini({
  apiKey,
  model,
  prompt,
  temperature,
  maxOutputTokens
}) {
  const url =
    `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const data = await requestJson({
    url,
    apiKey,
    method: "POST",
    body: {
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
        temperature,
        maxOutputTokens
      }
    }
  });

  return extractText(data);
}

// --------------------------------------------------
// MODEL TESTER
// --------------------------------------------------

async function testModel({
  model,
  apiKey,
  keyIndex
}) {
  const startedAt = Date.now();

  try {
    const text = await requestGemini({
      apiKey,
      model,
      prompt: TEST_PROMPT,
      temperature: 0,
      maxOutputTokens: TEST_MAX_OUTPUT_TOKENS
    });

    const durationMs = Date.now() - startedAt;

    console.log(
      `[Gemini] Working: model=${model}, keyIndex=${keyIndex}, duration=${durationMs}ms`
    );

    return {
      success: true,
      model,
      keyIndex,
      durationMs,
      testedAt: new Date().toISOString()
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const status = Number(error.status) || 500;

    console.warn(
      `[Gemini] Failed: model=${model}, keyIndex=${keyIndex}, status=${status}, duration=${durationMs}ms`
    );

    return {
      success: false,
      model,
      keyIndex,
      status,
      durationMs,
      error: error.message,
      testedAt: new Date().toISOString()
    };
  }
}

// --------------------------------------------------
// AUTOMATIC MODEL TESTING
// --------------------------------------------------


async function discoverAndTestModels(apiKeys) {
  const modelMap = new Map();

  const diagnostics = {
    totalKeys: apiKeys.length,
    successfulKeys: 0,
    failedKeys: 0,
    discoveredModels: 0,
    testedModels: 0,
    workingModels: 0,
    failedModels: 0,
    keyErrors: [],
    modelResults: []
  };

  // Step 1: Discover models from all API keys.
  for (
    let index = 0;
    index < apiKeys.length;
    index++
  ) {
    const keyIndex = index + 1;

    try {
      const discovered =
        await discoverModelsForKey(
          apiKeys[index],
          keyIndex
        );

      diagnostics.successfulKeys++;

      for (const item of discovered) {
        if (!modelMap.has(item.model)) {
          modelMap.set(item.model, {
            model: item.model,
            displayName: item.displayName,
            description: item.description,
            keyIndexes: []
          });
        }

        const entry = modelMap.get(item.model);

        if (!entry.keyIndexes.includes(keyIndex)) {
          entry.keyIndexes.push(keyIndex);
        }
      }

      console.log(
        `[Gemini] Discovered ${discovered.length} models using key ${keyIndex}`
      );
    } catch (error) {
      diagnostics.failedKeys++;

      diagnostics.keyErrors.push({
        keyIndex,
        status: Number(error.status) || 500,
        message: error.message
      });

      console.error(
        `[Gemini] Model discovery failed: keyIndex=${keyIndex}, error=${error.message}`
      );
    }
  }

  const discoveredModels = [
    ...modelMap.values()
  ];

  diagnostics.discoveredModels =
    discoveredModels.length;

  if (!discoveredModels.length) {
    throw createGeminiError(
      "No Gemini text-generation models could be discovered",
      503,
      { diagnostics }
    );
  }

  // Step 2: Test models one by one.
  // Stop immediately after the first successful test.

  for (const entry of discoveredModels) {
    for (const keyIndex of entry.keyIndexes) {
      const apiKey = apiKeys[keyIndex - 1];

      const result = await testModel({
        model: entry.model,
        apiKey,
        keyIndex
      });

      diagnostics.testedModels++;
      diagnostics.modelResults.push(result);

      if (result.success) {
        diagnostics.workingModels = 1;

        const workingModel = {
          model: entry.model,
          displayName: entry.displayName,
          description: entry.description,
          workingKeys: [
            {
              keyIndex,
              durationMs: result.durationMs
            }
          ]
        };

        console.log(
          `[Gemini] First working model found. Stopping tests: model=${entry.model}, keyIndex=${keyIndex}`
        );

        return {
          workingModels: [workingModel],
          diagnostics
        };
      }

      diagnostics.failedModels++;
    }
  }

  // No model passed the real generation test.

  throw createGeminiError(
    "No Gemini model passed the real text-generation test",
    503,
    { diagnostics }
  );
}


// --------------------------------------------------
// GET WORKING MODELS
// --------------------------------------------------

async function getWorkingModels(apiKeys) {
  const keySignature =
    getKeySignature(apiKeys);

  if (
    modelCache.models &&
    modelCache.keySignature === keySignature &&
    Date.now() < modelCache.expiresAt
  ) {
    return {
      models: modelCache.models,
      diagnostics: modelCache.diagnostics
    };
  }

  if (modelDiscoveryPromise) {
    const result = await modelDiscoveryPromise;

    return result;
  }

  modelDiscoveryPromise =
    discoverAndTestModels(apiKeys);

  try {
    const result = await modelDiscoveryPromise;

    modelCache = {
      models: result.workingModels,
      diagnostics: result.diagnostics,
      keySignature,
      expiresAt:
        Date.now() + MODEL_CACHE_TTL_MS
    };

    return {
      models: modelCache.models,
      diagnostics: modelCache.diagnostics
    };
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
// RETRY STATUS
// --------------------------------------------------

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

  const {
    models
  } = await getWorkingModels(apiKeys);

  const failures = [];

  // Only models that passed the real text test
  // are used for generation.

  for (const entry of models) {
    for (const keyEntry of entry.workingKeys) {
      const keyIndex = keyEntry.keyIndex;
      const apiKey = apiKeys[keyIndex - 1];

      try {
        const text = await requestGemini({
          apiKey,
          model: entry.model,
          prompt: normalizedPrompt,
          temperature: generationConfig.temperature,
          maxOutputTokens:
            generationConfig.maxOutputTokens
        });

        console.log(
          `[Gemini] Generated successfully: model=${entry.model}, keyIndex=${keyIndex}`
        );

        return {
          success: true,
          text,
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
          `[Gemini] Generation failed: model=${entry.model}, keyIndex=${keyIndex}, status=${status}`
        );

        // Move to the next working model/key
        // when the current model fails.

        if (!shouldRetryStatus(status)) {
          throw error;
        }
      }
    }
  }

  // All previously working combinations failed.
  // Clear cache so the next request can test again.

  modelCache = {
    expiresAt: 0,
    keySignature: "",
    models: null,
    diagnostics: null
  };

  throw createGeminiError(
    "All tested Gemini models failed during generation",
    503,
    {
      attempts: failures.length,
      failures
    }
  );
}

// --------------------------------------------------
// MODEL TEST STATUS
// --------------------------------------------------

export async function getGeminiModelStatus({
  forceRefresh = false
} = {}) {
  const apiKeys = getApiKeys();

  if (forceRefresh) {
    modelCache = {
      expiresAt: 0,
      keySignature: "",
      models: null,
      diagnostics: null
    };
  }

  const {
    models,
    diagnostics
  } = await getWorkingModels(apiKeys);

  return {
    success: true,
    cacheExpiresAt: modelCache.expiresAt,
    totalWorkingModels: models.length,
    models: models.map(entry => ({
      model: entry.model,
      displayName: entry.displayName,
      description: entry.description,
      workingKeyCount: entry.workingKeys.length,
      workingKeys: entry.workingKeys.map(
        item => item.keyIndex
      )
    })),
    diagnostics
  };
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
    modelTesting: "automatic",
    cacheMinutes: MODEL_CACHE_TTL_MS / 60000,
    models: modelCache.models
      ? modelCache.models.map(item => item.model)
      : []
  };
}

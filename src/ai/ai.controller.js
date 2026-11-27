
import {
  generateGeminiText
} from "./gemini.js";

import {
  buildShortDescriptionPrompt,
  buildFullDescriptionPrompt,
  buildTagsPrompt
} from "../product/product.ai.prompts.js";

import {
  getProduct
} from "../product/product.service.js";

// --------------------------------------------------
// ERROR HANDLING
// --------------------------------------------------

function createAiError(message, status = 500) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendAiError(res, error) {
  const status = Number(error.status) || 500;

  if (status >= 500) {
    console.error("[AI Controller]", error.message);
  }

  return res.status(status).json({
    success: false,
    message:
      status >= 500
        ? "AI generation failed. Please try again."
        : error.message
  });
}

// --------------------------------------------------
// PRODUCT
// --------------------------------------------------

async function getProductForGeneration(productId) {
  if (
    typeof productId !== "string" ||
    !productId.trim()
  ) {
    throw createAiError(
      "Product ID is required",
      400
    );
  }

  return getProduct(productId.trim());
}

// --------------------------------------------------
// RESPONSE
// --------------------------------------------------

function sendAiSuccess(res, productId, field, value, result) {
  res.setHeader("Cache-Control", "no-store");

  return res.json({
    success: true,
    productId,
    field,
    value,
    model: result.model
  });
}

// --------------------------------------------------
// SHORT DESCRIPTION
// --------------------------------------------------

export async function generateShortDescriptionHandler(
  req,
  res
) {
  try {
    const product = await getProductForGeneration(
      req.params.productId
    );

    const prompt =
      buildShortDescriptionPrompt(product);

    const result = await generateGeminiText(
      prompt,
      {
        temperature: 0.7,
        maxOutputTokens: 1024
      }
    );

    return sendAiSuccess(
      res,
      product.id,
      "shortDescription",
      result.text,
      result
    );
  } catch (error) {
    return sendAiError(res, error);
  }
}

// --------------------------------------------------
// FULL DESCRIPTION
// --------------------------------------------------

export async function generateFullDescriptionHandler(
  req,
  res
) {
  try {
    const product = await getProductForGeneration(
      req.params.productId
    );

    const prompt =
      buildFullDescriptionPrompt(product);

    const result = await generateGeminiText(
      prompt,
      {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    );

    return sendAiSuccess(
      res,
      product.id,
      "fullDescription",
      result.text,
      result
    );
  } catch (error) {
    return sendAiError(res, error);
  }
}

// --------------------------------------------------
// TAGS
// --------------------------------------------------

function parseGeneratedTags(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw createAiError(
      "Gemini returned empty Tags",
      502
    );
  }

  let normalized = text.trim();

  // Remove optional Markdown JSON code fence.
  normalized = normalized
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let tags;

  try {
    tags = JSON.parse(normalized);
  } catch {
    throw createAiError(
      "Gemini returned invalid Tags JSON",
      502
    );
  }

  if (!Array.isArray(tags)) {
    throw createAiError(
      "Gemini Tags response must be an array",
      502
    );
  }

  const uniqueTags = [];
  const seen = new Set();

  for (const tag of tags) {
    if (typeof tag !== "string") {
      continue;
    }

    const value = tag.trim().slice(0, 50);

    if (!value) {
      continue;
    }

    const key = value.toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueTags.push(value);

    if (uniqueTags.length >= 30) {
      break;
    }
  }

  return uniqueTags;
}

export async function generateTagsHandler(
  req,
  res
) {
  try {
    const product = await getProductForGeneration(
      req.params.productId
    );

    const prompt =
      buildTagsPrompt(product);

    const result = await generateGeminiText(
      prompt,
      {
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    );

    const tags = parseGeneratedTags(
      result.text
    );

    return sendAiSuccess(
      res,
      product.id,
      "tags",
      tags,
      result
    );
  } catch (error) {
    return sendAiError(res, error);
  }
}

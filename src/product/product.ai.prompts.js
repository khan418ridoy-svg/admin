
/**
 * Product AI Prompts
 *
 * Gemini generates only:
 * 1. Short Description
 * 2. Full Description
 * 3. Tags
 *
 * This file contains prompts only.
 * Gemini API calls, API keys and model fallback
 * must remain inside the AI service.
 */

function createPromptError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeText(value, field, maxLength = 1000) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw createPromptError(
      `${field} must be a string`
    );
  }

  return value.trim().slice(0, maxLength);
}

function normalizeProduct(product) {
  if (
    !product ||
    typeof product !== "object" ||
    Array.isArray(product)
  ) {
    throw createPromptError(
      "Product information must be an object"
    );
  }

  const name = normalizeText(
    product.name,
    "Product name",
    200
  );

  if (!name) {
    throw createPromptError(
      "Product name is required for AI generation"
    );
  }

  const brand = normalizeText(
    product.brand,
    "Brand",
    100
  );

  const type = normalizeText(
    product.type,
    "Product type",
    50
  );

  const images = Array.isArray(product.images)
    ? product.images.slice(0, 20).map((image) => ({
        alt: normalizeText(image?.alt, "Image alt", 300),
        color: normalizeText(image?.color, "Image color", 100)
      }))
    : [];

  const variants = Array.isArray(product.variants)
    ? product.variants.slice(0, 200).map((variant) => ({
        name: normalizeText(
          variant?.name,
          "Variant name",
          150
        ),
        attributes:
          variant?.attributes &&
          typeof variant.attributes === "object" &&
          !Array.isArray(variant.attributes)
            ? Object.fromEntries(
                Object.entries(variant.attributes)
                  .filter(([key, value]) =>
                    ["color", "size"].includes(key) &&
                    typeof value === "string"
                  )
                  .map(([key, value]) => [
                    key,
                    value.trim().slice(0, 100)
                  ])
              )
            : {}
      }))
    : [];

  return {
    name,
    brand,
    type,
    images,
    variants
  };
}

function productInformation(product) {
  return JSON.stringify(
    normalizeProduct(product),
    null,
    2
  );
}

/**
 * Short Description Prompt
 *
 * Expected output:
 * Plain Bangla text only.
 */
export function buildShortDescriptionPrompt(product) {
  return `
তুমি একজন অভিজ্ঞ Fashion Product Copywriter।

নিচের Product Information ব্যবহার করে একটি আকর্ষণীয়
Short Description তৈরি করো।

নিয়ম:
- স্বাভাবিক ও সহজ বাংলায় লিখবে।
- প্রয়োজন হলে Fashion Terms ইংরেজিতে ব্যবহার করতে পারবে।
- ২ থেকে ৩টি সংক্ষিপ্ত বাক্য লিখবে।
- পণ্যের নাম ও দেওয়া তথ্যের সঙ্গে সামঞ্জস্য রাখবে।
- তথ্যের বাইরে কোনো Fabric, Material, Quality,
  Feature বা সুবিধা কল্পনা করে লিখবে না।
- দাম, Cost Price, Stock বা Discount উল্লেখ করবে না।
- অতিরিক্ত Marketing Claim করবে না।
- Markdown, Heading বা quotation mark ব্যবহার করবে না।
- শুধু Description ফেরত দেবে।

Product Information:
${productInformation(product)}
`.trim();
}

/**
 * Full Description Prompt
 *
 * Expected output:
 * Plain Bangla text only.
 */
export function buildFullDescriptionPrompt(product) {
  return `
তুমি একজন Professional Fashion Product Description Writer।

নিচের Product Information অনুযায়ী একটি বিস্তারিত
Full Description তৈরি করো।

নিয়ম:
- সহজ, প্রাঞ্জল ও প্রাকৃতিক বাংলায় লিখবে।
- প্রথমে পণ্যটি সম্পর্কে একটি পরিচিতিমূলক Paragraph লিখবে।
- দেওয়া তথ্য অনুযায়ী প্রয়োজনীয় Product Details
  সুন্দরভাবে সাজিয়ে লিখবে।
- Color ও Size সম্পর্কে তথ্য থাকলে সেগুলো উল্লেখ করতে পারবে।
- Variable Product হলে পাওয়া Variant Information
  অনুযায়ী বর্ণনা করতে পারবে।
- Product Information-এ নেই এমন Material, Fabric,
  Country of Origin, Warranty বা Quality দাবি করবে না।
- কোনো তথ্য অনুমান করে যোগ করবে না।
- দাম, Cost Price, Stock, Discount বা Delivery Charge
  উল্লেখ করবে না।
- একই কথা বারবার লিখবে না।
- Heading ব্যবহার করতে পারবে, তবে অপ্রয়োজনীয় Heading নয়।
- HTML Tag বা Markdown Formatting ব্যবহার করবে না।
- শুধু Full Description ফেরত দেবে।

Product Information:
${productInformation(product)}
`.trim();
}

/**
 * Tags Prompt
 *
 * Expected output:
 * Valid JSON array of strings only.
 *
 * Example:
 * ["কুর্তি", "লেডিস ফ্যাশন", "Casual Wear"]
 */
export function buildTagsPrompt(product) {
  return `
তুমি একজন Fashion E-commerce SEO Specialist।

নিচের Product Information অনুযায়ী সর্বোচ্চ ৩০টি
প্রাসঙ্গিক Search Tag তৈরি করো।

নিয়ম:
- বাংলা ও প্রয়োজনীয় English Search Terms ব্যবহার করবে।
- Product Name, Type, Color এবং Size-এর তথ্য থাকলে
  সেগুলোর সঙ্গে সম্পর্কিত Tag তৈরি করবে।
- একই অর্থের Duplicate Tag তৈরি করবে না।
- অপ্রাসঙ্গিক Trending বা Popular Tag ব্যবহার করবে না।
- Product Information-এ নেই এমন বৈশিষ্ট্য নিয়ে Tag বানাবে না।
- প্রতিটি Tag সর্বোচ্চ ৫০ অক্ষরের হবে।
- শুধু Valid JSON String Array ফেরত দেবে।
- Markdown Code Fence বা অতিরিক্ত ব্যাখ্যা দেবে না।

সঠিক Output Format:
["বাংলা ট্যাগ", "English Tag"]

Product Information:
${productInformation(product)}
`.trim();
}

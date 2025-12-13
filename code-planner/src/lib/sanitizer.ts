/**
 * Content sanitization utilities for preventing prompt injection attacks.
 * 
 * Sanitizes file contents before injecting into LLM prompts to prevent:
 * - Instruction injection (e.g., "Ignore previous instructions")
 * - Role hijacking (e.g., "You are now a helpful assistant")
 * - Token manipulation (special tokens like <|endoftext|>)
 */

/**
 * Sanitize file content to prevent prompt injection.
 * 
 * @param content - Raw file content
 * @param maxLength - Maximum length to preserve (default: 30,000 chars)
 * @returns Sanitized content safe for injection into prompts
 */
export function sanitizeFileContent(content: string, maxLength = 30_000): string {
  if (!content || typeof content !== "string") {
    return "";
  }

  let cleaned = content;

  // Strip potential role injection patterns
  // Matches patterns like "system:", "user:", "assistant:" at start of lines
  cleaned = cleaned.replace(/^(system|user|assistant|role):\s*/gim, "[ROLE]: ");

  // Strip OpenAI special tokens
  cleaned = cleaned.replace(/<\|[^|]+\|>/g, "");

  // Strip common injection patterns
  const injectionPatterns = [
    /ignore\s+(previous|all|above)\s+(instructions?|prompts?|rules?)/gi,
    /forget\s+(previous|all|above)\s+(instructions?|prompts?|rules?)/gi,
    /you\s+are\s+now\s+(a|an)\s+/gi,
    /new\s+instructions?:/gi,
    /override:/gi,
  ];

  for (const pattern of injectionPatterns) {
    cleaned = cleaned.replace(pattern, "[REDACTED]");
  }

  // Cap length to prevent DoS
  cleaned = cleaned.slice(0, maxLength);

  return cleaned;
}

/**
 * Validate and sanitize prompt inputs.
 * 
 * @param prompt - User or system prompt
 * @param maxLength - Maximum allowed length
 * @returns Sanitized prompt
 * @throws Error if prompt exceeds maxLength
 */
export function validatePromptLength(prompt: string, maxLength: number): string {
  if (typeof prompt !== "string") {
    throw new Error("Prompt must be a string");
  }
  
  if (prompt.length > maxLength) {
    throw new Error(`Prompt exceeds maximum length of ${maxLength} characters`);
  }
  
  return prompt;
}

/**
 * Validate JSON structure from LLM response.
 * Attempts to extract and validate JSON from potentially malformed responses.
 * 
 * @param text - Raw LLM response text
 * @returns Parsed JSON object or null if invalid
 */
export function safeJsonExtract(text: string): unknown | null {
  if (!text || typeof text !== "string") {
    return null;
  }

  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting first {...} block
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Validate improver response structure.
 * Ensures the JSON has the expected shape for prompt improver output.
 * 
 * @param parsed - Parsed JSON object
 * @returns Validated ImproverResponse or null if invalid
 */
export type ImproverResponse = {
  improved_user_prompt?: string;
  search?: {
    keywords?: string[];
    max_files?: number;
  };
};

export function validateImproverResponse(parsed: unknown): ImproverResponse | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  // Must have at least one of the expected fields
  if (!("improved_user_prompt" in parsed) && !("search" in parsed)) {
    return null;
  }

  const result: ImproverResponse = {};

  if ("improved_user_prompt" in parsed && typeof parsed.improved_user_prompt === "string") {
    result.improved_user_prompt = parsed.improved_user_prompt;
  }

  if ("search" in parsed && parsed.search && typeof parsed.search === "object") {
    const search = parsed.search as Record<string, unknown>;
    result.search = {};

    if (Array.isArray(search.keywords) && search.keywords.every((k): k is string => typeof k === "string")) {
      result.search.keywords = search.keywords;
    }

    if (typeof search.max_files === "number" && Number.isFinite(search.max_files)) {
      result.search.max_files = search.max_files;
    }
  }

  return result;
}

/**
 * Sanitize model name for safe display in HTML.
 * Escapes HTML entities to prevent XSS.
 * 
 * @param modelName - Model name to sanitize
 * @returns Sanitized model name safe for HTML rendering
 */
export function sanitizeModelName(modelName: string): string {
  if (!modelName || typeof modelName !== "string") {
    return "";
  }

  // Escape HTML entities
  return modelName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

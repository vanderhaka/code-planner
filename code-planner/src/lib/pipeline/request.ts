/**
 * Request validation and parsing for pipeline runs.
 */

import type { PipelineRunRequest } from "./types";
import { validatePromptLength } from "@/lib/sanitizer";
import type { ProviderId } from "@/lib/model-catalog";

const MAX_USER_MESSAGE_LENGTH = 10_000;
const MAX_SYSTEM_PROMPT_LENGTH = 20_000;

/**
 * Validate pipeline run request.
 * 
 * @param body - Request body to validate
 * @returns Validated request or throws error
 */
export function validatePipelineRequest(body: unknown): PipelineRunRequest {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }

  const req = body as Partial<PipelineRunRequest>;

  // Validate required fields
  if (!req.repo || typeof req.repo !== "string") {
    throw new Error("Missing or invalid 'repo' field");
  }

  if (!req.branch || typeof req.branch !== "string") {
    throw new Error("Missing or invalid 'branch' field");
  }

  if (!req.template || typeof req.template !== "object") {
    throw new Error("Missing or invalid 'template' field");
  }

  if (!req.template.systemPrompt || typeof req.template.systemPrompt !== "string") {
    throw new Error("Missing or invalid 'template.systemPrompt' field");
  }

  if (!req.userMessage || typeof req.userMessage !== "string") {
    throw new Error("Missing or invalid 'userMessage' field");
  }

  if (!Array.isArray(req.models) || req.models.length === 0) {
    throw new Error("Missing or invalid 'models' array");
  }

  // Validate providers
  const VALID_PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "google"]);
  const invalidProviders = req.models.filter((m) => !VALID_PROVIDERS.has(m as ProviderId));
  if (invalidProviders.length > 0) {
    throw new Error(`Invalid providers: ${invalidProviders.join(", ")}`);
  }

  // Validate repo format
  const [owner, repoName] = req.repo.split("/");
  if (!owner || !repoName) {
    throw new Error("Invalid repo format, expected 'owner/name'");
  }

  // Validate prompt lengths
  validatePromptLength(req.userMessage, MAX_USER_MESSAGE_LENGTH);
  validatePromptLength(req.template.systemPrompt, MAX_SYSTEM_PROMPT_LENGTH);

  // Validate selectedModels structure
  const selectedModels = req.selectedModels || {
    openai: null,
    anthropic: null,
    google: null,
  };

  // Validate pipeline settings
  const pipeline = req.pipeline || {
    promptImprover: { provider: "openai" as ProviderId, modelId: null },
    consolidator: { provider: "openai" as ProviderId, modelId: null },
  };

  return {
    repo: req.repo,
    branch: req.branch,
    template: {
      systemPrompt: req.template.systemPrompt,
    },
    userMessage: req.userMessage.trim(),
    models: req.models as ProviderId[],
    selectedModels,
    pipeline,
  };
}


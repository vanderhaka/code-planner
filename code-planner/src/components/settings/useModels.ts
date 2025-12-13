/**
 * Hook for fetching and managing model lists per provider.
 * Ensures models are fetched only once per modal session.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import type { ModelId } from "@/lib/settings";

type ModelOption = {
  id: string;
  name: string;
};

const MODEL_LABEL: Record<ModelId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};

export function useModels(open: boolean) {
  const [availableModels, setAvailableModels] = useState<Record<ModelId, ModelOption[]>>({
    openai: [],
    anthropic: [],
    google: [],
  });
  const [loadingModels, setLoadingModels] = useState<Record<ModelId, boolean>>({
    openai: false,
    anthropic: false,
    google: false,
  });
  const [modelErrors, setModelErrors] = useState<Record<ModelId, string | null>>({
    openai: null,
    anthropic: null,
    google: null,
  });

  // Track which providers have been fetched in this session
  const fetchedRef = useRef<Set<ModelId>>(new Set());

  const fetchModels = useCallback(async (provider: ModelId) => {
    // Skip if already fetched this session
    if (fetchedRef.current.has(provider)) {
      return;
    }

    setLoadingModels((prev) => ({ ...prev, [provider]: true }));
    setModelErrors((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch(`/api/models/${provider}`);
      if (!res.ok) {
        const error = await res.json();
        setModelErrors((prev) => ({
          ...prev,
          [provider]: error.error || `Failed to load ${MODEL_LABEL[provider]} models`,
        }));
        return;
      }
      const data = (await res.json()) as { models: ModelOption[] };
      setAvailableModels((prev) => ({ ...prev, [provider]: data.models }));
      fetchedRef.current.add(provider);
    } catch (e) {
      setModelErrors((prev) => ({
        ...prev,
        [provider]: (e as Error).message,
      }));
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }, []);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      fetchedRef.current.clear();
      setModelErrors({
        openai: null,
        anthropic: null,
        google: null,
      });
    }
  }, [open]);

  // Fetch models for all providers when modal opens
  useEffect(() => {
    if (!open) return;
    (["openai", "anthropic", "google"] as ModelId[]).forEach((provider) => {
      if (!fetchedRef.current.has(provider) && !loadingModels[provider]) {
        fetchModels(provider);
      }
    });
  }, [open, fetchModels, loadingModels]);

  return {
    availableModels,
    loadingModels,
    modelErrors,
    fetchModels,
  };
}


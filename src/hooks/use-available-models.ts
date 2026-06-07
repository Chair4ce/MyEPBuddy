"use client";

import { useCallback, useRef, useState } from "react";
import type { KeyStatus } from "@/app/actions/api-keys";
import type {
  AvailableModel,
  AvailableModelsPayload,
  ModelContext,
  UserModelPreferences,
} from "@/lib/ai-models/types";
import { DEFAULT_APP_MODEL_ID } from "@/lib/constants";
import { EMPTY_MODEL_PREFERENCES } from "@/lib/ai-models/types";
import { useAvailableModelsStore } from "@/stores/available-models-store";

export type { AvailableModelsPayload };

interface UseAvailableModelsOptions {
  /** Load catalog on mount so saved model preferences can be reconciled before generate. */
  eager?: boolean;
}

interface AvailableModelsState {
  models: AvailableModel[];
  defaultModelId: string;
  preferences: UserModelPreferences;
  keyStatus: KeyStatus | null;
  catalogSyncedAt: string | null;
  creditsFirstActive: boolean;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<AvailableModelsPayload | null>;
  refresh: () => Promise<AvailableModelsPayload | null>;
}

function applyPayload(payload: AvailableModelsPayload, context: ModelContext | undefined) {
  const { resolveDefaultModelId } = useAvailableModelsStore.getState();
  return {
    models: payload.models,
    defaultModelId: resolveDefaultModelId(context, payload),
    preferences: payload.preferences,
    keyStatus: payload.keyStatus,
    catalogSyncedAt: payload.catalogSyncedAt,
    creditsFirstActive: payload.creditsFirstActive ?? false,
  };
}

export function useAvailableModels(
  context?: ModelContext,
  options?: UseAvailableModelsOptions,
): AvailableModelsState {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [defaultModelId, setDefaultModelId] = useState(DEFAULT_APP_MODEL_ID);
  const [preferences, setPreferences] = useState<UserModelPreferences>(EMPTY_MODEL_PREFERENCES);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [catalogSyncedAt, setCatalogSyncedAt] = useState<string | null>(null);
  const [creditsFirstActive, setCreditsFirstActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eagerInitRef = useRef(false);

  const applyToState = useCallback(
    (payload: AvailableModelsPayload) => {
      const next = applyPayload(payload, context);
      setModels(next.models);
      setDefaultModelId(next.defaultModelId);
      setPreferences(next.preferences);
      setKeyStatus(next.keyStatus);
      setCatalogSyncedAt(next.catalogSyncedAt);
      setCreditsFirstActive(next.creditsFirstActive);
      return { ...payload, defaultModelId: next.defaultModelId };
    },
    [context],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = await useAvailableModelsStore.getState().fetchModels(false);
      if (!payload) {
        throw new Error("Failed to load models");
      }
      return applyToState(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applyToState]);

  const refresh = useCallback(async () => {
    useAvailableModelsStore.getState().invalidate();
    setIsLoading(true);
    setError(null);

    try {
      const payload = await useAvailableModelsStore.getState().fetchModels(true);
      if (!payload) {
        throw new Error("Failed to load models");
      }
      return applyToState(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applyToState]);

  if (options?.eager && !eagerInitRef.current) {
    eagerInitRef.current = true;
    queueMicrotask(() => {
      void load();
    });
  }

  return {
    models,
    defaultModelId,
    preferences,
    keyStatus,
    catalogSyncedAt,
    creditsFirstActive,
    isLoading,
    error,
    load,
    refresh,
  };
}

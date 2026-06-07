import { create } from "zustand";
import { getDefaultModelId } from "@/lib/ai-models/catalog";
import type { AvailableModelsPayload } from "@/lib/ai-models/types";
import type { ModelContext } from "@/lib/ai-models/types";
import { DEFAULT_APP_MODEL_ID } from "@/lib/constants";

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedPayload extends AvailableModelsPayload {
  fetchedAt: number;
}

interface AvailableModelsStoreState {
  cache: CachedPayload | null;
  inflight: Promise<AvailableModelsPayload | null> | null;
  fetchModels: (force?: boolean) => Promise<AvailableModelsPayload | null>;
  invalidate: () => void;
  resolveDefaultModelId: (
    context: ModelContext | undefined,
    payload: AvailableModelsPayload,
  ) => string;
}

export const useAvailableModelsStore = create<AvailableModelsStoreState>((set, get) => ({
  cache: null,
  inflight: null,

  resolveDefaultModelId(context, payload) {
    return getDefaultModelId(
      payload.models,
      payload.preferences,
      context,
      payload.keyStatus ?? undefined,
      payload.creditsFirstActive ?? false,
    );
  },

  invalidate() {
    set({ cache: null, inflight: null });
  },

  async fetchModels(force = false) {
    const { cache, inflight } = get();
    const now = Date.now();

    if (
      !force &&
      cache &&
      now - cache.fetchedAt < CLIENT_CACHE_TTL_MS
    ) {
      return cache;
    }

    if (!force && inflight) {
      return inflight;
    }

    const request = (async (): Promise<AvailableModelsPayload | null> => {
      try {
        const response = await fetch("/api/models", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load models");
        }

        const data = await response.json();
        const payload: CachedPayload = {
          models: data.models ?? [],
          defaultModelId: data.defaultModelId ?? DEFAULT_APP_MODEL_ID,
          preferences: data.preferences ?? { visible_model_ids: null, defaults: {} },
          keyStatus: data.keyStatus ?? null,
          catalogSyncedAt: data.catalogSyncedAt ?? null,
          creditsFirstActive: data.creditsFirstActive ?? false,
          fetchedAt: Date.now(),
        };

        set({ cache: payload, inflight: null });
        return payload;
      } catch {
        set({ inflight: null });
        return null;
      }
    })();

    set({ inflight: request });
    return request;
  },
}));

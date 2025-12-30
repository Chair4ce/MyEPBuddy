"use client";

/**
 * Hook for managing per-MPA section locks in Normal Mode
 * Provides record locking so only one user can edit an MPA at a time
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import type { EPBSectionLock } from "@/types/database";

interface UseSectionLocksOptions {
  shellId: string | null;
  enabled: boolean; // Only active when multi_user_enabled is false
}

interface UseSectionLocksReturn {
  locks: Record<string, EPBSectionLock>; // Keyed by mpa_key
  isLoading: boolean;
  
  // Actions
  acquireLock: (sectionId: string) => Promise<{ success: boolean; lockedBy?: string }>;
  releaseLock: (sectionId: string) => Promise<void>;
  refreshLock: (sectionId: string) => Promise<void>;
  refreshAllLocks: () => Promise<void>; // Manual refresh of all locks
  
  // Helpers
  isLockedByOther: (mpaKey: string) => boolean;
  getLockedByInfo: (mpaKey: string) => { name: string; rank: string | null } | null;
  hasAnyLock: () => boolean; // Check if we hold any locks
}

export function useSectionLocks({
  shellId,
  enabled,
}: UseSectionLocksOptions): UseSectionLocksReturn {
  const supabase = createClient();
  const { profile } = useUserStore();
  
  const [locks, setLocks] = useState<Record<string, EPBSectionLock>>({});
  const [isLoading, setIsLoading] = useState(false);
  
  // Track our own locks for cleanup
  const ownLocksRef = useRef<Set<string>>(new Set());
  // Heartbeat interval ref
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all locks for this shell
  const fetchLocks = useCallback(async () => {
    if (!shellId || !enabled) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .rpc("get_shell_section_locks", { p_shell_id: shellId } as never) as { data: EPBSectionLock[] | null; error: Error | null };
      
      if (error) throw error;
      
      // Convert to record keyed by mpa_key
      const lockRecord: Record<string, EPBSectionLock> = {};
      (data || []).forEach((lock: EPBSectionLock) => {
        lockRecord[lock.mpa_key] = lock;
      });
      
      setLocks(lockRecord);
    } catch (err) {
      console.error("Failed to fetch section locks:", err);
    } finally {
      setIsLoading(false);
    }
  }, [shellId, enabled, supabase]);

  // Subscribe to lock changes
  useEffect(() => {
    if (!shellId || !enabled) {
      setLocks({});
      return;
    }

    fetchLocks();

    // Subscribe to realtime changes on section locks
    const channel = supabase
      .channel(`section-locks:${shellId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "epb_section_locks",
        },
        () => {
          // Refetch locks to get the joined data with mpa_key and user info
          // The raw payload only has section_id/user_id, not the joined data we need
          fetchLocks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shellId, enabled, supabase, fetchLocks]);

  // Heartbeat to keep our locks alive
  useEffect(() => {
    if (!enabled || ownLocksRef.current.size === 0) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    // Send heartbeat every 2 minutes
    heartbeatRef.current = setInterval(() => {
      ownLocksRef.current.forEach((sectionId) => {
        supabase.rpc("refresh_section_lock", {
          p_section_id: sectionId,
          p_user_id: profile?.id,
        } as never);
      });
    }, 2 * 60 * 1000);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [enabled, profile?.id, supabase]);

  // Cleanup locks on unmount
  useEffect(() => {
    return () => {
      // Release all our locks when component unmounts
      ownLocksRef.current.forEach((sectionId) => {
        supabase.rpc("release_section_lock", {
          p_section_id: sectionId,
          p_user_id: profile?.id,
        } as never);
      });
      ownLocksRef.current.clear();
    };
  }, [profile?.id, supabase]);

  // Acquire a lock on a section
  const acquireLock = useCallback(async (sectionId: string): Promise<{ success: boolean; lockedBy?: string }> => {
    if (!profile) return { success: false };
    
    try {
      type LockResult = { success: boolean; locked_by_name: string | null; locked_by_rank: string | null };
      const { data, error } = await supabase
        .rpc("acquire_section_lock", {
          p_section_id: sectionId,
          p_user_id: profile.id,
        } as never) as { data: LockResult[] | null; error: Error | null };
      
      if (error) throw error;
      
      const result = data?.[0];
      if (result?.success) {
        ownLocksRef.current.add(sectionId);
        fetchLocks(); // Refresh locks
        return { success: true };
      } else {
        const lockedBy = result?.locked_by_rank 
          ? `${result.locked_by_rank} ${result.locked_by_name}`
          : result?.locked_by_name || "Another user";
        return { success: false, lockedBy };
      }
    } catch (err) {
      console.error("Failed to acquire lock:", err);
      return { success: false, lockedBy: "Unknown error" };
    }
  }, [profile, supabase, fetchLocks]);

  // Release a lock
  const releaseLock = useCallback(async (sectionId: string) => {
    if (!profile) return;
    
    try {
      await supabase.rpc("release_section_lock", {
        p_section_id: sectionId,
        p_user_id: profile.id,
      } as never);
      
      ownLocksRef.current.delete(sectionId);
      fetchLocks(); // Refresh locks
    } catch (err) {
      console.error("Failed to release lock:", err);
    }
  }, [profile, supabase, fetchLocks]);

  // Refresh a lock (heartbeat)
  const refreshLock = useCallback(async (sectionId: string) => {
    if (!profile) return;
    
    try {
      await supabase.rpc("refresh_section_lock", {
        p_section_id: sectionId,
        p_user_id: profile.id,
      } as never);
    } catch (err) {
      console.error("Failed to refresh lock:", err);
    }
  }, [profile, supabase]);

  // Check if an MPA is locked by someone else
  const isLockedByOther = useCallback((mpaKey: string): boolean => {
    const lock = locks[mpaKey];
    if (!lock) return false;
    return lock.user_id !== profile?.id;
  }, [locks, profile?.id]);

  // Get info about who locked an MPA
  const getLockedByInfo = useCallback((mpaKey: string): { name: string; rank: string | null } | null => {
    const lock = locks[mpaKey];
    if (!lock || lock.user_id === profile?.id) return null;
    return { name: lock.user_name, rank: lock.user_rank };
  }, [locks, profile?.id]);

  // Check if we hold any locks
  const hasAnyLock = useCallback((): boolean => {
    return ownLocksRef.current.size > 0;
  }, []);

  // Expose fetchLocks as refreshAllLocks for manual refresh
  const refreshAllLocks = useCallback(async () => {
    await fetchLocks();
  }, [fetchLocks]);

  return {
    locks,
    isLoading,
    acquireLock,
    releaseLock,
    refreshLock,
    refreshAllLocks,
    isLockedByOther,
    getLockedByInfo,
    hasAnyLock,
  };
}


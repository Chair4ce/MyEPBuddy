"use client";

/**
 * Hook for managing shell-level field locks (e.g., duty_description)
 * Provides record locking so only one user can edit a field at a time
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import type { ShellFieldLock } from "@/types/database";

interface UseShellFieldLocksOptions {
  shellId: string | null;
  enabled: boolean;
}

interface UseShellFieldLocksReturn {
  locks: Record<string, ShellFieldLock>; // Keyed by field_key
  isLoading: boolean;
  
  // Actions
  acquireLock: (fieldKey: string) => Promise<{ success: boolean; lockedBy?: string }>;
  releaseLock: (fieldKey: string) => Promise<void>;
  refreshLock: (fieldKey: string) => Promise<void>;
  
  // Helpers
  isLockedByOther: (fieldKey: string) => boolean;
  getLockedByInfo: (fieldKey: string) => { name: string; rank: string | null } | null;
}

export function useShellFieldLocks({
  shellId,
  enabled,
}: UseShellFieldLocksOptions): UseShellFieldLocksReturn {
  const supabase = createClient();
  const { profile } = useUserStore();
  
  const [locks, setLocks] = useState<Record<string, ShellFieldLock>>({});
  const [isLoading, setIsLoading] = useState(false);
  
  // Track our own locks for cleanup
  const ownLocksRef = useRef<Set<string>>(new Set());
  // Heartbeat interval ref
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch all field locks for this shell
  const fetchLocks = useCallback(async () => {
    if (!shellId || !enabled) return;
    
    setIsLoading(true);
    try {
      // RPC returns columns with out_ prefix to avoid ambiguity
      type RPCLockResult = {
        out_field_key: string;
        out_user_id: string;
        out_user_name: string;
        out_user_rank: string | null;
        out_acquired_at: string;
        out_expires_at: string;
      };
      
      const { data, error } = await supabase
        .rpc("get_shell_field_locks", { p_shell_id: shellId } as never) as { 
          data: RPCLockResult[] | null; 
          error: Error | null; 
        };
      
      if (error) throw error;
      
      // Convert to record keyed by field_key, mapping from out_ prefixed columns
      const lockRecord: Record<string, ShellFieldLock> = {};
      (data || []).forEach((row) => {
        lockRecord[row.out_field_key] = {
          field_key: row.out_field_key,
          user_id: row.out_user_id,
          user_name: row.out_user_name,
          user_rank: row.out_user_rank,
          acquired_at: row.out_acquired_at,
          expires_at: row.out_expires_at,
        };
      });
      
      setLocks(lockRecord);
    } catch (err) {
      console.error("Failed to fetch shell field locks:", err);
    } finally {
      setIsLoading(false);
    }
  }, [shellId, enabled, supabase]);

  // Subscribe to lock changes
  useEffect(() => {
    if (!shellId || !enabled) {
      setLocks({});
      return () => {};
    }

    fetchLocks();

    // Subscribe to realtime changes on field locks
    const channel = supabase
      .channel(`shell-field-locks:${shellId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "epb_shell_field_locks",
        },
        () => {
          // Refetch locks to get the joined data with user info
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

    // Start heartbeat if we have locks
    heartbeatRef.current = setInterval(() => {
      ownLocksRef.current.forEach((fieldKey) => {
        refreshLock(fieldKey);
      });
    }, 2 * 60 * 1000); // Every 2 minutes

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Acquire a lock
  const acquireLock = useCallback(async (fieldKey: string): Promise<{ success: boolean; lockedBy?: string }> => {
    if (!profile || !shellId) return { success: false };
    
    try {
      type LockResult = { success: boolean; locked_by_name: string | null; locked_by_rank: string | null };
      const { data, error } = await supabase
        .rpc("acquire_shell_field_lock", {
          p_shell_id: shellId,
          p_field_key: fieldKey,
          p_user_id: profile.id,
        } as never) as { data: LockResult[] | null; error: Error | null };
      
      if (error) throw error;
      
      const result = data?.[0];
      if (result?.success) {
        ownLocksRef.current.add(fieldKey);
        fetchLocks(); // Refresh locks
        return { success: true };
      } else {
        const lockedBy = result?.locked_by_rank 
          ? `${result.locked_by_rank} ${result.locked_by_name}`
          : result?.locked_by_name || "Another user";
        return { success: false, lockedBy };
      }
    } catch (err) {
      console.error("Failed to acquire field lock:", err);
      return { success: false, lockedBy: "Unknown error" };
    }
  }, [profile, shellId, supabase, fetchLocks]);

  // Release a lock
  const releaseLock = useCallback(async (fieldKey: string) => {
    if (!profile || !shellId) return;
    
    try {
      await supabase.rpc("release_shell_field_lock", {
        p_shell_id: shellId,
        p_field_key: fieldKey,
        p_user_id: profile.id,
      } as never);
      
      ownLocksRef.current.delete(fieldKey);
      fetchLocks();
    } catch (err) {
      console.error("Failed to release field lock:", err);
    }
  }, [profile, shellId, supabase, fetchLocks]);

  // Refresh a lock (heartbeat)
  const refreshLock = useCallback(async (fieldKey: string) => {
    if (!profile || !shellId) return;
    
    try {
      const { data } = await supabase.rpc("refresh_shell_field_lock", {
        p_shell_id: shellId,
        p_field_key: fieldKey,
        p_user_id: profile.id,
      } as never) as { data: boolean | null };
      
      if (!data) {
        // Lock was lost (maybe expired), remove from our tracking
        ownLocksRef.current.delete(fieldKey);
      }
    } catch (err) {
      console.error("Failed to refresh field lock:", err);
    }
  }, [profile, shellId, supabase]);

  // Check if a field is locked by someone else
  const isLockedByOther = useCallback((fieldKey: string): boolean => {
    const lock = locks[fieldKey];
    if (!lock || !profile) return false;
    return lock.user_id !== profile.id;
  }, [locks, profile]);

  // Get info about who locked a field
  const getLockedByInfo = useCallback((fieldKey: string): { name: string; rank: string | null } | null => {
    const lock = locks[fieldKey];
    if (!lock || !profile) return null;
    if (lock.user_id === profile.id) return null; // Don't show for our own locks
    return { name: lock.user_name, rank: lock.user_rank };
  }, [locks, profile]);

  return {
    locks,
    isLoading,
    acquireLock,
    releaseLock,
    refreshLock,
    isLockedByOther,
    getLockedByInfo,
  };
}


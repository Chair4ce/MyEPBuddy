"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { APP_BUILD_ID } from "@/lib/app-build-id";
import { STALE_DEPLOYMENT_EVENT } from "@/lib/stale-deployment";

interface VersionInfo {
  version: string;
  buildId: string;
  buildTime: string;
  commitHash?: string;
}

interface UseVersionCheckOptions {
  /** Base polling interval in milliseconds (default: 300000 = 5 minutes) */
  pollInterval?: number;
  /** Whether to check on tab/window focus (default: true) */
  checkOnFocus?: boolean;
  /** Disable version checking entirely */
  disabled?: boolean;
}

interface UseVersionCheckReturn {
  /** Whether a new version is available */
  hasUpdate: boolean;
  /** Current client version info */
  currentVersion: VersionInfo | null;
  /** Latest server version info */
  latestVersion: VersionInfo | null;
  /** Manually trigger a version check */
  checkForUpdate: () => Promise<void>;
  /** Refresh the page to get the latest version */
  refreshApp: () => void;
}

const VERSION_STORAGE_KEY = "app-build-id";
const LAST_CHECK_KEY = "app-version-last-check";
const LEADER_KEY = "app-version-leader";
const LEADER_HEARTBEAT = 10000; // 10 seconds

/**
 * Adds random jitter to prevent thundering herd
 * Returns a value between 0.8x and 1.2x of the base interval
 */
function addJitter(baseInterval: number): number {
  const jitterFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
  return Math.floor(baseInterval * jitterFactor);
}

/**
 * Cross-tab leader election using localStorage
 * Only the leader tab will poll the server
 */
function tryBecomeLeader(): boolean {
  try {
    const now = Date.now();
    const leaderData = localStorage.getItem(LEADER_KEY);
    
    if (leaderData) {
      const { timestamp, tabId } = JSON.parse(leaderData);
      // If leader heartbeat is recent and it's not us, we're not the leader
      if (now - timestamp < LEADER_HEARTBEAT * 2 && tabId !== getTabId()) {
        return false;
      }
    }
    
    // Claim leadership
    localStorage.setItem(LEADER_KEY, JSON.stringify({
      tabId: getTabId(),
      timestamp: now,
    }));
    
    return true;
  } catch {
    // localStorage not available, assume we're the leader
    return true;
  }
}

function renewLeadership(): void {
  try {
    localStorage.setItem(LEADER_KEY, JSON.stringify({
      tabId: getTabId(),
      timestamp: Date.now(),
    }));
  } catch {
    // Ignore
  }
}

let tabId: string | null = null;
function getTabId(): string {
  if (!tabId) {
    tabId = Math.random().toString(36).substring(2, 15);
  }
  return tabId;
}

export function useVersionCheck(
  options: UseVersionCheckOptions = {}
): UseVersionCheckReturn {
  const {
    pollInterval = 300000, // 5 minutes default
    checkOnFocus = true,
    disabled = false,
  } = options;

  const [currentVersion, setCurrentVersion] = useState<VersionInfo | null>(null);
  const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  
  const isInitialized = useRef(false);
  const currentEtag = useRef<string | null>(null);
  const isLeader = useRef(false);
  const sessionBuildId = useRef<string | null>(null); // Track buildId for this session only

  // Fetch version using ETag for efficient caching
  const fetchVersion = useCallback(async (): Promise<VersionInfo | null> => {
    try {
      const headers: HeadersInit = {
        "Accept": "application/json",
      };
      
      // Include ETag for conditional request (304 Not Modified)
      if (currentEtag.current) {
        headers["If-None-Match"] = currentEtag.current;
      }
      
      const response = await fetch("/api/version", { headers });
      
      // 304 Not Modified - no update needed
      if (response.status === 304) {
        return null;
      }
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to fetch version: ${response.status}`);
      }
      
      // Store new ETag for future requests
      const etag = response.headers.get("etag");
      if (etag) {
        currentEtag.current = etag;
      }
      
      return await response.json();
    } catch (err) {
      console.warn("[VersionCheck] Failed to fetch version:", err);
      return null;
    }
  }, []);

  // Check for updates
  const checkForUpdate = useCallback(async () => {
    if (disabled) return;
    
    // Only leader tab polls the server (other tabs listen via storage events)
    if (!tryBecomeLeader() && isInitialized.current) {
      return;
    }
    isLeader.current = true;
    renewLeadership();
    
    // Record check time for cross-tab coordination
    try {
      localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
    } catch {
      // Ignore localStorage errors
    }

    const serverVersion = await fetchVersion();
    
    // null means 304 Not Modified (no change) or error
    if (!serverVersion) return;
    
    setLatestVersion(serverVersion);
    
    // Broadcast to other tabs via localStorage
    try {
      localStorage.setItem("app-version-update", JSON.stringify({
        version: serverVersion,
        timestamp: Date.now(),
      }));
    } catch {
      // Ignore
    }
    
    // Initialize on first successful fetch: compare the build ID baked into
    // this JS bundle against what the server is running now. Returning users
    // with cached bundles fail this check immediately instead of only catching
    // deploys that happen mid-session.
    if (!isInitialized.current) {
      isInitialized.current = true;
      sessionBuildId.current = APP_BUILD_ID;
      setCurrentVersion({
        ...serverVersion,
        buildId: APP_BUILD_ID,
      });
      localStorage.setItem(VERSION_STORAGE_KEY, APP_BUILD_ID);
      currentEtag.current = `"${serverVersion.buildId}"`;

      if (APP_BUILD_ID !== serverVersion.buildId) {
        setHasUpdate(true);
      }
    } else if (sessionBuildId.current && sessionBuildId.current !== serverVersion.buildId) {
      setHasUpdate(true);
    }
  }, [disabled, fetchVersion]);

  // Immediate prompt when a server action fails due to deploy skew
  useEffect(() => {
    if (disabled) return;

    const handleStaleDeployment = () => {
      setHasUpdate(true);
    };

    window.addEventListener(STALE_DEPLOYMENT_EVENT, handleStaleDeployment);
    return () =>
      window.removeEventListener(STALE_DEPLOYMENT_EVENT, handleStaleDeployment);
  }, [disabled]);

  // Listen for version updates from other tabs
  useEffect(() => {
    if (disabled) return;
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "app-version-update" && e.newValue) {
        try {
          const { version } = JSON.parse(e.newValue);
          setLatestVersion(version);
          
          // Compare baked-in bundle ID (or mid-session baseline) to the server.
          const clientBuildId = sessionBuildId.current ?? APP_BUILD_ID;
          if (clientBuildId !== version.buildId) {
            setHasUpdate(true);
          }
        } catch {
          // Ignore parse errors
        }
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [disabled]);

  // Hard refresh: clear client caches and navigate with a cache-busting param
  const refreshApp = useCallback(async () => {
    localStorage.removeItem(VERSION_STORAGE_KEY);
    localStorage.removeItem(LAST_CHECK_KEY);
    localStorage.removeItem(LEADER_KEY);
    localStorage.removeItem("app-version-update");
    // Legacy key from when updates could be dismissed
    localStorage.removeItem("app-update-dismissed");

    if ("caches" in window) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      } catch {
        // Ignore Cache API errors
      }
    }

    const url = new URL(window.location.href);
    url.searchParams.set("_v", Date.now().toString());
    window.location.replace(url.toString());
  }, []);

  // Initial check on mount — run immediately so stale cached bundles prompt fast
  useEffect(() => {
    if (!disabled) {
      void checkForUpdate();
    }
  }, [disabled, checkForUpdate]);

  // Polling with jitter
  useEffect(() => {
    if (disabled || pollInterval <= 0) return;

    let timeoutId: NodeJS.Timeout;
    
    const scheduleNext = () => {
      const jitteredInterval = addJitter(pollInterval);
      timeoutId = setTimeout(() => {
        checkForUpdate();
        scheduleNext();
      }, jitteredInterval);
    };
    
    scheduleNext();
    return () => clearTimeout(timeoutId);
  }, [disabled, pollInterval, checkForUpdate]);

  // Check when the tab regains focus or becomes visible (mobile/PWA return).
  useEffect(() => {
    if (disabled || !checkOnFocus) return;

    let lastFocusCheck = 0;
    const FOCUS_DEBOUNCE = 30000; // 30 seconds

    const maybeCheck = () => {
      const now = Date.now();
      if (now - lastFocusCheck > FOCUS_DEBOUNCE) {
        lastFocusCheck = now;
        void checkForUpdate();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") maybeCheck();
    };

    window.addEventListener("focus", maybeCheck);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", maybeCheck);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [disabled, checkOnFocus, checkForUpdate]);

  // Leader heartbeat
  useEffect(() => {
    if (disabled || !isLeader.current) return;
    
    const interval = setInterval(() => {
      if (isLeader.current) {
        renewLeadership();
      }
    }, LEADER_HEARTBEAT);
    
    return () => clearInterval(interval);
  }, [disabled]);

  return {
    hasUpdate,
    currentVersion,
    latestVersion,
    checkForUpdate,
    refreshApp,
  };
}

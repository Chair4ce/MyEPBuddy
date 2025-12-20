"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  /** Dismiss the update notification (will recheck on next interval) */
  dismissUpdate: () => void;
  /** Refresh the page to get the latest version */
  refreshApp: () => void;
}

const VERSION_STORAGE_KEY = "app-build-id";
const DISMISS_STORAGE_KEY = "app-update-dismissed";
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
  const [isDismissed, setIsDismissed] = useState(false);
  
  const isInitialized = useRef(false);
  const currentEtag = useRef<string | null>(null);
  const isLeader = useRef(false);

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
    
    // Initialize current version on first successful fetch
    if (!isInitialized.current) {
      isInitialized.current = true;
      
      const storedBuildId = localStorage.getItem(VERSION_STORAGE_KEY);
      const dismissedBuildId = localStorage.getItem(DISMISS_STORAGE_KEY);
      
      if (storedBuildId && storedBuildId !== serverVersion.buildId) {
        setCurrentVersion({ ...serverVersion, buildId: storedBuildId });
        if (dismissedBuildId !== serverVersion.buildId) {
          setHasUpdate(true);
        } else {
          setIsDismissed(true);
        }
      } else {
        setCurrentVersion(serverVersion);
        localStorage.setItem(VERSION_STORAGE_KEY, serverVersion.buildId);
        localStorage.removeItem(DISMISS_STORAGE_KEY);
      }
      
      currentEtag.current = `"${serverVersion.buildId}"`;
    } else if (currentVersion && currentVersion.buildId !== serverVersion.buildId) {
      const dismissedBuildId = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (dismissedBuildId !== serverVersion.buildId) {
        setHasUpdate(true);
        setIsDismissed(false);
      }
    }
  }, [disabled, fetchVersion, currentVersion]);

  // Listen for version updates from other tabs
  useEffect(() => {
    if (disabled) return;
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "app-version-update" && e.newValue) {
        try {
          const { version } = JSON.parse(e.newValue);
          setLatestVersion(version);
          
          const storedBuildId = localStorage.getItem(VERSION_STORAGE_KEY);
          if (storedBuildId && storedBuildId !== version.buildId) {
            const dismissedBuildId = localStorage.getItem(DISMISS_STORAGE_KEY);
            if (dismissedBuildId !== version.buildId) {
              setHasUpdate(true);
              setIsDismissed(false);
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    };
    
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [disabled]);

  // Dismiss update notification
  const dismissUpdate = useCallback(() => {
    setIsDismissed(true);
    setHasUpdate(false);
    if (latestVersion) {
      localStorage.setItem(DISMISS_STORAGE_KEY, latestVersion.buildId);
    }
  }, [latestVersion]);

  // Refresh the app
  const refreshApp = useCallback(() => {
    if (latestVersion) {
      localStorage.setItem(VERSION_STORAGE_KEY, latestVersion.buildId);
      localStorage.removeItem(DISMISS_STORAGE_KEY);
    }
    window.location.reload();
  }, [latestVersion]);

  // Initial check on mount
  useEffect(() => {
    if (!disabled) {
      // Small delay to let the app settle
      const timeout = setTimeout(checkForUpdate, 1000);
      return () => clearTimeout(timeout);
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

  // Check on window focus (with debounce)
  useEffect(() => {
    if (disabled || !checkOnFocus) return;

    let lastFocusCheck = 0;
    const FOCUS_DEBOUNCE = 30000; // 30 seconds

    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusCheck > FOCUS_DEBOUNCE) {
        lastFocusCheck = now;
        checkForUpdate();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
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
    hasUpdate: hasUpdate && !isDismissed,
    currentVersion,
    latestVersion,
    checkForUpdate,
    dismissUpdate,
    refreshApp,
  };
}

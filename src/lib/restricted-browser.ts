import { useSyncExternalStore } from "react";

export type RestrictedBrowserInfo = {
  restricted: boolean;
  browserName: string;
};

const SERVER_SNAPSHOT: RestrictedBrowserInfo = {
  restricted: false,
  browserName: "",
};

let cachedClientSnapshot: RestrictedBrowserInfo = SERVER_SNAPSHOT;

/** Pure classification — no `window` access. */
export function detectRestrictedBrowser(input: {
  userAgent: string;
  isStandalone: boolean;
}): RestrictedBrowserInfo {
  if (input.isStandalone) {
    return { restricted: true, browserName: "this app" };
  }

  const ua = input.userAgent || "";

  if (/LinkedIn/i.test(ua)) return { restricted: true, browserName: "LinkedIn" };
  if (/FBAN|FBAV/i.test(ua)) return { restricted: true, browserName: "Facebook" };
  if (/Instagram/i.test(ua)) return { restricted: true, browserName: "Instagram" };
  if (/Twitter/i.test(ua)) return { restricted: true, browserName: "Twitter/X" };
  if (/Snapchat/i.test(ua)) return { restricted: true, browserName: "Snapchat" };
  if (/Slack/i.test(ua)) return { restricted: true, browserName: "Slack" };
  if (/Line\//i.test(ua)) return { restricted: true, browserName: "Line" };
  if (/KAKAOTALK/i.test(ua)) return { restricted: true, browserName: "KakaoTalk" };
  if (/WeChat|MicroMessenger/i.test(ua)) {
    return { restricted: true, browserName: "WeChat" };
  }

  return { restricted: false, browserName: "" };
}

function subscribeRestrictedBrowser() {
  return () => undefined;
}

function readClientRestrictedBrowser(): RestrictedBrowserInfo {
  const ua = navigator.userAgent || "";
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true;

  return detectRestrictedBrowser({ userAgent: ua, isStandalone });
}

function getClientSnapshot(): RestrictedBrowserInfo {
  const next = readClientRestrictedBrowser();
  if (
    next.restricted === cachedClientSnapshot.restricted &&
    next.browserName === cachedClientSnapshot.browserName
  ) {
    return cachedClientSnapshot;
  }
  cachedClientSnapshot = next;
  return cachedClientSnapshot;
}

function getServerSnapshot(): RestrictedBrowserInfo {
  return SERVER_SNAPSHOT;
}

/** In-app / restricted WebView detection for Google OAuth warnings. */
export function useRestrictedBrowser(): RestrictedBrowserInfo {
  return useSyncExternalStore(
    subscribeRestrictedBrowser,
    getClientSnapshot,
    getServerSnapshot
  );
}

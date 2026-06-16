"use client";

import {
  handleStaleDeploymentError,
  isStaleServerActionError,
  signalStaleDeployment,
} from "@/lib/stale-deployment";

let installed = false;

export function installStaleDeploymentGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("unhandledrejection", (event) => {
    if (!isStaleServerActionError(event.reason)) return;
    signalStaleDeployment();
  });

  window.addEventListener("error", (event) => {
    if (!handleStaleDeploymentError(event.error ?? event.message)) return;
    event.preventDefault();
  });
}

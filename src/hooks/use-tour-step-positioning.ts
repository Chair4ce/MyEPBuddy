"use client";

import { useEffect, type MutableRefObject } from "react";
import type { TourStep } from "@/stores/onboarding-store";

export function useTourStepPositioning({
  isVisible,
  currentStep,
  updatePositions,
  nextStep,
  resizeObserverRef,
}: {
  isVisible: boolean;
  currentStep: TourStep | null | undefined;
  updatePositions: () => void;
  nextStep: () => void;
  resizeObserverRef: MutableRefObject<ResizeObserver | null>;
}) {
  useEffect(() => {
    let targetElement: Element | null = null;
    const autoAdvanceTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
    let mutationObserver: MutationObserver | null = null;
    let handleResize: (() => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;

    if (isVisible && currentStep) {
      updatePositions();

      handleResize = () => updatePositions();
      window.addEventListener("resize", handleResize);
      window.addEventListener("scroll", handleResize, true);

      resizeObserver = new ResizeObserver(updatePositions);
      resizeObserverRef.current = resizeObserver;

      if (currentStep.target) {
        targetElement = document.querySelector(currentStep.target);
        if (targetElement instanceof HTMLElement) {
          resizeObserver.observe(targetElement);
          targetElement.style.position = "relative";
          targetElement.style.zIndex = "10000";

          if (currentStep.action === "click") {
            const handleActionClick = () => {
              if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
              autoAdvanceTimeoutRef.current = setTimeout(() => {
                nextStep();
              }, 400);
            };
            targetElement.addEventListener("click", handleActionClick, true);
            (targetElement as HTMLElement & { _actionClickHandler?: () => void })._actionClickHandler =
              handleActionClick;
          }

          if (currentStep.autoAdvance) {
            const triggerAutoAdvance = () => {
              if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
              autoAdvanceTimeoutRef.current = setTimeout(() => {
                nextStep();
              }, 600);
            };

            if (currentStep.autoAdvance === "select" || currentStep.autoAdvance === "any") {
              let wasOpen = false;
              const initialText = targetElement.textContent?.trim() || "";

              mutationObserver = new MutationObserver(() => {
                if (!targetElement) return;
                const trigger = targetElement.querySelector("[data-state]") || targetElement;
                const currentState = trigger.getAttribute("data-state");
                const currentText = targetElement.textContent?.trim() || "";

                if (currentState === "open") {
                  wasOpen = true;
                }

                if (wasOpen && currentState === "closed" && currentText !== initialText) {
                  wasOpen = false;
                  triggerAutoAdvance();
                }
              });
              mutationObserver.observe(targetElement, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: ["data-state"],
              });
            }

            if (currentStep.autoAdvance === "input" || currentStep.autoAdvance === "any") {
              const handleInput = () => triggerAutoAdvance();
              targetElement.addEventListener("input", handleInput, true);
              targetElement.addEventListener("change", handleInput, true);
              (targetElement as HTMLElement & { _inputHandler?: () => void })._inputHandler = handleInput;
            }

            if (currentStep.autoAdvance === "click") {
              const handleClick = () => triggerAutoAdvance();
              targetElement.addEventListener("click", handleClick);
              (targetElement as HTMLElement & { _clickAdvanceHandler?: () => void })._clickAdvanceHandler =
                handleClick;
            }
          }

          (targetElement as HTMLElement & { _tourCleanup?: () => void })._tourCleanup = () => {
            if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
            if (mutationObserver) mutationObserver.disconnect();

            const el = targetElement as HTMLElement & {
              _inputHandler?: () => void;
              _clickAdvanceHandler?: () => void;
              _actionClickHandler?: () => void;
            };
            if (el._actionClickHandler) targetElement?.removeEventListener("click", el._actionClickHandler, true);
            if (el._inputHandler) {
              targetElement?.removeEventListener("input", el._inputHandler, true);
              targetElement?.removeEventListener("change", el._inputHandler, true);
            }
            if (el._clickAdvanceHandler) targetElement?.removeEventListener("click", el._clickAdvanceHandler);
          };
        }
      }
    }

    return () => {
      if (handleResize) {
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleResize, true);
      }
      resizeObserver?.disconnect();
      resizeObserverRef.current = null;
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
        autoAdvanceTimeoutRef.current = null;
      }
      mutationObserver?.disconnect();
      if (targetElement instanceof HTMLElement) {
        targetElement.style.position = "";
        targetElement.style.zIndex = "";
        const cleanup = (targetElement as HTMLElement & { _tourCleanup?: () => void })._tourCleanup;
        if (cleanup) cleanup();
      }
    };
  }, [isVisible, currentStep, updatePositions, nextStep, resizeObserverRef]);
}

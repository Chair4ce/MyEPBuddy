"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useOnboardingStore,
  TOUR_DEFINITIONS,
  type TourStep,
} from "@/stores/onboarding-store";
import {
  X,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  Sparkles,
} from "lucide-react";

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function TourOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    activeTour,
    currentStepIndex,
    isVisible,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
  } = useOnboardingStore();

  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Get current step
  const currentStep = activeTour
    ? TOUR_DEFINITIONS[activeTour]?.[currentStepIndex]
    : null;
  const totalSteps = activeTour ? TOUR_DEFINITIONS[activeTour]?.length : 0;
  const isLastStep = currentStepIndex === totalSteps - 1;
  const isFirstStep = currentStepIndex === 0;

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Calculate spotlight and tooltip positions
  const updatePositions = useCallback(() => {
    if (!currentStep?.target) {
      setSpotlightRect(null);
      setTooltipPosition(null);
      return;
    }

    const targetElement = document.querySelector(currentStep.target);
    if (!targetElement) {
      setSpotlightRect(null);
      setTooltipPosition(null);
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const padding = currentStep.highlightPadding ?? 8;

    setSpotlightRect({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    // Calculate tooltip position based on placement
    const tooltipWidth = 320;
    const tooltipHeight = 180;
    const gap = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < 768;

    let top = 0;
    let left = 0;
    
    // Determine effective placement - flip bottom to top on mobile if not enough space below
    let effectivePlacement = currentStep.placement;
    if (effectivePlacement === "bottom" && isMobile) {
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < tooltipHeight + gap + 20 && spaceAbove > spaceBelow) {
        effectivePlacement = "top";
      }
    }

    switch (effectivePlacement) {
      case "top":
        top = rect.top - tooltipHeight - gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case "bottom":
        top = rect.bottom + gap;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - gap;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + gap;
        break;
      default:
        // Center placement handled separately
        top = 0;
        left = 0;
    }

    // Ensure tooltip stays within viewport
    if (left < 16) left = 16;
    if (left + tooltipWidth > viewportWidth - 16) left = viewportWidth - tooltipWidth - 16;
    if (top < 16) top = 16;
    if (top + tooltipHeight > viewportHeight - 16) top = viewportHeight - tooltipHeight - 16;

    setTooltipPosition({ top, left });
  }, [currentStep]);

  // Update positions when step changes or window resizes
  useEffect(() => {
    if (!isVisible || !currentStep) return;

    updatePositions();

    const handleResize = () => updatePositions();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    // Watch for DOM changes that might affect element positions
    resizeObserverRef.current = new ResizeObserver(updatePositions);
    
    let targetElement: Element | null = null;
    let autoAdvanceTimeout: ReturnType<typeof setTimeout> | null = null;
    let mutationObserver: MutationObserver | null = null;
    
    if (currentStep.target) {
      targetElement = document.querySelector(currentStep.target);
      if (targetElement instanceof HTMLElement) {
        resizeObserverRef.current.observe(targetElement);
        // Elevate the target element above the blur overlay
        targetElement.style.position = "relative";
        targetElement.style.zIndex = "10000";
        
        // Auto-advance when user clicks on action: "click" steps
        if (currentStep.action === "click") {
          const handleActionClick = () => {
            // Clear any existing timeout
            if (autoAdvanceTimeout) clearTimeout(autoAdvanceTimeout);
            // Auto-advance after a short delay to let the dialog open
            autoAdvanceTimeout = setTimeout(() => {
              nextStep();
            }, 400);
          };
          targetElement.addEventListener("click", handleActionClick, true);
          
          // Store for cleanup
          (targetElement as HTMLElement & { _actionClickHandler?: () => void })._actionClickHandler = handleActionClick;
        }
        
        // Only set up auto-advance if the step has autoAdvance defined
        if (currentStep.autoAdvance) {
          const triggerAutoAdvance = () => {
            // Clear any existing timeout
            if (autoAdvanceTimeout) clearTimeout(autoAdvanceTimeout);
            // Auto-advance after a short delay
            autoAdvanceTimeout = setTimeout(() => {
              nextStep();
            }, 600);
          };
          
          // Handle different auto-advance types
          if (currentStep.autoAdvance === "select" || currentStep.autoAdvance === "any") {
            // For Radix Select components, track when selection is actually made
            // by watching for the trigger's data-state to change to "closed" after being "open"
            let wasOpen = false;
            const initialText = targetElement.textContent?.trim() || "";
            
            mutationObserver = new MutationObserver(() => {
              const trigger = targetElement.querySelector("[data-state]") || targetElement;
              const currentState = trigger.getAttribute("data-state");
              const currentText = targetElement.textContent?.trim() || "";
              
              // Track if dropdown was opened
              if (currentState === "open") {
                wasOpen = true;
              }
              
              // Only advance when dropdown closes AND the value changed
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
            // For input fields, listen for input/change events with capture to catch from child elements
            const handleInput = () => triggerAutoAdvance();
            targetElement.addEventListener("input", handleInput, true);
            targetElement.addEventListener("change", handleInput, true);
            
            // Store for cleanup
            (targetElement as HTMLElement & { _inputHandler?: () => void })._inputHandler = handleInput;
          }
          
          if (currentStep.autoAdvance === "click") {
            // For click-to-advance, listen for clicks
            const handleClick = () => triggerAutoAdvance();
            targetElement.addEventListener("click", handleClick);
            
            // Store for cleanup  
            (targetElement as HTMLElement & { _clickAdvanceHandler?: () => void })._clickAdvanceHandler = handleClick;
          }
        }
        
        // Store cleanup function
        (targetElement as HTMLElement & { _tourCleanup?: () => void })._tourCleanup = () => {
          if (autoAdvanceTimeout) clearTimeout(autoAdvanceTimeout);
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

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
      resizeObserverRef.current?.disconnect();
      // Reset the target element's z-index when leaving this step
      if (targetElement instanceof HTMLElement) {
        targetElement.style.position = "";
        targetElement.style.zIndex = "";
        // Call cleanup for event listeners
        const cleanup = (targetElement as HTMLElement & { _tourCleanup?: () => void })._tourCleanup;
        if (cleanup) cleanup();
      }
    };
  }, [isVisible, currentStep, updatePositions, nextStep]);

  // Handle step actions
  const handleNext = useCallback(async () => {
    if (!currentStep) return;

    // Handle navigation action
    if (currentStep.action === "navigate" && currentStep.actionTarget) {
      router.push(currentStep.actionTarget);
      // Wait a bit for navigation to complete before moving to next step
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Handle open-sidebar action
    if (currentStep.action === "open-sidebar") {
      // Click on the sidebar toggle or expand it
      const sidebarTrigger = document.querySelector("[data-tour='sidebar-toggle']");
      if (sidebarTrigger instanceof HTMLElement) {
        sidebarTrigger.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Handle click action - clicks on the target element (e.g., to open a modal)
    if (currentStep.action === "click" && currentStep.target) {
      const targetElement = document.querySelector(currentStep.target);
      if (targetElement instanceof HTMLElement) {
        targetElement.click();
      }
      // Wait for modal/dialog to open
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    nextStep();
  }, [currentStep, nextStep, router]);

  // Don't render if not active or not mounted
  if (!mounted || !isVisible || !activeTour || !currentStep) {
    return null;
  }

  const hasTarget = !!currentStep.target && !!spotlightRect;
  const isTooltipCentered = currentStep.placement === "center" || !currentStep.target;

  const overlayContent = (
    <div
      className="fixed inset-0 z-[9999] animate-in fade-in duration-300 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Tour guide"
    >
      {/* Subtle blurred backdrop - only for centered/no-target steps */}
      {!hasTarget && (
        <div
          className="fixed inset-0 backdrop-blur-[2px] transition-all duration-500 ease-out pointer-events-auto"
          style={{ zIndex: 9997 }}
        />
      )}

      {/* Overlay background with spotlight cutout */}
      {hasTarget ? (
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none transition-all duration-500 ease-out"
          style={{ zIndex: 9998 }}
        >
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={spotlightRect.left}
                y={spotlightRect.top}
                width={spotlightRect.width}
                height={spotlightRect.height}
                rx="12"
                fill="black"
                className="transition-all duration-500 ease-out"
              />
            </mask>
            {/* Soft glow filter */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.6)"
            mask="url(#spotlight-mask)"
          />
        </svg>
      ) : (
        <div
          className="fixed inset-0 bg-black/60 transition-opacity duration-500 ease-out pointer-events-auto"
          style={{ zIndex: 9998 }}
        />
      )}

      {/* Spotlight glow effect */}
      {hasTarget && (
        <div
          className="fixed pointer-events-none transition-all duration-500 ease-out"
          style={{
            zIndex: 9999,
            top: spotlightRect.top - 4,
            left: spotlightRect.left - 4,
            width: spotlightRect.width + 8,
            height: spotlightRect.height + 8,
            borderRadius: 16,
            boxShadow: "0 0 0 2px hsl(var(--primary)), 0 0 20px 4px hsl(var(--primary) / 0.4), 0 0 40px 8px hsl(var(--primary) / 0.2)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className={cn(
          "fixed z-[10000] transition-all duration-500 ease-out",
          isTooltipCentered && "bottom-8 left-1/2 -translate-x-1/2"
        )}
        style={
          !isTooltipCentered && tooltipPosition
            ? { 
                top: tooltipPosition.top, 
                left: tooltipPosition.left,
              }
            : undefined
        }
      >
        <Card className="w-[320px] shadow-2xl border-primary/20 bg-background/95 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300 pointer-events-auto">
          <CardContent className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="size-4 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{currentStep.title}</h3>
                  <Badge variant="secondary" className="text-[10px] mt-0.5">
                    Step {currentStepIndex + 1} of {totalSteps}
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={skipTour}
                aria-label="Close tour"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            {/* Content */}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {currentStep.content}
            </p>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-full transition-all duration-300 ease-out",
                    i === currentStepIndex
                      ? "size-2 bg-primary"
                      : i < currentStepIndex
                      ? "size-1.5 bg-primary/50"
                      : "size-1.5 bg-muted-foreground/20"
                  )}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex gap-1">
                {currentStep.showSkip !== false && !isLastStep && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={skipTour}
                    className="text-xs h-8"
                  >
                    <SkipForward className="size-3.5 mr-1" />
                    Skip
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {!isFirstStep && currentStep.showBack !== false && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={prevStep}
                    className="text-xs h-8"
                  >
                    <ChevronLeft className="size-3.5 mr-1" />
                    Back
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="text-xs h-8"
                >
                  {isLastStep ? (
                    "Done"
                  ) : (
                    <>
                      Next
                      <ChevronRight className="size-3.5 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clickable area to close on overlay click */}
      {!hasTarget && (
        <div
          className="fixed inset-0 z-[9999]"
          onClick={(e) => {
            // Only close if clicking on the overlay, not the tooltip
            if (e.target === e.currentTarget) {
              skipTour();
            }
          }}
        />
      )}
    </div>
  );

  return createPortal(overlayContent, document.body);
}

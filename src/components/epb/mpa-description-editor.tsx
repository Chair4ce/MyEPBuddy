"use client";

import { useCallback, useRef } from "react";
import { useUserStore } from "@/stores/user-store";
import { useEPBShellStore } from "@/stores/epb-shell-store";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { STANDARD_MGAS, DEFAULT_MPA_DESCRIPTIONS } from "@/lib/constants";
import { Info, Loader2, X } from "lucide-react";
import { EPB_ZEN_PANEL_ATTR, getEpbZenModeClassName } from "./epb-zen-mode";

/** MPAs shown in the reference panel (excludes Miscellaneous) */
const REFERENCE_MPAS = STANDARD_MGAS.filter((mpa) => mpa.key !== "miscellaneous");

interface MpaDescriptionToggleButtonProps {
  mpaKey: string;
}

export function MpaDescriptionToggleButton({ mpaKey }: MpaDescriptionToggleButtonProps) {
  const { profile } = useUserStore();
  const mpaDescriptionDrawerOpen = useEPBShellStore((s) => s.mpaDescriptionDrawerOpen);
  const focusedMpaKey = useEPBShellStore((s) => s.focusedMpaKey);
  const toggleMpaDescriptionDrawer = useEPBShellStore((s) => s.toggleMpaDescriptionDrawer);
  const fetchMpaDescriptions = useEPBShellStore((s) => s.fetchMpaDescriptions);
  const isLoadingMpaDescriptions = useEPBShellStore((s) => s.isLoadingMpaDescriptions);

  const isActive = mpaDescriptionDrawerOpen && focusedMpaKey === mpaKey;

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (profile?.id) {
      await fetchMpaDescriptions(profile.id);
    }
    const wasOpen = mpaDescriptionDrawerOpen;
    const wasSameKey = focusedMpaKey === mpaKey;
    toggleMpaDescriptionDrawer(mpaKey);
    if (!wasOpen || !wasSameKey) {
      scrollMpaDescriptionPanelTo(mpaKey);
    }
  }, [profile?.id, fetchMpaDescriptions, toggleMpaDescriptionDrawer, mpaKey, mpaDescriptionDrawerOpen, focusedMpaKey]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center rounded-md size-6 sm:size-7 transition-colors shrink-0",
            isActive || mpaDescriptionDrawerOpen
              ? "text-primary bg-primary/10"
              : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted"
          )}
          onClick={handleClick}
          disabled={isLoadingMpaDescriptions}
          aria-label="MPA descriptions reference"
          aria-expanded={mpaDescriptionDrawerOpen}
        >
          {isLoadingMpaDescriptions ? (
            <Loader2 className="size-4 sm:size-5 animate-spin" />
          ) : (
            <Info className="size-4 sm:size-5" />
          )}
        </button>
      </TooltipTrigger>
      {!mpaDescriptionDrawerOpen && (
        <TooltipContent side="bottom">
          <p>MPA Descriptions</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function formatSubCompLabel(key: string) {
  return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const PANEL_WIDTH_CLASS = "w-64 sm:w-72 lg:w-80";

let panelScrollToMpa: ((mpaKey: string) => void) | null = null;

/** Scroll the MPA description panel so the given section is visible */
export function scrollMpaDescriptionPanelTo(mpaKey: string) {
  panelScrollToMpa?.(mpaKey);
}

function scrollItemWithinContainer(container: HTMLDivElement, item: HTMLDivElement) {
  const padding = 12;
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);

  if (itemTop >= viewTop + padding && itemBottom <= viewBottom - padding) {
    return;
  }

  let targetScroll = itemTop - Math.max(padding, container.clientHeight * 0.12);

  container.scrollTo({
    top: Math.min(maxScroll, Math.max(0, targetScroll)),
    behavior: "smooth",
  });
}

export function MpaDescriptionPanel() {
  const mpaDescriptionDrawerOpen = useEPBShellStore((s) => s.mpaDescriptionDrawerOpen);
  const focusedMpaKey = useEPBShellStore((s) => s.focusedMpaKey);
  const zenModeMpaKey = useEPBShellStore((s) => s.zenModeMpaKey);
  const mpaDescriptionsCache = useEPBShellStore((s) => s.mpaDescriptionsCache);
  const isLoadingMpaDescriptions = useEPBShellStore((s) => s.isLoadingMpaDescriptions);
  const closeMpaDescriptionDrawer = useEPBShellStore((s) => s.closeMpaDescriptionDrawer);

  const descriptions = mpaDescriptionsCache || DEFAULT_MPA_DESCRIPTIONS;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToMpa = useCallback((mpaKey: string) => {
    if (!useEPBShellStore.getState().mpaDescriptionDrawerOpen) return;
    const container = scrollContainerRef.current;
    const item = itemRefs.current[mpaKey];
    if (!container || !item) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollItemWithinContainer(container, item);
      });
    });
  }, []);

  const handleScrollContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollContainerRef.current = node;
      if (node) {
        panelScrollToMpa = scrollToMpa;
      } else if (panelScrollToMpa === scrollToMpa) {
        panelScrollToMpa = null;
      }
    },
    [scrollToMpa]
  );

  const handleClose = () => {
    closeMpaDescriptionDrawer();
  };

  return (
    <aside
      {...{ [EPB_ZEN_PANEL_ATTR]: "" }}
      aria-label="MPA descriptions reference"
      aria-hidden={!mpaDescriptionDrawerOpen}
      className={cn(
        "shrink-0 self-start transition-[width,margin] duration-300 ease-in-out sticky top-6",
        zenModeMpaKey ? "z-30" : "z-10",
        mpaDescriptionDrawerOpen
          ? PANEL_WIDTH_CLASS
          : "w-0 ml-0 pointer-events-none overflow-hidden"
      )}
    >
      <div
        className={cn(
          "flex min-h-0 flex-col border-l bg-background shadow-sm",
          PANEL_WIDTH_CLASS,
          "h-[calc(100svh-9rem)] max-h-[calc(100dvh-9rem)]"
        )}
      >
        <div className="shrink-0 border-b px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold leading-snug">MPA Descriptions</h2>
              <p id="mpa-description-panel-desc" className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Reference while editing. Active section highlights automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-md size-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close MPA descriptions"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div
          ref={handleScrollContainerRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
        >
          {isLoadingMpaDescriptions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-3.5">
              {REFERENCE_MPAS.map((mpa) => {
                const desc = descriptions[mpa.key] || DEFAULT_MPA_DESCRIPTIONS[mpa.key];
                const isFocused = focusedMpaKey === mpa.key;
                const subCompetencies = desc?.sub_competencies || {};

                return (
                  <div
                    key={mpa.key}
                    ref={(el) => {
                      itemRefs.current[mpa.key] = el;
                    }}
                    className={cn(
                      "rounded-lg border p-4 transition-colors duration-200",
                      isFocused
                        ? "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/15"
                        : "border-border/60 bg-muted/20",
                      zenModeMpaKey && getEpbZenModeClassName(zenModeMpaKey, mpa.key)
                    )}
                    aria-current={isFocused ? "true" : undefined}
                  >
                    <h3
                      className={cn(
                        "text-xs sm:text-sm font-semibold leading-snug",
                        isFocused ? "text-primary" : "text-foreground"
                      )}
                    >
                      {desc?.title || mpa.label}
                    </h3>
                    <p className="mt-1.5 text-xs text-foreground/80 leading-relaxed">
                      {desc?.description || "No description available."}
                    </p>

                    {Object.keys(subCompetencies).length > 0 && (
                      <div className="mt-2.5 space-y-2 border-t border-border/40 pt-2.5">
                        {Object.entries(subCompetencies).map(([key, value]) => (
                          <div key={key}>
                            <p className="text-[11px] font-semibold text-foreground/90">
                              {formatSubCompLabel(key)}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Spacer so last MPAs (HLR) can scroll up into view without scrolling the main page */}
              <div aria-hidden className="h-[40vh] min-h-56 shrink-0" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

/** @deprecated Use MpaDescriptionPanel */
export function MpaDescriptionDrawer() {
  return <MpaDescriptionPanel />;
}

/** @deprecated Use MpaDescriptionToggleButton */
export function MpaDescriptionEditor({ mpaKey }: MpaDescriptionToggleButtonProps) {
  return <MpaDescriptionToggleButton mpaKey={mpaKey} />;
}

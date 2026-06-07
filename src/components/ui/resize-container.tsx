"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ResizeMeasure = "height" | "both";

interface ResizeContainerProps {
  children: ReactNode;
  className?: string;
  /** When "both", width and height tween on content changes (modal step transitions). */
  measure?: ResizeMeasure;
}

/**
 * Smoothly animates size when children change (tabs, modal steps, conditional panels).
 * Based on transitions.dev card-resize — explicit dimension tween via ResizeObserver.
 */
export function ResizeContainer({
  children,
  className,
  measure = "height",
}: ResizeContainerProps) {
  const [height, setHeight] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [canAnimate, setCanAnimate] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);
  const frameRef = useRef<number | null>(null);

  const contentRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (!node) return;

    const measureNode = () => {
      const rect = node.getBoundingClientRect();
      setHeight(rect.height);
      if (measure === "both") {
        setWidth(rect.width);
      }
    };

    measureNode();

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        setCanAnimate(true);
        frameRef.current = null;
      });
    });

    const observer = new ResizeObserver(() => {
      measureNode();
    });
    observer.observe(node);
    observerRef.current = observer;
  }, [measure]);

  const animateBoth = measure === "both" && canAnimate;

  return (
    <div
      className={cn(
        "overflow-hidden",
        canAnimate && "t-resize",
        className
      )}
      style={{
        height: height === null ? "auto" : `${height}px`,
        width:
          measure === "both"
            ? width === null
              ? "auto"
              : `${width}px`
            : undefined,
      }}
    >
      <div
        ref={contentRef}
        className={cn(
          measure === "both" && "w-fit max-w-full",
          animateBoth && "min-w-0"
        )}
      >
        {children}
      </div>
    </div>
  );
}

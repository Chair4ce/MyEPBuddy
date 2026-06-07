"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ResizeContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Smoothly animates height when children change size (tabs, conditional panels, etc.).
 * Based on transitions.dev card-resize — explicit height tween via ResizeObserver.
 */
export function ResizeContainer({ children, className }: ResizeContainerProps) {
  const [height, setHeight] = useState<number | null>(null);
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

    const measure = () => {
      setHeight(node.getBoundingClientRect().height);
    };

    measure();

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        setCanAnimate(true);
        frameRef.current = null;
      });
    });

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden",
        canAnimate &&
          "transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[height] motion-reduce:transition-none",
        className
      )}
      style={{ height: height === null ? "auto" : `${height}px` }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

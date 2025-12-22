"use client";

import { useEffect, useRef, useState } from "react";
import { AF1206_LINE_WIDTH_PX } from "@/lib/bullet-fitting";
import { cn } from "@/lib/utils";

/**
 * Bullet preview component based on pdf-bullets project.
 * https://github.com/AF-VCD/pdf-bullets
 * 
 * Uses canvas.measureText() to accurately measure text width,
 * including the special Unicode spaces (\u2006, \u2004).
 * The browser knows how to render these spaces at their correct widths.
 */

export interface LineMetric {
  text: string;
  width: number;
  fillPercent: number;
  isOverflow: boolean;
}

interface BulletCanvasPreviewProps {
  text: string;
  width?: number;
  className?: string;
  onMetricsChange?: (metrics: LineMetric[]) => void;
}

// Adobe line split regex - split after space, ?, /, |, -, %, ! if followed by alphanumeric
function adobeLineSplit(text: string): string[] {
  const regex = /([\u2004\u2009\u2006\s?/|\-%!])(?=[a-zA-Z0-9+\\])/;
  return text.split(regex).filter(Boolean);
}

// Render text with line wrapping based on measured widths (like pdf-bullets)
function renderBulletText(
  text: string,
  getWidth: (t: string) => number,
  targetWidth: number
): { textLines: string[]; overflow: number } {
  if (!text || text.trim() === "") {
    return { textLines: [""], overflow: -targetWidth };
  }

  const fullWidth = getWidth(text.trimEnd());

  if (fullWidth <= targetWidth) {
    return {
      textLines: [text],
      overflow: fullWidth - targetWidth,
    };
  }

  // Text is wider than target - find where to break
  const textSplit = adobeLineSplit(text);

  if (textSplit.length > 0 && getWidth(textSplit[0]?.trimEnd() || "") < targetWidth) {
    let answerIdx = 0;
    for (let i = 1; i <= textSplit.length; i++) {
      const evalText = textSplit.slice(0, i).join("").trimEnd();
      if (getWidth(evalText) > targetWidth) {
        answerIdx = i - 1;
        break;
      }
    }

    const firstLine = textSplit.slice(0, answerIdx).join("");
    const remainder = textSplit.slice(answerIdx).join("");

    if (remainder === text || !remainder) {
      return { textLines: [text], overflow: fullWidth - targetWidth };
    }

    const recursedResult = renderBulletText(remainder, getWidth, targetWidth);
    return {
      textLines: [firstLine, ...recursedResult.textLines],
      overflow: fullWidth - targetWidth,
    };
  }

  // First token is wider than target - do character-level break
  const avgCharWidth = fullWidth / text.length;
  const guessIndex = Math.floor(targetWidth / avgCharWidth);
  let answerIdx = guessIndex;

  if (getWidth(text.substring(0, guessIndex)) > targetWidth) {
    for (let i = guessIndex - 1; i > 0; i--) {
      if (getWidth(text.substring(0, i)) < targetWidth) {
        answerIdx = i;
        break;
      }
    }
  } else {
    for (let i = guessIndex; i <= text.length; i++) {
      if (getWidth(text.substring(0, i)) > targetWidth) {
        answerIdx = i - 1;
        break;
      }
    }
  }

  const firstLine = text.substring(0, answerIdx);
  const remainder = text.substring(answerIdx);

  if (remainder === text || !remainder) {
    return { textLines: [text], overflow: fullWidth - targetWidth };
  }

  const recursedResult = renderBulletText(remainder, getWidth, targetWidth);
  return {
    textLines: [firstLine, ...recursedResult.textLines],
    overflow: fullWidth - targetWidth,
  };
}

export function BulletCanvasPreview({
  text,
  width = AF1206_LINE_WIDTH_PX,
  className = "",
  onMetricsChange,
}: BulletCanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lineMetrics, setLineMetrics] = useState<LineMetric[]>([]);

  // Check if text contains special spacing
  const isCompressed = text.includes('\u2006');
  const isExpanded = text.includes('\u2004');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Settings - use 12pt Times New Roman like the actual 1206
    const fontSize = 12;
    const lineHeight = fontSize * 1.5;
    const padding = 8;
    const maxWidth = width - padding * 2;

    // Set font FIRST so measureText works correctly
    ctx.font = `${fontSize}pt "Times New Roman", Times, serif`;

    // Create width measurement function (exactly like pdf-bullets does)
    const getWidth = (t: string) => ctx.measureText(t).width;

    // Render text with proper line breaking using actual measured widths
    const { textLines } = renderBulletText(text, getWidth, maxWidth);

    // Calculate canvas height
    const textHeight = Math.max(1, textLines.length) * lineHeight;
    const canvasHeight = textHeight + padding * 2;

    // Set canvas size with device pixel ratio for sharpness
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, canvasHeight);

    // Re-set font after scaling
    ctx.font = `${fontSize}pt "Times New Roman", Times, serif`;
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "top";

    // Calculate metrics for each line BEFORE drawing
    const metrics: LineMetric[] = textLines.map(line => {
      const lineWidth = ctx.measureText(line.trimEnd()).width;
      const fillPercent = Math.round((lineWidth / maxWidth) * 100);
      return {
        text: line,
        width: lineWidth,
        fillPercent,
        isOverflow: fillPercent > 100,
      };
    });

    // Update state and notify parent
    setLineMetrics(metrics);
    if (onMetricsChange) {
      onMetricsChange(metrics);
    }

    // Draw text lines - the browser will render \u2006 and \u2004 at correct widths
    for (let lineIdx = 0; lineIdx < textLines.length; lineIdx++) {
      const line = textLines[lineIdx];
      const y = padding + lineIdx * lineHeight;
      
      // Draw the line as-is - browser handles special Unicode spaces correctly
      ctx.fillText(line, padding, y);
    }

  }, [text, width, isCompressed, isExpanded, onMetricsChange]);

  // Count sentences
  const sentenceCount = text.split(/[.!?]/).filter(s => s.trim().length > 0).length;

  return (
    <div className="space-y-3">
      {/* Canvas Preview */}
      <canvas
        ref={canvasRef}
        className={`border rounded shadow-sm ${className}`}
        style={{ 
          display: "block",
          backgroundColor: "#fff",
        }}
      />

      {/* Line Fill Bars */}
      <div className="p-3 border rounded-lg bg-muted/20 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">1206 Line Fill</span>
            {isCompressed && (
              <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded border border-green-300">
                Compressed
              </span>
            )}
            {isExpanded && (
              <span className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-300">
                Expanded
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{sentenceCount} sentence{sentenceCount !== 1 ? "s" : ""}</span>
            <span>•</span>
            <span>{lineMetrics.length} line{lineMetrics.length !== 1 ? "s" : ""}</span>
            <span>•</span>
            <span>{text.length} chars</span>
          </div>
        </div>

        <div className="space-y-1.5">
          {lineMetrics.map((metric, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-8">L{i + 1}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    metric.isOverflow ? "bg-red-500" :
                    metric.fillPercent >= 95 ? "bg-green-500" :
                    metric.fillPercent >= 85 ? "bg-amber-500" :
                    "bg-blue-500"
                  )}
                  style={{ width: `${Math.min(100, metric.fillPercent)}%` }}
                />
                {/* 95% marker */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-green-600/50"
                  style={{ left: '95%' }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-12 text-right">
                {metric.fillPercent}%
              </span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          {lineMetrics.some(m => m.isOverflow) ? (
            <span className="text-red-500">⚠️ Text overflows - compress spacing or shorten text.</span>
          ) : lineMetrics.every(m => m.fillPercent >= 95 && m.fillPercent <= 100) ? (
            <span className="text-green-500">✓ Optimal fill! All lines 95-100%.</span>
          ) : lineMetrics.some(m => m.fillPercent < 85) ? (
            <span className="text-blue-500">Room to add more impact details.</span>
          ) : (
            <span className="text-amber-500">Well-filled, could optimize further.</span>
          )}
        </p>
      </div>
    </div>
  );
}

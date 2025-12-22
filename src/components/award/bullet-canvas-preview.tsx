"use client";

import { useEffect, useRef, useState } from "react";
import { AF1206_LINE_WIDTH_PX } from "@/lib/bullet-fitting";
import { cn } from "@/lib/utils";

/**
 * Line fill indicator component based on pdf-bullets project.
 * https://github.com/AF-VCD/pdf-bullets
 * 
 * Uses a hidden canvas to measure text width accurately,
 * then displays line fill bars with per-line compress/normalize controls.
 */

export interface LineMetric {
  text: string;
  width: number;
  fillPercent: number;
  isOverflow: boolean;
  isCompressed: boolean;
  startIndex: number;
  endIndex: number;
}

interface LineFillIndicatorProps {
  text: string;
  width?: number;
  className?: string;
  onMetricsChange?: (metrics: LineMetric[]) => void;
  onCompressLine?: (lineIndex: number) => void;
  onNormalizeLine?: (lineIndex: number) => void;
}

// Adobe line split regex - split after space, ?, /, |, -, %, ! if followed by alphanumeric
function adobeLineSplit(text: string): string[] {
  const regex = /([\u2004\u2009\u2006\s?/|\-%!])(?=[a-zA-Z0-9+\\])/;
  return text.split(regex).filter(Boolean);
}

interface LineInfo {
  text: string;
  startIndex: number;
  endIndex: number;
}

// Render text with line wrapping based on measured widths
function renderBulletText(
  text: string,
  getWidth: (t: string) => number,
  targetWidth: number,
  startOffset: number = 0
): { lines: LineInfo[]; overflow: number } {
  if (!text || text.trim() === "") {
    return { lines: [{ text: "", startIndex: startOffset, endIndex: startOffset }], overflow: -targetWidth };
  }

  const fullWidth = getWidth(text.trimEnd());

  if (fullWidth <= targetWidth) {
    return {
      lines: [{ text, startIndex: startOffset, endIndex: startOffset + text.length }],
      overflow: fullWidth - targetWidth,
    };
  }

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
      return { 
        lines: [{ text, startIndex: startOffset, endIndex: startOffset + text.length }], 
        overflow: fullWidth - targetWidth 
      };
    }

    const recursedResult = renderBulletText(remainder, getWidth, targetWidth, startOffset + firstLine.length);
    return {
      lines: [
        { text: firstLine, startIndex: startOffset, endIndex: startOffset + firstLine.length },
        ...recursedResult.lines
      ],
      overflow: fullWidth - targetWidth,
    };
  }

  // Character-level break for very long words
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
    return { 
      lines: [{ text, startIndex: startOffset, endIndex: startOffset + text.length }], 
      overflow: fullWidth - targetWidth 
    };
  }

  const recursedResult = renderBulletText(remainder, getWidth, targetWidth, startOffset + firstLine.length);
  return {
    lines: [
      { text: firstLine, startIndex: startOffset, endIndex: startOffset + firstLine.length },
      ...recursedResult.lines
    ],
    overflow: fullWidth - targetWidth,
  };
}

export function BulletCanvasPreview({
  text,
  width = AF1206_LINE_WIDTH_PX,
  className = "",
  onMetricsChange,
  onCompressLine,
  onNormalizeLine,
}: LineFillIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lineMetrics, setLineMetrics] = useState<LineMetric[]>([]);
  
  // Store callback in ref to avoid infinite loops
  const onMetricsChangeRef = useRef(onMetricsChange);
  onMetricsChangeRef.current = onMetricsChange;

  // Check if text contains special spacing
  const isCompressed = text.includes('\u2006');
  const isExpanded = text.includes('\u2004');

  useEffect(() => {
    // Create hidden canvas for text measurement
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fontSize = 12;
    const padding = 8;
    const maxWidth = width - padding * 2;

    ctx.font = `${fontSize}pt "Times New Roman", Times, serif`;
    const getWidth = (t: string) => ctx.measureText(t).width;

    const { lines } = renderBulletText(text, getWidth, maxWidth);

    const metrics: LineMetric[] = lines.map(lineInfo => {
      const lineWidth = ctx.measureText(lineInfo.text.trimEnd()).width;
      const fillPercent = Math.round((lineWidth / maxWidth) * 100);
      const lineIsCompressed = lineInfo.text.includes('\u2006');
      return {
        text: lineInfo.text,
        width: lineWidth,
        fillPercent,
        isOverflow: fillPercent > 100,
        isCompressed: lineIsCompressed,
        startIndex: lineInfo.startIndex,
        endIndex: lineInfo.endIndex,
      };
    });

    setLineMetrics(metrics);
    if (onMetricsChangeRef.current) {
      onMetricsChangeRef.current(metrics);
    }
  }, [text, width, isCompressed, isExpanded]);

  const sentenceCount = text.split(/[.!?]/).filter(s => s.trim().length > 0).length;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Hidden canvas for text measurement */}
      <canvas ref={canvasRef} width={width} height={50} className="hidden" />

      {/* Line Fill Bars */}
      <div className="p-3 border rounded-lg bg-muted/20 space-y-2" style={{ minHeight: "120px" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium shrink-0">1206 Line Fill</span>
            <div className="w-20 h-5">
              {isCompressed && (
                <span className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 px-1.5 py-0.5 rounded border border-green-300 transition-opacity">
                  Compressed
                </span>
              )}
              {isExpanded && (
                <span className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-300 transition-opacity">
                  Expanded
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <span>{sentenceCount} sentence{sentenceCount !== 1 ? "s" : ""}</span>
            <span>•</span>
            <span>{lineMetrics.length} line{lineMetrics.length !== 1 ? "s" : ""}</span>
            <span>•</span>
            <span>{text.length} chars</span>
          </div>
        </div>

        {/* Line bars with controls */}
        <div className="space-y-1.5" style={{ minHeight: "44px" }}>
          {[0, 1, 2].map((i) => {
            const metric = lineMetrics[i];
            const hasLine = !!metric;
            
            return (
              <div 
                key={i} 
                className={cn(
                  "flex items-center gap-2 transition-opacity duration-200",
                  !hasLine && "opacity-30"
                )}
              >
                <span className="text-xs text-muted-foreground w-8">L{i + 1}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden relative">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      !hasLine ? "bg-muted" :
                      metric.isOverflow ? "bg-red-500" :
                      metric.fillPercent >= 95 ? "bg-green-500" :
                      metric.fillPercent >= 85 ? "bg-amber-500" :
                      "bg-blue-500"
                    )}
                    style={{ width: hasLine ? `${Math.min(100, metric.fillPercent)}%` : "0%" }}
                  />
                  <div
                    className="absolute top-0 bottom-0 w-px bg-green-600/50"
                    style={{ left: '95%' }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">
                  {hasLine ? `${metric.fillPercent}%` : "—"}
                </span>
                {/* Per-line compress/normalize buttons */}
                <div className="flex items-center gap-0.5 w-14 justify-end">
                  {hasLine && (
                    <>
                      {metric.isCompressed ? (
                        <button
                          onClick={() => onNormalizeLine?.(i)}
                          disabled={!onNormalizeLine}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                            "bg-green-50 text-green-700 border-green-200 hover:bg-green-100",
                            "dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/50",
                            !onNormalizeLine && "opacity-50 cursor-not-allowed"
                          )}
                          title="Normalize line spacing"
                        >
                          ↔
                        </button>
                      ) : metric.fillPercent > 95 ? (
                        <button
                          onClick={() => onCompressLine?.(i)}
                          disabled={!onCompressLine}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                            "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
                            "dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/50",
                            !onCompressLine && "opacity-50 cursor-not-allowed"
                          )}
                          title="Compress line spacing"
                        >
                          ←→
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Status message */}
        <p className="text-xs text-muted-foreground pt-1 h-5">
          {lineMetrics.length === 0 ? (
            <span className="text-muted-foreground">Enter text to see line fill.</span>
          ) : lineMetrics.some(m => m.isOverflow) ? (
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

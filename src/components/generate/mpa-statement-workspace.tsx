"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { cn, getCharacterCountColor } from "@/lib/utils";
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  BookmarkPlus,
  RefreshCw,
  Wand2,
  Clock,
  DollarSign,
  Boxes,
  Pencil,
  MoreVertical,
  Split,
  Save,
} from "lucide-react";

export type ImpactFocus = "none" | "time" | "cost" | "resources" | "custom";

interface MPAInput {
  context: string;
  context2?: string;
  statementCount: 1 | 2;
  impactFocus: ImpactFocus;
  impactFocus2?: ImpactFocus;
  customImpact?: string;
  customImpact2?: string;
}

interface GeneratedStatement {
  statement1: string;
  statement2?: string;
  combined: string;
}

interface MPAStatementWorkspaceProps {
  mpaKey: string;
  mpaLabel: string;
  maxChars: number;
  input: MPAInput;
  generated?: GeneratedStatement;
  isGenerating: boolean;
  onInputChange: (input: MPAInput) => void;
  onGenerate: () => void;
  onReviseStatement: (statementNum: 1 | 2, newImpactFocus: ImpactFocus, customImpact?: string, additionalContext?: string) => void;
  onSave: (statement: string) => void;
  onSynonymLookup: (word: string) => Promise<string[]>;
}

// Impact focus button component
function ImpactButton({ 
  focus, 
  currentFocus, 
  customValue,
  onClick,
  onCustomChange,
  compact = false 
}: { 
  focus: ImpactFocus;
  currentFocus: ImpactFocus;
  customValue?: string;
  onClick: (focus: ImpactFocus) => void;
  onCustomChange?: (value: string) => void;
  compact?: boolean;
}) {
  const isSelected = currentFocus === focus;
  const baseClasses = compact 
    ? "px-2 py-1 text-xs" 
    : "px-3 py-1.5 text-xs";
  
  const configs: Record<ImpactFocus, { label: string; icon: React.ReactNode; activeClass: string }> = {
    none: { label: "Auto", icon: null, activeClass: "bg-primary text-primary-foreground border-primary" },
    time: { label: compact ? "Time" : "Time Saved", icon: <Clock className="size-3" />, activeClass: "bg-emerald-600 text-white border-emerald-600" },
    cost: { label: compact ? "Cost" : "Cost Savings", icon: <DollarSign className="size-3" />, activeClass: "bg-primary text-primary-foreground border-primary" },
    resources: { label: compact ? "Resources" : "Resource Efficiency", icon: <Boxes className="size-3" />, activeClass: "bg-primary/80 text-primary-foreground border-primary/80" },
    custom: { label: customValue || "Custom", icon: <Pencil className="size-3" />, activeClass: "bg-amber-600 text-white border-amber-600" },
  };

  const config = configs[focus];

  if (focus === "custom") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              baseClasses,
              "rounded-md border font-medium transition-colors flex items-center gap-1",
              isSelected ? config.activeClass : "bg-card hover:bg-muted/50 border-border"
            )}
          >
            {config.icon}
            {config.label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-2">
            <Label className="text-xs">Custom Impact Focus</Label>
            <input
              type="text"
              value={customValue || ""}
              onChange={(e) => {
                onCustomChange?.(e.target.value);
                onClick("custom");
              }}
              placeholder="e.g., Mission Readiness, Team Morale"
              className="w-full px-2 py-1.5 text-sm border rounded-md"
            />
            <p className="text-xs text-muted-foreground">
              Define a custom impact category
            </p>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onClick(focus)}
      className={cn(
        baseClasses,
        "rounded-md border font-medium transition-colors flex items-center gap-1",
        isSelected ? config.activeClass : "bg-card hover:bg-muted/50 border-border"
      )}
    >
      {config.icon}
      {config.label}
    </button>
  );
}

// Statement editor component with highlight tools
function StatementEditor({
  value,
  onChange,
  statementNum,
  maxChars,
  otherStatementLength = 0,
  isRevising,
  onRevise,
  onSynonymLookup,
}: {
  value: string;
  onChange: (value: string) => void;
  statementNum?: 1 | 2;
  maxChars: number;
  otherStatementLength?: number;
  isRevising: boolean;
  onRevise?: (additionalContext?: string) => void;
  onSynonymLookup: (word: string) => Promise<string[]>;
}) {
  const [selectedText, setSelectedText] = useState("");
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [isLoadingSynonyms, setIsLoadingSynonyms] = useState(false);
  const [showReviseInput, setShowReviseInput] = useState(false);
  const [reviseContext, setReviseContext] = useState("");

  const availableChars = maxChars - otherStatementLength;
  const charCount = value.length;
  const isOverLimit = charCount > availableChars;

  const handleTextSelect = useCallback(async () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0 && text.split(" ").length <= 3) {
      setSelectedText(text);
      setIsLoadingSynonyms(true);
      try {
        const results = await onSynonymLookup(text);
        setSynonyms(results);
      } catch {
        setSynonyms([]);
      } finally {
        setIsLoadingSynonyms(false);
      }
    } else {
      setSelectedText("");
      setSynonyms([]);
    }
  }, [onSynonymLookup]);

  const replaceSynonym = (synonym: string) => {
    const newValue = value.replace(new RegExp(`\\b${selectedText}\\b`, "i"), synonym);
    onChange(newValue);
    setSelectedText("");
    setSynonyms([]);
    toast.success(`Replaced "${selectedText}" with "${synonym}"`);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {statementNum && (
          <Badge variant="outline" className="text-xs">
            Statement {statementNum}
          </Badge>
        )}
        <span className={cn(
          "text-xs",
          isOverLimit ? "text-destructive font-semibold" : getCharacterCountColor(charCount, availableChars)
        )}>
          {charCount}/{availableChars} chars
        </span>
      </div>
      
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onMouseUp={handleTextSelect}
          onKeyUp={handleTextSelect}
          rows={3}
          className={cn(
            "resize-none text-sm font-mono",
            isOverLimit && "border-destructive focus-visible:ring-destructive"
          )}
        />
        
        {/* Synonym popover */}
        {selectedText && (
          <div className="absolute top-full left-0 mt-1 z-10 bg-popover border rounded-lg shadow-lg p-2 max-w-xs">
            <p className="text-xs text-muted-foreground mb-1">
              Synonyms for &quot;{selectedText}&quot;:
            </p>
            {isLoadingSynonyms ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Loading...
              </div>
            ) : synonyms.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {synonyms.slice(0, 6).map((syn) => (
                  <button
                    key={syn}
                    onClick={() => replaceSynonym(syn)}
                    className="px-2 py-0.5 text-xs bg-primary/10 hover:bg-primary/20 rounded transition-colors"
                  >
                    {syn}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No synonyms found</p>
            )}
            <button
              onClick={() => { setSelectedText(""); setSynonyms([]); }}
              className="text-xs text-muted-foreground mt-1 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      <Progress
        value={Math.min((charCount / availableChars) * 100, 100)}
        className={cn("h-1", isOverLimit && "[&>*]:bg-destructive")}
      />

      {/* Revise tools */}
      {onRevise && (
        <div className="flex items-center gap-2">
          {!showReviseInput ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReviseInput(true)}
              disabled={isRevising}
              className="h-7 text-xs"
            >
              {isRevising ? (
                <Loader2 className="size-3 animate-spin mr-1" />
              ) : (
                <Wand2 className="size-3 mr-1" />
              )}
              Revise with AI
            </Button>
          ) : (
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                value={reviseContext}
                onChange={(e) => setReviseContext(e.target.value)}
                placeholder="Add context for revision (optional)..."
                className="flex-1 px-2 py-1 text-xs border rounded"
              />
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  onRevise(reviseContext || undefined);
                  setReviseContext("");
                  setShowReviseInput(false);
                }}
                disabled={isRevising}
                className="h-7 text-xs"
              >
                {isRevising ? <Loader2 className="size-3 animate-spin" /> : "Revise"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowReviseInput(false); setReviseContext(""); }}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MPAStatementWorkspace({
  mpaKey,
  mpaLabel,
  maxChars,
  input,
  generated,
  isGenerating,
  onInputChange,
  onGenerate,
  onReviseStatement,
  onSave,
  onSynonymLookup,
}: MPAStatementWorkspaceProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRevisingStatement, setIsRevisingStatement] = useState<1 | 2 | null>(null);
  const [editedStatement1, setEditedStatement1] = useState("");
  const [editedStatement2, setEditedStatement2] = useState("");
  const [reviseImpactFocus, setReviseImpactFocus] = useState<ImpactFocus>("none");
  const [reviseCustomImpact, setReviseCustomImpact] = useState("");

  // Initialize edited statements from generated
  useEffect(() => {
    if (generated) {
      setEditedStatement1(generated.statement1);
      setEditedStatement2(generated.statement2 || "");
    }
  }, [generated]);

  const combinedStatement = input.statementCount === 2
    ? `${editedStatement1}. ${editedStatement2}`
    : editedStatement1;
  
  const totalChars = combinedStatement.length;
  const isOverLimit = totalChars > maxChars;

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied to clipboard");
  };

  const handleRevise = async (statementNum: 1 | 2, additionalContext?: string) => {
    setIsRevisingStatement(statementNum);
    try {
      await onReviseStatement(
        statementNum,
        reviseImpactFocus,
        reviseImpactFocus === "custom" ? reviseCustomImpact : undefined,
        additionalContext
      );
    } finally {
      setIsRevisingStatement(null);
    }
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">{mpaLabel}</h3>
        <div className="flex items-center gap-2">
          {generated && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(combinedStatement, `${mpaKey}-combined`)}
                className="h-7 text-xs"
              >
                {copiedId === `${mpaKey}-combined` ? (
                  <Check className="size-3 mr-1" />
                ) : (
                  <Copy className="size-3 mr-1" />
                )}
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSave(combinedStatement)}
                className="h-7 text-xs"
              >
                <BookmarkPlus className="size-3 mr-1" />
                Save
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onGenerate} disabled={isGenerating}>
                <RefreshCw className="size-4 mr-2" />
                Regenerate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onInputChange({ ...input, statementCount: input.statementCount === 1 ? 2 : 1 })}>
                <Split className="size-4 mr-2" />
                {input.statementCount === 1 ? "Split into 2 statements" : "Combine into 1 statement"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Input Section - only show if not generated yet */}
      {!generated && (
        <div className="space-y-4">
          {/* Statement count toggle */}
          <div className="flex items-center gap-2">
            <Label className="text-xs">Statements:</Label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onInputChange({ ...input, statementCount: 1 })}
                className={cn(
                  "px-2 py-1 text-xs rounded border transition-colors",
                  input.statementCount === 1 ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/50"
                )}
              >
                1
              </button>
              <button
                type="button"
                onClick={() => onInputChange({ ...input, statementCount: 2 })}
                className={cn(
                  "px-2 py-1 text-xs rounded border transition-colors",
                  input.statementCount === 2 ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/50"
                )}
              >
                2
              </button>
            </div>
          </div>

          {/* Statement 1 input */}
          <div className="space-y-2">
            {input.statementCount === 2 && (
              <Label className="text-xs font-medium">Statement 1</Label>
            )}
            <Textarea
              value={input.context}
              onChange={(e) => onInputChange({ ...input, context: e.target.value })}
              placeholder="Paste accomplishment details, metrics, impact..."
              rows={3}
              className="resize-none text-sm font-mono"
            />
            <div className="flex flex-wrap gap-1">
              {(["none", "time", "cost", "resources", "custom"] as ImpactFocus[]).map((focus) => (
                <ImpactButton
                  key={focus}
                  focus={focus}
                  currentFocus={input.impactFocus}
                  customValue={input.customImpact}
                  onClick={(f) => onInputChange({ ...input, impactFocus: f })}
                  onCustomChange={(v) => onInputChange({ ...input, customImpact: v })}
                  compact
                />
              ))}
            </div>
          </div>

          {/* Statement 2 input */}
          {input.statementCount === 2 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Statement 2</Label>
              <Textarea
                value={input.context2 || ""}
                onChange={(e) => onInputChange({ ...input, context2: e.target.value })}
                placeholder="Second accomplishment details..."
                rows={3}
                className="resize-none text-sm font-mono"
              />
              <div className="flex flex-wrap gap-1">
                {(["none", "time", "cost", "resources", "custom"] as ImpactFocus[]).map((focus) => (
                  <ImpactButton
                    key={focus}
                    focus={focus}
                    currentFocus={input.impactFocus2 || "none"}
                    customValue={input.customImpact2}
                    onClick={(f) => onInputChange({ ...input, impactFocus2: f })}
                    onCustomChange={(v) => onInputChange({ ...input, customImpact2: v })}
                    compact
                  />
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={onGenerate}
            disabled={isGenerating || !input.context.trim()}
            size="sm"
            className="w-full"
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Sparkles className="size-4 mr-2" />
            )}
            Generate
          </Button>
        </div>
      )}

      {/* Generated Statement Editor */}
      {generated && (
        <div className="space-y-4">
          {/* Combined view header */}
          <div className={cn(
            "p-2 rounded border text-xs flex items-center justify-between",
            isOverLimit ? "bg-destructive/10 border-destructive/30" : "bg-muted/50"
          )}>
            <span>Total: {totalChars}/{maxChars}</span>
            <Progress
              value={Math.min((totalChars / maxChars) * 100, 100)}
              className={cn("w-20 h-1.5", isOverLimit && "[&>*]:bg-destructive")}
            />
          </div>

          {/* Revise impact focus selector */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Impact focus for revisions:</Label>
            <div className="flex flex-wrap gap-1">
              {(["none", "time", "cost", "resources", "custom"] as ImpactFocus[]).map((focus) => (
                <ImpactButton
                  key={focus}
                  focus={focus}
                  currentFocus={reviseImpactFocus}
                  customValue={reviseCustomImpact}
                  onClick={setReviseImpactFocus}
                  onCustomChange={setReviseCustomImpact}
                  compact
                />
              ))}
            </div>
          </div>

          {/* Statement 1 editor */}
          <StatementEditor
            value={editedStatement1}
            onChange={setEditedStatement1}
            statementNum={input.statementCount === 2 ? 1 : undefined}
            maxChars={maxChars}
            otherStatementLength={input.statementCount === 2 ? editedStatement2.length + 2 : 0} // +2 for ". "
            isRevising={isRevisingStatement === 1}
            onRevise={input.statementCount === 2 ? (ctx) => handleRevise(1, ctx) : undefined}
            onSynonymLookup={onSynonymLookup}
          />

          {/* Statement 2 editor */}
          {input.statementCount === 2 && (
            <StatementEditor
              value={editedStatement2}
              onChange={setEditedStatement2}
              statementNum={2}
              maxChars={maxChars}
              otherStatementLength={editedStatement1.length + 2} // +2 for ". "
              isRevising={isRevisingStatement === 2}
              onRevise={(ctx) => handleRevise(2, ctx)}
              onSynonymLookup={onSynonymLookup}
            />
          )}

          {/* Combined preview */}
          <div className="p-3 rounded-lg bg-muted/30 border">
            <Label className="text-xs text-muted-foreground mb-2 block">Combined Preview:</Label>
            <p className="text-sm leading-relaxed">{combinedStatement}</p>
          </div>
        </div>
      )}
    </div>
  );
}






"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { ENTRY_MGAS } from "@/lib/constants";
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
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from "lucide-react";
import { useClarifyingQuestionsStore } from "@/stores/clarifying-questions-store";
import { ClarifyingQuestionsModal, ClarifyingQuestionsIndicator } from "./clarifying-questions-modal";

// Types
export type ImpactFocus = "none" | "time" | "cost" | "resources" | "custom";

interface StatementInput {
  context: string;
  impactFocus: ImpactFocus;
  customImpact?: string;
}

interface MPAWorkspaceData {
  statementCount: 1 | 2;
  statement1: StatementInput;
  statement2?: StatementInput;
  generated?: {
    text1: string;
    text2?: string;
  };
  edited?: {
    text1: string;
    text2?: string;
  };
  relevancyScore?: number; // 0-100 score of how well the accomplishment fits this MPA
  isSaved?: boolean;
  isExpanded?: boolean;
}

interface WorkspaceSession {
  rateeId: string;
  selectedMPAs: string[];
  mpaData: Record<string, MPAWorkspaceData>;
  usedVerbs: string[]; // Track verbs used in this session for variety
  lastUpdated: number;
}

// Helper to extract opening verb from a statement
function extractOpeningVerb(statement: string): string | null {
  const cleaned = statement.trim().replace(/^[-•]\s*/, "");
  const firstWord = cleaned.split(/\s+/)[0];
  if (firstWord && firstWord.length > 2) {
    return firstWord.toLowerCase().replace(/[^a-z]/g, "");
  }
  return null;
}

interface CustomContextWorkspaceProps {
  rateeId: string;
  rateeRank: string;
  rateeAfsc: string;
  maxChars: number;
  model: string;
  cycleYear: number;
  selectedMPAs: string[]; // MPAs selected from parent page
  onSaveStatement: (mpa: string, statement: string) => Promise<void>;
  onStartWorking?: () => void; // Callback when user starts generating/editing
}

const STORAGE_KEY = "epb-custom-context-session";

// Impact button component
function ImpactButton({
  focus,
  currentFocus,
  customValue,
  onClick,
  onCustomChange,
}: {
  focus: ImpactFocus;
  currentFocus: ImpactFocus;
  customValue?: string;
  onClick: (focus: ImpactFocus) => void;
  onCustomChange?: (value: string) => void;
}) {
  const isSelected = currentFocus === focus;

  const configs: Record<ImpactFocus, { label: string; icon: React.ReactNode; activeClass: string }> = {
    none: { label: "Auto", icon: null, activeClass: "bg-primary text-primary-foreground border-primary" },
    time: { label: "Time", icon: <Clock className="size-3" />, activeClass: "bg-emerald-600 text-white border-emerald-600" },
    cost: { label: "Cost", icon: <DollarSign className="size-3" />, activeClass: "bg-blue-600 text-white border-blue-600" },
    resources: { label: "Resources", icon: <Boxes className="size-3" />, activeClass: "bg-primary text-primary-foreground border-primary" },
    custom: { label: customValue || "Custom", icon: <Pencil className="size-3" />, activeClass: "bg-orange-600 text-white border-orange-600" },
  };

  const config = configs[focus];

  if (focus === "custom") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "px-2 py-1 text-xs rounded-md border font-medium transition-colors flex items-center gap-1",
              isSelected ? config.activeClass : "bg-card hover:bg-muted/50 border-border"
            )}
          >
            {config.icon}
            {config.label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-3" align="start">
          <div className="space-y-2">
            <Label className="text-xs">Custom Impact</Label>
            <input
              type="text"
              value={customValue || ""}
              onChange={(e) => {
                onCustomChange?.(e.target.value);
                onClick("custom");
              }}
              placeholder="e.g., Mission Readiness"
              className="w-full px-2 py-1.5 text-sm border rounded-md"
            />
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
        "px-2 py-1 text-xs rounded-md border font-medium transition-colors flex items-center gap-1",
        isSelected ? config.activeClass : "bg-card hover:bg-muted/50 border-border"
      )}
    >
      {config.icon}
      {config.label}
    </button>
  );
}

// Statement input component
function StatementInputCard({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: StatementInput;
  onChange: (value: StatementInput) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2 p-3 rounded-lg border bg-card/50">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="text-xs text-muted-foreground">{value.context.length} chars</span>
      </div>
      <Textarea
        value={value.context}
        onChange={(e) => onChange({ ...value, context: e.target.value })}
        placeholder={placeholder}
        rows={3}
        className="resize-none text-sm"
      />
      <div className="flex flex-wrap gap-1">
        {(["none", "time", "cost", "resources", "custom"] as ImpactFocus[]).map((focus) => (
          <ImpactButton
            key={focus}
            focus={focus}
            currentFocus={value.impactFocus}
            customValue={value.customImpact}
            onClick={(f) => onChange({ ...value, impactFocus: f })}
            onCustomChange={(v) => onChange({ ...value, customImpact: v })}
          />
        ))}
      </div>
    </div>
  );
}

// Statement editor with tools
function StatementEditor({
  value,
  onChange,
  label,
  maxChars,
  otherLength = 0,
  isRevising,
  onRevise,
  onSynonymLookup,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  maxChars: number;
  otherLength?: number;
  isRevising: boolean;
  onRevise: (newImpact?: ImpactFocus, customImpact?: string, additionalContext?: string) => void;
  onSynonymLookup: (word: string, fullStatement: string) => Promise<string[]>;
}) {
  const [selectedText, setSelectedText] = useState("");
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [isLoadingSynonyms, setIsLoadingSynonyms] = useState(false);
  const [showRevise, setShowRevise] = useState(false);
  const [reviseImpact, setReviseImpact] = useState<ImpactFocus>("none");
  const [reviseCustomImpact, setReviseCustomImpact] = useState("");
  const [reviseContext, setReviseContext] = useState("");

  const available = maxChars - otherLength - (otherLength > 0 ? 2 : 0); // -2 for ". " separator
  const isOver = value.length > available;

  const handleSelect = useCallback(async () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 0 && sel.split(" ").length <= 3) {
      setSelectedText(sel);
      setIsLoadingSynonyms(true);
      try {
        const results = await onSynonymLookup(sel, value);
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
  }, [onSynonymLookup, value]);

  const replaceSynonym = (syn: string) => {
    onChange(value.replace(new RegExp(`\\b${selectedText}\\b`, "i"), syn));
    setSelectedText("");
    setSynonyms([]);
    toast.success(`Replaced with "${syn}"`);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("text-xs tabular-nums", isOver ? "text-destructive" : "text-muted-foreground")}>
          {value.length}
        </span>
      </div>

      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onMouseUp={handleSelect}
          rows={3}
          className={cn("resize-none text-sm", isOver && "border-destructive")}
        />

        {/* Synonym popup */}
        {selectedText && (
          <div className="absolute top-full left-0 mt-1 z-10 bg-popover border rounded-lg shadow-lg p-2 max-w-xs">
            <p className="text-xs text-muted-foreground mb-1">Synonyms for &quot;{selectedText}&quot;:</p>
            {isLoadingSynonyms ? (
              <Loader2 className="size-3 animate-spin" />
            ) : synonyms.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {synonyms.slice(0, 6).map((s) => (
                  <button key={s} onClick={() => replaceSynonym(s)} className="px-2 py-0.5 text-xs bg-primary/10 hover:bg-primary/20 rounded">
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No synonyms found</p>
            )}
            <button onClick={() => setSelectedText("")} className="text-xs text-muted-foreground mt-1 hover:underline">Dismiss</button>
          </div>
        )}
      </div>

      <Progress value={Math.min((value.length / available) * 100, 100)} className={cn("h-1", isOver && "[&>*]:bg-destructive")} />

      {/* Revise tools */}
      {!showRevise ? (
        <Button variant="ghost" size="sm" onClick={() => setShowRevise(true)} disabled={isRevising} className="h-7 text-xs">
          {isRevising ? <Loader2 className="size-3 animate-spin mr-1" /> : <Wand2 className="size-3 mr-1" />}
          Revise with AI
        </Button>
      ) : (
        <div className="space-y-2 p-2 rounded border bg-muted/30">
          <Label className="text-xs">New impact focus:</Label>
          <div className="flex flex-wrap gap-1">
            {(["none", "time", "cost", "resources", "custom"] as ImpactFocus[]).map((f) => (
              <ImpactButton
                key={f}
                focus={f}
                currentFocus={reviseImpact}
                customValue={reviseCustomImpact}
                onClick={setReviseImpact}
                onCustomChange={setReviseCustomImpact}
              />
            ))}
          </div>
          <input
            type="text"
            value={reviseContext}
            onChange={(e) => setReviseContext(e.target.value)}
            placeholder="Additional context (optional)..."
            className="w-full px-2 py-1 text-xs border rounded"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onRevise(reviseImpact, reviseImpact === "custom" ? reviseCustomImpact : undefined, reviseContext || undefined);
                setShowRevise(false);
                setReviseContext("");
              }}
              disabled={isRevising}
              className="h-7 text-xs"
            >
              {isRevising ? <Loader2 className="size-3 animate-spin" /> : "Revise"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowRevise(false)} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// MPA workspace card
function MPAWorkspaceCard({
  mpaKey,
  mpaLabel,
  data,
  maxChars,
  isGenerating,
  onDataChange,
  onGenerate,
  onRevise,
  onSave,
  onSynonymLookup,
  onRemove,
  rateeId,
}: {
  mpaKey: string;
  mpaLabel: string;
  data: MPAWorkspaceData;
  maxChars: number;
  isGenerating: boolean;
  onDataChange: (data: MPAWorkspaceData) => void;
  onGenerate: () => void;
  onRevise: (statementNum: 1 | 2, impact: ImpactFocus, customImpact?: string, context?: string) => void;
  onSave: () => void;
  onSynonymLookup: (word: string, fullStatement: string) => Promise<string[]>;
  onRemove: () => void;
  rateeId: string;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revisingStatement, setRevisingStatement] = useState<1 | 2 | null>(null);

  const text1 = data.edited?.text1 ?? data.generated?.text1 ?? "";
  const text2 = data.edited?.text2 ?? data.generated?.text2 ?? "";
  // Combine statements - don't add extra period if text1 already ends with one
  const separator = text1.trim().endsWith(".") ? " " : ". ";
  const combined = data.statementCount === 2 ? `${text1}${separator}${text2}` : text1;
  const totalChars = combined.length;
  const isOver = totalChars > maxChars;

  const hasGenerated = !!data.generated;
  const canGenerate = data.statement1.context.trim().length > 0 && (data.statementCount === 1 || (data.statement2?.context.trim().length ?? 0) > 0);
  
  // Relevancy score color based on value
  const getRelevancyColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    if (score >= 40) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  };

  const copy = async () => {
    await navigator.clipboard.writeText(combined);
    setCopiedId("combined");
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Copied!");
  };

  const handleRevise = async (num: 1 | 2, impact: ImpactFocus, customImpact?: string, context?: string) => {
    setRevisingStatement(num);
    try {
      await onRevise(num, impact, customImpact, context);
    } finally {
      setRevisingStatement(null);
    }
  };

  // Track expansion state - default to expanded unless saved
  const isExpanded = data.isExpanded ?? !data.isSaved;
  
  const toggleExpanded = () => {
    onDataChange({ ...data, isExpanded: !isExpanded });
  };

  const handleSave = () => {
    onSave();
    // After saving, collapse the card
    onDataChange({ ...data, isSaved: true, isExpanded: false });
  };

  return (
    <Card className={cn(
      "transition-all duration-200",
      data.isSaved && !isExpanded && "border-green-500/30 bg-green-50/30 dark:bg-green-950/10"
    )}>
      <CardHeader className={cn("pb-3", !isExpanded && "pb-3")}>
        <div className="flex items-center justify-between gap-3">
          {/* Clickable title area for collapse/expand */}
          <button
            onClick={toggleExpanded}
            className="flex items-center gap-2 text-left flex-1 min-w-0 hover:opacity-70 transition-opacity"
          >
            {data.isSaved ? (
              <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            ) : hasGenerated ? (
              <Pencil className="size-4 text-muted-foreground shrink-0" />
            ) : (
              <Sparkles className="size-4 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm">{mpaLabel}</CardTitle>
              {!isExpanded && hasGenerated && (
                <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-md">
                  {combined.slice(0, 80)}...
                </p>
              )}
            </div>
            {isExpanded ? (
              <ChevronUp className="size-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground shrink-0" />
            )}
          </button>
          
          {/* Action buttons - always visible */}
          <div className="flex items-center gap-1 shrink-0">
            {hasGenerated && (
              <>
                {/* Clarifying questions indicator */}
                <ClarifyingQuestionsIndicator mpaKey={mpaKey} rateeId={rateeId} hasGenerated={hasGenerated} />
                <Button variant="ghost" size="icon" onClick={copy} className="size-7">
                  {copiedId === "combined" ? <Check className="size-3" /> : <Copy className="size-3" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={onGenerate} disabled={isGenerating} className="size-7">
                  <RefreshCw className={cn("size-3", isGenerating && "animate-spin")} />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={onRemove} className="size-7 text-destructive hover:text-destructive">
              <Trash2 className="size-3" />
            </Button>
          </div>
        </div>
        
        {/* Character count and relevancy badges visible when collapsed */}
        {!isExpanded && hasGenerated && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={isOver ? "destructive" : "secondary"} className="text-xs">
              {totalChars}/{maxChars} chars
            </Badge>
            {data.isSaved && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600/30">
                Saved to Library
              </Badge>
            )}
            {/* Relevancy score - subtle indicator */}
            {typeof data.relevancyScore === "number" && (
              <span className={cn("text-[10px] tabular-nums", getRelevancyColor(data.relevancyScore))}>
                {data.relevancyScore}% fit
              </span>
            )}
          </div>
        )}
      </CardHeader>
      
      {/* Collapsible content */}
      {isExpanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Input mode */}
          {!hasGenerated && (
          <>
            {/* Statement count toggle */}
            <div className="flex items-center gap-2">
              <Label className="text-xs">Statements:</Label>
              <div className="flex gap-1">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => onDataChange({ ...data, statementCount: n })}
                    className={cn(
                      "px-2 py-1 text-xs rounded border",
                      data.statementCount === n ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/50"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-auto">
                {data.statementCount === 2 ? `~${Math.floor(maxChars / 2)} each` : `${maxChars} max`}
              </span>
            </div>

            <StatementInputCard
              label={data.statementCount === 2 ? "Statement 1 Input" : "Statement Input"}
              value={data.statement1}
              onChange={(v) => onDataChange({ ...data, statement1: v })}
              placeholder="Paste accomplishment, metrics, impact..."
            />

            {data.statementCount === 2 && (
              <StatementInputCard
                label="Statement 2 Input"
                value={data.statement2 || { context: "", impactFocus: "none" }}
                onChange={(v) => onDataChange({ ...data, statement2: v })}
                placeholder="Second accomplishment..."
              />
            )}

            {/* Show combined input length vs target output */}
            {data.statementCount === 2 && (
              <div className="p-2 rounded border bg-muted/30 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input total:</span>
                  <span>{(data.statement1.context.length + (data.statement2?.context.length || 0))} chars</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target output:</span>
                  <span className="font-medium">{maxChars} chars max</span>
                </div>
                <p className="text-muted-foreground text-[10px] pt-1 border-t">
                  The AI will transform & condense your input to fit the target limit
                </p>
              </div>
            )}

            <Button onClick={onGenerate} disabled={isGenerating || !canGenerate} size="sm" className="w-full">
              {isGenerating ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
              Generate
            </Button>
          </>
        )}

        {/* Edit mode */}
        {hasGenerated && (
          <>
            {/* Subtle relevancy indicator in corner */}
            {typeof data.relevancyScore === "number" && (
              <div className="flex justify-end">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={cn(
                      "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border hover:bg-muted/50 transition-colors",
                      getRelevancyColor(data.relevancyScore)
                    )}>
                      <div className={cn(
                        "size-2 rounded-full",
                        data.relevancyScore >= 80 ? "bg-green-500" :
                        data.relevancyScore >= 60 ? "bg-yellow-500" :
                        data.relevancyScore >= 40 ? "bg-orange-500" : "bg-red-500"
                      )} />
                      {data.relevancyScore}%
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="left" className="w-52 p-2 text-xs">
                    <p className="font-medium mb-1">MPA Relevancy Score</p>
                    <p className="text-muted-foreground">
                      {data.relevancyScore >= 80 
                        ? "Excellent fit for this MPA!" 
                        : data.relevancyScore >= 60 
                          ? "Good fit - consider emphasizing MPA-specific outcomes."
                          : data.relevancyScore >= 40
                            ? "Moderate fit - this accomplishment may fit better in another MPA."
                            : "Low fit - consider using a different MPA for this accomplishment."}
                    </p>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <StatementEditor
              value={text1}
              onChange={(v) => onDataChange({ ...data, edited: { ...data.edited, text1: v, text2: data.edited?.text2 ?? text2 } })}
              label={data.statementCount === 2 ? "Statement 1" : "Statement"}
              maxChars={maxChars}
              otherLength={data.statementCount === 2 ? text2.length : 0}
              isRevising={revisingStatement === 1}
              onRevise={(impact, custom, ctx) => handleRevise(1, impact || "none", custom, ctx)}
              onSynonymLookup={onSynonymLookup}
            />

            {data.statementCount === 2 && (
              <StatementEditor
                value={text2}
                onChange={(v) => onDataChange({ ...data, edited: { ...data.edited, text1: data.edited?.text1 ?? text1, text2: v } })}
                label="Statement 2"
                maxChars={maxChars}
                otherLength={text1.length}
                isRevising={revisingStatement === 2}
                onRevise={(impact, custom, ctx) => handleRevise(2, impact || "none", custom, ctx)}
                onSynonymLookup={onSynonymLookup}
              />
            )}

            {/* Combined preview */}
            <div className="p-3 rounded-lg bg-muted/30 border">
              <Label className="text-xs text-muted-foreground mb-2 block">Preview:</Label>
              <p className="text-sm leading-relaxed">{combined}</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-2 border-t">
              {/* Save button - prominent when not saved */}
              <Button
                onClick={handleSave}
                disabled={isOver}
                size="sm"
                className={cn(
                  "flex-1",
                  data.isSaved ? "bg-green-600 hover:bg-green-700" : ""
                )}
              >
                {data.isSaved ? (
                  <>
                    <CheckCircle2 className="size-4 mr-2" />
                    Saved - Click to Update
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="size-4 mr-2" />
                    Save to Library
                  </>
                )}
              </Button>

              {/* Reset button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDataChange({ ...data, generated: undefined, edited: undefined, isSaved: false })}
                className="h-9"
              >
                <RotateCcw className="size-4 mr-1" />
                Start Over
              </Button>
            </div>
          </>
        )}
        </CardContent>
      )}
    </Card>
  );
}

// Main workspace component
export function CustomContextWorkspace({
  rateeId,
  rateeRank,
  rateeAfsc,
  maxChars,
  model,
  cycleYear,
  selectedMPAs, // MPAs selected from parent
  onSaveStatement,
  onStartWorking,
}: CustomContextWorkspaceProps) {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [generatingMPA, setGeneratingMPA] = useState<string | null>(null);
  const [isRegeneratingWithContext, setIsRegeneratingWithContext] = useState(false);

  // Load session from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as WorkspaceSession;
        if (parsed.rateeId === rateeId && Date.now() - parsed.lastUpdated < 24 * 60 * 60 * 1000) {
          setSession(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoaded(true);
  }, [rateeId]);

  // Save session
  const saveSession = useCallback((data: WorkspaceSession) => {
    const toStore = { ...data, lastUpdated: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    setSession(toStore);
  }, []);

  // Update MPA data
  const updateMPAData = (mpaKey: string, data: MPAWorkspaceData) => {
    saveSession({
      rateeId,
      selectedMPAs,
      mpaData: { ...(session?.mpaData || {}), [mpaKey]: data },
      usedVerbs: session?.usedVerbs || [],
      lastUpdated: Date.now(),
    });
  };

  // Get MPA data with defaults
  const getMPAData = (mpaKey: string): MPAWorkspaceData => {
    return session?.mpaData?.[mpaKey] || {
      statementCount: 1,
      statement1: { context: "", impactFocus: "none" },
    };
  };

  // Clear entire session from localStorage
  const clearEntireSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  // Generate for MPA
  const generateForMPA = async (mpaKey: string) => {
    const data = getMPAData(mpaKey);
    setGeneratingMPA(mpaKey);
    
    // Clear any previously generated content for this MPA before regenerating
    updateMPAData(mpaKey, {
      ...data,
      generated: undefined,
      edited: undefined,
      relevancyScore: undefined,
      isSaved: false,
      isExpanded: true,
    });
    
    // Notify parent to collapse config section for focused editing
    onStartWorking?.();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateeId,
          rateeRank,
          rateeAfsc,
          cycleYear,
          model,
          writingStyle: "personal",
          selectedMPAs: [mpaKey],
          customContext: data.statement1.context,
          customContextOptions: {
            statementCount: data.statementCount,
            impactFocus: data.statement1.impactFocus !== "none" ? data.statement1.impactFocus : undefined,
            customDirection: data.statement1.customImpact,
            ...(data.statementCount === 2 && data.statement2 && {
              customContext2: data.statement2.context,
              impactFocus2: data.statement2.impactFocus !== "none" ? data.statement2.impactFocus : undefined,
            }),
          },
          accomplishments: [],
          usedVerbs: session?.usedVerbs || [], // Pass already-used verbs for variety
        }),
      });

      if (!response.ok) throw new Error("Generation failed");

      const result = await response.json();
      const mpaResult = result.statements?.[0];
      const statements = mpaResult?.statements || [];
      const relevancyScore = mpaResult?.relevancyScore;
      const clarifyingQuestions = mpaResult?.clarifyingQuestions || [];

      // Store clarifying questions if any were returned
      if (clarifyingQuestions.length > 0) {
        const { addQuestionSet } = useClarifyingQuestionsStore.getState();
        const mpaLabel = ENTRY_MGAS.find(m => m.key === mpaKey)?.label || mpaKey;
        addQuestionSet({
          mpaKey,
          rateeId,
          originalContext: data.statement1.context,
          sourceContext: {
            statement1Input: data.statement1.context,
            statement2Input: data.statementCount === 2 ? data.statement2?.context : undefined,
            statement1Generated: statements[0],
            statement2Generated: data.statementCount === 2 ? statements[1] : undefined,
            mpaLabel,
          },
          questions: clarifyingQuestions.map((q: { question: string; category?: string; hint?: string; sentenceNumber?: 1 | 2 }) => ({
            id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            question: q.question,
            category: q.category || "general",
            hint: q.hint,
            sentenceNumber: q.sentenceNumber,
            answer: "",
          })),
        });
      }

      // Extract and track verbs used in generated statements
      const newVerbs: string[] = [];
      statements.forEach((stmt: string) => {
        const verb = extractOpeningVerb(stmt);
        if (verb) newVerbs.push(verb);
      });

      // Update session with new verbs
      if (session && newVerbs.length > 0) {
        setSession({
          ...session,
          usedVerbs: [...new Set([...(session.usedVerbs || []), ...newVerbs])],
        });
      }

      updateMPAData(mpaKey, {
        ...data,
        generated: {
          text1: statements[0] || "",
          text2: data.statementCount === 2 ? statements[1] : undefined,
        },
        relevancyScore,
        isExpanded: true, // Keep expanded after generation to show results
      });

      const hasQuestions = clarifyingQuestions.length > 0;
      toast.success(
        `Generated statement for ${ENTRY_MGAS.find((m) => m.key === mpaKey)?.label}` +
        (hasQuestions ? " — clarifying questions available" : "")
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate statement");
    } finally {
      setGeneratingMPA(null);
    }
  };

  // Regenerate statement with clarifying context from user answers
  const regenerateWithClarifyingContext = async (clarifyingContext: string, mpaKey: string) => {
    const data = getMPAData(mpaKey);
    
    setIsRegeneratingWithContext(true);
    setGeneratingMPA(mpaKey);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateeId,
          rateeRank,
          rateeAfsc,
          cycleYear,
          model,
          writingStyle: "personal",
          selectedMPAs: [mpaKey],
          customContext: data.statement1.context,
          customContextOptions: {
            statementCount: data.statementCount,
            impactFocus: data.statement1.impactFocus !== "none" ? data.statement1.impactFocus : undefined,
            customDirection: data.statement1.customImpact,
            ...(data.statementCount === 2 && data.statement2 && {
              customContext2: data.statement2.context,
              impactFocus2: data.statement2.impactFocus !== "none" ? data.statement2.impactFocus : undefined,
            }),
          },
          accomplishments: [],
          usedVerbs: session?.usedVerbs || [],
          clarifyingContext, // Include the clarifying answers
          requestClarifyingQuestions: false, // Don't request more questions on regeneration
        }),
      });

      if (!response.ok) throw new Error("Regeneration failed");

      const result = await response.json();
      const mpaResult = result.statements?.[0];
      const statements = mpaResult?.statements || [];
      const relevancyScore = mpaResult?.relevancyScore;

      // Extract and track verbs
      const newVerbs: string[] = [];
      statements.forEach((stmt: string) => {
        const verb = extractOpeningVerb(stmt);
        if (verb) newVerbs.push(verb);
      });

      if (session && newVerbs.length > 0) {
        setSession({
          ...session,
          usedVerbs: [...new Set([...(session.usedVerbs || []), ...newVerbs])],
        });
      }

      updateMPAData(mpaKey, {
        ...data,
        generated: {
          text1: statements[0] || "",
          text2: data.statementCount === 2 ? statements[1] : undefined,
        },
        relevancyScore,
        isExpanded: true,
      });

      toast.success(`Enhanced statement with your clarifying details`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to regenerate statement");
    } finally {
      setIsRegeneratingWithContext(false);
      setGeneratingMPA(null);
    }
  };

  // Revise statement - regenerate with new impact focus
  const reviseStatement = async (mpaKey: string, statementNum: 1 | 2, impact: ImpactFocus, customImpact?: string, context?: string) => {
    const data = getMPAData(mpaKey);
    const currentText = statementNum === 1 ? (data.edited?.text1 ?? data.generated?.text1 ?? "") : (data.edited?.text2 ?? data.generated?.text2 ?? "");
    const originalContext = statementNum === 1 ? data.statement1.context : (data.statement2?.context || "");

    try {
      // Use revise-selection API with proper format
      const response = await fetch("/api/revise-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullStatement: currentText,
          selectedText: currentText,
          selectionStart: 0,
          selectionEnd: currentText.length,
          model,
          mode: "general",
          context: `Revise with focus on ${impact === "custom" ? customImpact : impact} impact. Original source: ${originalContext}. ${context || ""}`,
          usedVerbs: session?.usedVerbs || [], // Pass already-used verbs for variety
        }),
      });

      if (!response.ok) throw new Error("Revision failed");

      const result = await response.json();
      const revisedText = result.revisions?.[0] || currentText;

      // Extract and track verb used in revision
      const newVerb = extractOpeningVerb(revisedText);
      if (session && newVerb) {
        setSession({
          ...session,
          usedVerbs: [...new Set([...(session.usedVerbs || []), newVerb])],
        });
      }

      if (statementNum === 1) {
        updateMPAData(mpaKey, {
          ...data,
          edited: { text1: revisedText, text2: data.edited?.text2 ?? data.generated?.text2 },
        });
      } else {
        updateMPAData(mpaKey, {
          ...data,
          edited: { text1: data.edited?.text1 ?? data.generated?.text1 ?? "", text2: revisedText },
        });
      }

      toast.success("Statement revised!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to revise statement");
    }
  };

  // Synonym lookup - needs word, full statement context, and model
  const synonymLookup = async (word: string, fullStatement: string): Promise<string[]> => {
    try {
      const response = await fetch("/api/synonyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, fullStatement, model }),
      });
      if (!response.ok) return [];
      const result = await response.json();
      return result.synonyms || [];
    } catch {
      return [];
    }
  };

  // Save statement
  const saveStatement = async (mpaKey: string) => {
    const data = getMPAData(mpaKey);
    const text1 = data.edited?.text1 ?? data.generated?.text1 ?? "";
    const text2 = data.edited?.text2 ?? data.generated?.text2 ?? "";
    // Combine statements - don't add extra period if text1 already ends with one
    const separator = text1.trim().endsWith(".") ? " " : ". ";
    const combined = data.statementCount === 2 ? `${text1}${separator}${text2}` : text1;
    await onSaveStatement(mpaKey, combined);
  };

  // Clear session data for a specific MPA
  const clearMPAData = (mpaKey: string) => {
    const newMpaData = { ...(session?.mpaData || {}) };
    delete newMpaData[mpaKey];
    saveSession({
      rateeId,
      selectedMPAs,
      mpaData: newMpaData,
      usedVerbs: session?.usedVerbs || [],
      lastUpdated: Date.now(),
    });
  };

  if (!isLoaded) return null;

  // Filter to only show selected MPAs that are not HLR (HLR handled separately)
  const mpasToShow = selectedMPAs.filter(m => m !== "hlr_assessment");

  if (mpasToShow.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
        <p className="text-sm">Select at least one MPA above to start writing statements</p>
      </div>
    );
  }

  // Check if there's any generated content in the session
  const hasAnyGeneratedContent = mpasToShow.some(mpaKey => {
    const data = getMPAData(mpaKey);
    return data.generated?.text1;
  });

  return (
    <div className="space-y-4">
      {/* Clarifying Questions Modal */}
      <ClarifyingQuestionsModal
        onRegenerate={regenerateWithClarifyingContext}
        isRegenerating={isRegeneratingWithContext}
      />
      
      {/* Clear session button when there's generated content */}
      {hasAnyGeneratedContent && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearEntireSession}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            <RotateCcw className="size-3 mr-1.5" />
            Start Fresh
          </Button>
        </div>
      )}
      
      {mpasToShow.map((mpaKey) => {
        const mpa = ENTRY_MGAS.find((m) => m.key === mpaKey);
        if (!mpa) return null;

        return (
          <MPAWorkspaceCard
            key={mpaKey}
            mpaKey={mpaKey}
            mpaLabel={mpa.label}
            data={getMPAData(mpaKey)}
            maxChars={maxChars}
            isGenerating={generatingMPA === mpaKey}
            onDataChange={(data) => updateMPAData(mpaKey, data)}
            onGenerate={() => generateForMPA(mpaKey)}
            onRevise={(num, impact, custom, ctx) => reviseStatement(mpaKey, num, impact, custom, ctx)}
            onSave={() => saveStatement(mpaKey)}
            onSynonymLookup={(word, fullStatement) => synonymLookup(word, fullStatement)}
            onRemove={() => clearMPAData(mpaKey)}
            rateeId={rateeId}
          />
        );
      })}
    </div>
  );
}


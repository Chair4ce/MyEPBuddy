"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Crown, 
  Check, 
  Copy, 
  Wand2, 
  Save, 
  RotateCcw,
  Loader2,
  Sparkles,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { STANDARD_MGAS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

interface Accomplishment {
  id: string;
  mpa: string;
  action_verb: string;
  details: string;
  impact: string;
  metrics?: string | null;
}

interface StatementSelectionWorkspaceProps {
  accomplishments: Accomplishment[];
  maxChars: number;
  maxHlrChars: number;
  rateeInfo: { id: string; rank: string | null; full_name: string | null; afsc?: string | null; isManagedMember?: boolean } | null;
  cycleYear: number;
  model: string;
  currentUserId: string; // The logged-in user (supervisor or self)
  onSaveStatement: (mpa: string, statement: string) => Promise<void>;
}

// Get abbreviated MPA name for compact display
function getMpaShortName(key: string): string {
  const labels: Record<string, string> = {
    executing_mission: "Mission",
    leading_people: "Leading",
    managing_resources: "Resources",
    improving_unit: "Improving",
    hlr_assessment: "HLR",
  };
  return labels[key] || key;
}

type SelectionMode = "stmt1" | "stmt2" | null;
type WorkspaceStage = "select" | "generating" | "finalize";

interface WorkspaceState {
  stage: WorkspaceStage;
  slot1Ids: string[];
  slot2Ids: string[];
  generatedStatement1: string;
  generatedStatement2: string;
  selectedMPA: string; // MPA to assign at save time
}

export function StatementSelectionWorkspace({
  accomplishments,
  maxChars,
  maxHlrChars,
  rateeInfo,
  cycleYear,
  model,
  currentUserId,
  onSaveStatement,
}: StatementSelectionWorkspaceProps) {
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [saving, setSaving] = useState(false);
  const [revisingKey, setRevisingKey] = useState<string | null>(null);
  const [mpaProgress, setMpaProgress] = useState<Record<string, number>>({});
  const [existingStatements, setExistingStatements] = useState<{mpa: string; statement: string; created_by: string | null}[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(true);
  
  const supabase = createClient();
  
  // Get the ratee's user_id - for managed members use team_member_id query, for real users use their id
  const rateeUserId = rateeInfo?.isManagedMember ? null : rateeInfo?.id;
  const rateeTeamMemberId = rateeInfo?.isManagedMember ? rateeInfo?.id : null;
  const isSupervisorView = rateeInfo && !rateeInfo.isManagedMember && rateeInfo.id !== currentUserId;

  // Load MPA progress (how many statements exist for each MPA this cycle for the RATEE)
  const loadMpaProgress = useCallback(async () => {
    if (!rateeInfo) return;
    
    setLoadingProgress(true);
    try {
      let query = supabase
        .from("refined_statements")
        .select("mpa, statement, created_by")
        .eq("cycle_year", cycleYear)
        .eq("statement_type", "epb");
      
      // Query based on ratee type
      if (rateeTeamMemberId) {
        // Managed member - query by team_member_id
        query = query.eq("team_member_id", rateeTeamMemberId);
      } else if (rateeUserId) {
        // Real user - query by user_id
        query = query.eq("user_id", rateeUserId);
      } else {
        setLoadingProgress(false);
        return;
      }
      
      const { data } = await query as { data: { mpa: string; statement: string; created_by: string | null }[] | null };
      
      const progress: Record<string, number> = {};
      STANDARD_MGAS.forEach(m => { progress[m.key] = 0; });
      
      const statements: {mpa: string; statement: string; created_by: string | null}[] = [];
      
      if (data) {
        data.forEach(row => {
          if (progress[row.mpa] !== undefined) {
            progress[row.mpa]++;
          }
          statements.push({ mpa: row.mpa, statement: row.statement, created_by: row.created_by });
        });
      }
      
      setMpaProgress(progress);
      setExistingStatements(statements);
    } catch (error) {
      console.error("Failed to load MPA progress:", error);
    } finally {
      setLoadingProgress(false);
    }
  }, [rateeInfo, rateeUserId, rateeTeamMemberId, cycleYear, supabase]);

  useEffect(() => {
    loadMpaProgress();
  }, [loadMpaProgress]);

  const getMaxChars = (mpaKey: string) => mpaKey === "hlr_assessment" ? maxHlrChars : maxChars;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(key);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Start building a new statement
  const startBuilding = () => {
    setWorkspaceState({
      stage: "select",
      slot1Ids: [],
      slot2Ids: [],
      generatedStatement1: "",
      generatedStatement2: "",
      selectedMPA: "",
    });
    setSelectionMode("stmt1");
  };

  // Cancel and reset
  const cancelBuilding = () => {
    setWorkspaceState(null);
    setSelectionMode(null);
  };

  // Toggle selection mode
  const toggleMode = (mode: SelectionMode) => {
    setSelectionMode(prev => prev === mode ? null : mode);
  };

  // Handle clicking an accomplishment
  const handleAccomplishmentClick = (accId: string) => {
    if (!selectionMode || !workspaceState) return;
    
    setWorkspaceState(prev => {
      if (!prev) return prev;
      
      const slotKey = selectionMode === "stmt1" ? "slot1Ids" : "slot2Ids";
      const otherSlotKey = selectionMode === "stmt1" ? "slot2Ids" : "slot1Ids";
      
      const isInCurrentSlot = prev[slotKey].includes(accId);
      const isInOtherSlot = prev[otherSlotKey].includes(accId);
      
      if (isInCurrentSlot) {
        return { ...prev, [slotKey]: prev[slotKey].filter(id => id !== accId) };
      } else {
        return {
          ...prev,
          [slotKey]: [...prev[slotKey], accId],
          [otherSlotKey]: isInOtherSlot ? prev[otherSlotKey].filter(id => id !== accId) : prev[otherSlotKey],
        };
      }
    });
  };

  // Generate statements
  const generateStatements = async () => {
    if (!workspaceState) return;
    
    const hasSlot1 = workspaceState.slot1Ids.length > 0;
    const hasSlot2 = workspaceState.slot2Ids.length > 0;
    
    if (!hasSlot1 && !hasSlot2) {
      toast.error("Please select at least one entry for a statement");
      return;
    }
    
    setWorkspaceState(prev => prev ? { ...prev, stage: "generating" } : prev);
    
    try {
      const slot1Accs = accomplishments.filter(a => workspaceState.slot1Ids.includes(a.id));
      const slot2Accs = accomplishments.filter(a => workspaceState.slot2Ids.includes(a.id));
      
      const bothSlots = hasSlot1 && hasSlot2;
      const charPerSlot = bothSlots ? Math.floor((maxChars - 2) / 2) : maxChars;
      
      let generated1 = "";
      let generated2 = "";
      
      if (hasSlot1) {
        const response = await fetch("/api/generate-slot-statement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accomplishments: slot1Accs.map(a => ({
              action_verb: a.action_verb,
              details: a.details,
              impact: a.impact,
              metrics: a.metrics,
            })),
            targetChars: charPerSlot,
            model,
            mpa: "executing_mission", // Generic MPA for prompt
            rateeRank: rateeInfo?.rank || "SSgt",
            rateeAfsc: rateeInfo?.afsc || "UNKNOWN",
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          generated1 = data.statement || "";
        }
      }
      
      if (hasSlot2) {
        const response = await fetch("/api/generate-slot-statement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accomplishments: slot2Accs.map(a => ({
              action_verb: a.action_verb,
              details: a.details,
              impact: a.impact,
              metrics: a.metrics,
            })),
            targetChars: charPerSlot,
            model,
            mpa: "executing_mission",
            rateeRank: rateeInfo?.rank || "SSgt",
            rateeAfsc: rateeInfo?.afsc || "UNKNOWN",
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          generated2 = data.statement || "";
        }
      }
      
      setWorkspaceState(prev => prev ? {
        ...prev,
        stage: "finalize",
        generatedStatement1: generated1,
        generatedStatement2: generated2,
      } : prev);
      
    } catch (error) {
      console.error("Generate error:", error);
      toast.error("Failed to generate statements");
      setWorkspaceState(prev => prev ? { ...prev, stage: "select" } : prev);
    }
  };

  // Update statement
  const updateStatement = (which: 1 | 2, value: string) => {
    setWorkspaceState(prev => prev ? {
      ...prev,
      [which === 1 ? "generatedStatement1" : "generatedStatement2"]: value,
    } : prev);
  };

  // Revise with AI
  const reviseWithAI = async (which: 1 | 2) => {
    if (!workspaceState) return;
    
    const statement = which === 1 ? workspaceState.generatedStatement1 : workspaceState.generatedStatement2;
    if (!statement.trim()) return;
    
    setRevisingKey(`stmt-${which}`);
    
    try {
      const response = await fetch("/api/revise-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullStatement: statement,
          selectedText: statement,
          selectionStart: 0,
          selectionEnd: statement.length,
          model,
          mode: "general",
          context: "Rewrite this EPB statement with fresh verbs and improved flow.",
        }),
      });
      
      if (!response.ok) throw new Error("Revision failed");
      
      const data = await response.json();
      if (data.revisions?.[0]) {
        updateStatement(which, data.revisions[0]);
        toast.success("Statement revised");
      }
    } catch (error) {
      console.error("Revision error:", error);
      toast.error("Failed to revise statement");
    } finally {
      setRevisingKey(null);
    }
  };

  // Back to selection
  const backToSelect = () => {
    setWorkspaceState(prev => prev ? {
      ...prev,
      stage: "select",
      generatedStatement1: "",
      generatedStatement2: "",
    } : prev);
    setSelectionMode("stmt1");
  };

  // Save to library
  const saveToLibrary = async () => {
    if (!workspaceState) return;
    
    const combined = workspaceState.generatedStatement2 
      ? `${workspaceState.generatedStatement1}. ${workspaceState.generatedStatement2}`
      : workspaceState.generatedStatement1;
    
    if (!workspaceState.selectedMPA) {
      toast.error("Please select an MPA to assign this statement to");
      return;
    }
    
    const mpaMaxChars = getMaxChars(workspaceState.selectedMPA);
    if (combined.length > mpaMaxChars) {
      toast.error(`Statement exceeds ${mpaMaxChars} character limit for this MPA`);
      return;
    }
    
    setSaving(true);
    try {
      await onSaveStatement(workspaceState.selectedMPA, combined);
      toast.success("Saved to library");
      setWorkspaceState(null);
      setSelectionMode(null);
      // Reload progress
      loadMpaProgress();
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Calculate totals
  const totalMPAs = STANDARD_MGAS.length;
  const completedMPAs = Object.values(mpaProgress).filter(count => count >= 1).length;

  if (accomplishments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No performance entries found for this cycle. Add entries first.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div className="min-w-0">
            <CardTitle>Statement Workspace</CardTitle>
            <CardDescription>
              Build EPB statements from your performance entries
            </CardDescription>
          </div>
          {!workspaceState && (
            <Button onClick={startBuilding}>
              <Sparkles className="size-4 mr-2" />
              Build New Statement
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* MPA Progress */}
        {!workspaceState && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Statement Progress</h3>
              <span className="text-xs text-muted-foreground">
                {loadingProgress ? "Loading..." : `${completedMPAs}/${totalMPAs} MPAs complete`}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {STANDARD_MGAS.map((mpa) => {
                const count = mpaProgress[mpa.key] || 0;
                const isComplete = count >= 1;
                const isHLR = mpa.key === "hlr_assessment";
                
                return (
                  <div
                    key={mpa.key}
                    className={cn(
                      "p-2 rounded-lg border text-center transition-colors",
                      isComplete ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700" : "bg-muted/30",
                      isHLR && "border-amber-300/50"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {isComplete ? (
                        <CheckCircle2 className="size-3 text-green-600" />
                      ) : (
                        <Circle className="size-3 text-muted-foreground" />
                      )}
                      {isHLR && <Crown className="size-3 text-amber-600" />}
                      <span className="text-xs font-medium">{getMpaShortName(mpa.key)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <p className="text-sm text-muted-foreground">
              You have <strong>{accomplishments.length}</strong> performance entries this cycle. 
              Click &quot;Build New Statement&quot; to create an EPB statement.
            </p>
          </div>
        )}

        {/* Workspace Active */}
        {workspaceState && (
          <>
            {workspaceState.stage === "select" ? (
              // SELECTION STAGE
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-medium">Select Entries</h3>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={cancelBuilding}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={generateStatements}
                      disabled={workspaceState.slot1Ids.length === 0 && workspaceState.slot2Ids.length === 0}
                    >
                      <Sparkles className="size-4 mr-2" />
                      Generate
                    </Button>
                  </div>
                </div>
                
                {/* Mode Toggle */}
                <div className="flex items-center justify-center flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border">
                  <span className="text-sm text-muted-foreground mr-2 w-full sm:w-auto">Select for:</span>
                  <Button
                    variant={selectionMode === "stmt1" ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleMode("stmt1")}
                  >
                    Statement 1
                    {workspaceState.slot1Ids.length > 0 && (
                      <Badge className="ml-2 bg-primary/80">{workspaceState.slot1Ids.length}</Badge>
                    )}
                  </Button>
                  <Button
                    variant={selectionMode === "stmt2" ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleMode("stmt2")}
                  >
                    Statement 2
                    {workspaceState.slot2Ids.length > 0 && (
                      <Badge className="ml-2 bg-primary/80">{workspaceState.slot2Ids.length}</Badge>
                    )}
                  </Button>
                  {selectionMode && (
                    <span className="text-xs text-muted-foreground ml-2">
                      Click entries to add
                    </span>
                  )}
                </div>
                
                {/* Entries */}
                <div className="space-y-2 max-h-[400px] overflow-y-auto p-1">
                  {accomplishments.map((acc) => {
                    const inSlot1 = workspaceState.slot1Ids.includes(acc.id);
                    const inSlot2 = workspaceState.slot2Ids.includes(acc.id);
                    const mpaLabel = STANDARD_MGAS.find(m => m.key === acc.mpa)?.label || acc.mpa;
                    
                    return (
                      <div 
                        key={acc.id} 
                        onClick={() => handleAccomplishmentClick(acc.id)}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-all",
                          inSlot1 && "bg-primary/5 dark:bg-primary/10 border-primary/30 ring-2 ring-primary/40",
                          inSlot2 && "bg-primary/5 dark:bg-primary/10 border-primary/30 ring-2 ring-primary/40",
                          !inSlot1 && !inSlot2 && "bg-card hover:bg-muted/50",
                          !selectionMode && "cursor-default opacity-70"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">{acc.action_verb}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{mpaLabel}</Badge>
                              {inSlot1 && <Badge className="bg-primary text-xs">Stmt 1</Badge>}
                              {inSlot2 && <Badge className="bg-primary/80 text-xs">Stmt 2</Badge>}
                            </div>
                            <p className="text-sm line-clamp-2">{acc.details}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : workspaceState.stage === "generating" ? (
              // GENERATING
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Generating statements...</p>
              </div>
            ) : (
              // FINALIZE STAGE
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Finalize Statement</h3>
                  <Button variant="ghost" size="sm" onClick={backToSelect}>
                    <RotateCcw className="size-4 mr-2" />
                    Back
                  </Button>
                </div>
                
                {/* Character count */}
                {(() => {
                  const mpaMaxChars = workspaceState.selectedMPA ? getMaxChars(workspaceState.selectedMPA) : maxChars;
                  const total = workspaceState.generatedStatement2
                    ? workspaceState.generatedStatement1.length + 2 + workspaceState.generatedStatement2.length
                    : workspaceState.generatedStatement1.length;
                  const isOver = total > mpaMaxChars;
                  return (
                    <div className={cn(
                      "p-3 rounded-lg border flex items-center justify-between",
                      isOver ? "bg-destructive/10 border-destructive/30" : "bg-muted/50"
                    )}>
                      <span className="text-sm font-medium">Total: {total}/{mpaMaxChars}</span>
                      <Progress
                        value={Math.min((total / mpaMaxChars) * 100, 100)}
                        className={cn("w-32 h-2", isOver && "*:bg-destructive")}
                      />
                    </div>
                  );
                })()}
                
                {/* Statements */}
                <div className="space-y-4">
                  {workspaceState.generatedStatement1 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Badge className="bg-primary">Statement 1</Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            {workspaceState.generatedStatement1.length} chars
                          </span>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reviseWithAI(1)}
                          disabled={revisingKey === "stmt-1"}
                        >
                          {revisingKey === "stmt-1" ? (
                            <Loader2 className="size-4 mr-2 animate-spin" />
                          ) : (
                            <Wand2 className="size-4 mr-2" />
                          )}
                          Revise
                        </Button>
                      </div>
                      <Textarea
                        value={workspaceState.generatedStatement1}
                        onChange={(e) => updateStatement(1, e.target.value)}
                        rows={4}
                        className="text-sm resize-none"
                      />
                    </div>
                  )}
                  
                  {workspaceState.generatedStatement2 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium flex items-center gap-2">
                          <Badge className="bg-primary/80">Statement 2</Badge>
                          <span className="text-xs font-mono text-muted-foreground">
                            {workspaceState.generatedStatement2.length} chars
                          </span>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reviseWithAI(2)}
                          disabled={revisingKey === "stmt-2"}
                        >
                          {revisingKey === "stmt-2" ? (
                            <Loader2 className="size-4 mr-2 animate-spin" />
                          ) : (
                            <Wand2 className="size-4 mr-2" />
                          )}
                          Revise
                        </Button>
                      </div>
                      <Textarea
                        value={workspaceState.generatedStatement2}
                        onChange={(e) => updateStatement(2, e.target.value)}
                        rows={4}
                        className="text-sm resize-none"
                      />
                    </div>
                  )}
                </div>
                
                {/* Preview */}
                <div className="p-4 rounded-lg border bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                  <p className="text-sm leading-relaxed">
                    {workspaceState.generatedStatement2 
                      ? `${workspaceState.generatedStatement1}. ${workspaceState.generatedStatement2}`
                      : workspaceState.generatedStatement1
                    }
                  </p>
                </div>
                
                {/* MPA Assignment & Save */}
                <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Assign to MPA</label>
                    <span className="text-xs text-muted-foreground">Required to save</span>
                  </div>
                  <Select
                    value={workspaceState.selectedMPA}
                    onValueChange={(value) => setWorkspaceState(prev => prev ? { ...prev, selectedMPA: value } : prev)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select MPA..." />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_MGAS.map((mpa) => {
                        const count = mpaProgress[mpa.key] || 0;
                        const isHLR = mpa.key === "hlr_assessment";
                        return (
                          <SelectItem key={mpa.key} value={mpa.key}>
                            <div className="flex items-center gap-2">
                              {isHLR && <Crown className="size-3 text-amber-600" />}
                              <span>{mpa.label}</span>
                              {count > 0 && (
                                <Badge variant="secondary" className="text-[10px]">{count} saved</Badge>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  
                  {/* Warning if statements exist for selected MPA */}
                  {workspaceState.selectedMPA && (mpaProgress[workspaceState.selectedMPA] || 0) > 0 && (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
                      <p className="text-amber-800 dark:text-amber-200">
                        <strong>{mpaProgress[workspaceState.selectedMPA]}</strong> statement(s) already exist for this MPA.
                        {isSupervisorView && " Your subordinate or another supervisor may have created them."}
                      </p>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-amber-600 dark:text-amber-400">
                          View existing statements
                        </summary>
                        <div className="mt-2 space-y-2">
                          {existingStatements
                            .filter(s => s.mpa === workspaceState.selectedMPA)
                            .map((s, i) => (
                              <div key={i} className="p-2 bg-white dark:bg-gray-800 rounded border text-xs">
                                <p className="line-clamp-2">{s.statement}</p>
                                <p className="text-muted-foreground mt-1">
                                  {s.created_by === currentUserId ? "Created by you" : "Created by another user"}
                                </p>
                              </div>
                            ))
                          }
                        </div>
                      </details>
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => copyToClipboard(
                      workspaceState.generatedStatement2 
                        ? `${workspaceState.generatedStatement1}. ${workspaceState.generatedStatement2}`
                        : workspaceState.generatedStatement1,
                      "combined"
                    )}
                  >
                    {copiedIndex === "combined" ? (
                      <Check className="size-4 mr-2" />
                    ) : (
                      <Copy className="size-4 mr-2" />
                    )}
                    Copy
                  </Button>
                  <Button
                    onClick={saveToLibrary}
                    disabled={saving || !workspaceState.selectedMPA}
                  >
                    {saving ? (
                      <Loader2 className="size-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="size-4 mr-2" />
                    )}
                    Save to Library
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

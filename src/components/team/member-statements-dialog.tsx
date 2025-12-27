"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Crown,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Circle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { STANDARD_MGAS } from "@/lib/constants";

interface Statement {
  id: string;
  mpa: string;
  statement: string;
  created_by: string | null;
  created_at: string;
  rank: string | null;
  afsc: string | null;
}

interface MemberStatementsDialogProps {
  memberId: string;
  memberName: string;
  memberRank: string | null;
  isManagedMember: boolean;
  cycleYear: number;
  currentUserId: string;
  trigger?: React.ReactNode;
}

export function MemberStatementsDialog({
  memberId,
  memberName,
  memberRank,
  isManagedMember,
  cycleYear,
  currentUserId,
  trigger,
}: MemberStatementsDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const supabase = createClient();

  const loadStatements = useCallback(async () => {
    if (!memberId) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from("refined_statements")
        .select("id, mpa, statement, created_by, created_at, rank, afsc")
        .eq("cycle_year", cycleYear)
        .eq("statement_type", "epb")
        .order("created_at", { ascending: false });
      
      if (isManagedMember) {
        query = query.eq("team_member_id", memberId);
      } else {
        query = query.eq("user_id", memberId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      setStatements(data || []);
    } catch (error) {
      console.error("Failed to load statements:", error);
      toast.error("Failed to load statements");
    } finally {
      setLoading(false);
    }
  }, [memberId, isManagedMember, cycleYear, supabase]);

  useEffect(() => {
    if (open) {
      loadStatements();
    }
  }, [open, loadStatements]);

  const copyStatement = (statement: string, id: string) => {
    navigator.clipboard.writeText(statement);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group statements by MPA
  const statementsByMpa = STANDARD_MGAS.reduce((acc, mpa) => {
    acc[mpa.key] = statements.filter(s => s.mpa === mpa.key);
    return acc;
  }, {} as Record<string, Statement[]>);

  const completedMpas = STANDARD_MGAS.filter(mpa => statementsByMpa[mpa.key].length > 0).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <FileText className="size-4 mr-2" />
            Statements
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            EPB Statements for {memberRank} {memberName}
          </DialogTitle>
          <DialogDescription>
            Cycle Year {cycleYear} • {completedMpas}/{STANDARD_MGAS.length} MPAs with statements
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : statements.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="size-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No statements found for this cycle.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setOpen(false);
                window.location.href = "/generate";
              }}
            >
              <ExternalLink className="size-4 mr-2" />
              Generate Statements
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex-1">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="all">All Statements ({statements.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {STANDARD_MGAS.map((mpa) => {
                    const mpaStatements = statementsByMpa[mpa.key];
                    const hasStatements = mpaStatements.length > 0;
                    const isHLR = mpa.key === "hlr_assessment";

                    return (
                      <div
                        key={mpa.key}
                        className={cn(
                          "p-4 rounded-lg border",
                          hasStatements ? "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-muted/30"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {hasStatements ? (
                              <CheckCircle2 className="size-4 text-green-600" />
                            ) : (
                              <Circle className="size-4 text-muted-foreground" />
                            )}
                            {isHLR && <Crown className="size-4 text-amber-600" />}
                            <span className="font-medium text-sm">{mpa.label}</span>
                          </div>
                          <Badge variant={hasStatements ? "default" : "secondary"}>
                            {mpaStatements.length} statement{mpaStatements.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        
                        {hasStatements && (
                          <div className="space-y-2 mt-3">
                            {mpaStatements.map((stmt) => (
                              <div
                                key={stmt.id}
                                className="p-3 rounded bg-white dark:bg-gray-900 border text-sm"
                              >
                                <p className="line-clamp-3">{stmt.statement}</p>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t">
                                  <span className="text-xs text-muted-foreground">
                                    {stmt.created_by === currentUserId ? "Created by you" : "Created by member"}
                                    {" • "}
                                    {new Date(stmt.created_at).toLocaleDateString()}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => copyStatement(stmt.statement, stmt.id)}
                                  >
                                    {copiedId === stmt.id ? (
                                      <Check className="size-3" />
                                    ) : (
                                      <Copy className="size-3" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {statements.map((stmt) => {
                    const mpaLabel = STANDARD_MGAS.find(m => m.key === stmt.mpa)?.label || stmt.mpa;
                    const isHLR = stmt.mpa === "hlr_assessment";

                    return (
                      <div
                        key={stmt.id}
                        className="p-4 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          {isHLR && <Crown className="size-4 text-amber-600" />}
                          <Badge variant="outline">{mpaLabel}</Badge>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {stmt.statement.length} chars
                          </span>
                        </div>
                        <p className="text-sm">{stmt.statement}</p>
                        <div className="flex items-center justify-between mt-3 pt-2 border-t">
                          <span className="text-xs text-muted-foreground">
                            {stmt.created_by === currentUserId ? "Created by you" : "Created by member"}
                            {" • "}
                            {new Date(stmt.created_at).toLocaleDateString()}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => copyStatement(stmt.statement, stmt.id)}
                          >
                            {copiedId === stmt.id ? (
                              <Check className="size-3 mr-1" />
                            ) : (
                              <Copy className="size-3 mr-1" />
                            )}
                            Copy
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}




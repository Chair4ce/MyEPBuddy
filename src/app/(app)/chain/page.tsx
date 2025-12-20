"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, User, Users, ChevronDown, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

const RANK_ORDER = ["CMSgt", "SMSgt", "MSgt", "TSgt", "SSgt", "SrA", "A1C", "Amn", "AB"];
const STORAGE_KEY = "chain-rank-colors";

interface TreeNode {
  profile: Profile;
  children: TreeNode[];
  isExpanded: boolean;
}

type RankColors = Record<string, string>;

export default function ChainPage() {
  const { profile } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [teamRelations, setTeamRelations] = useState<{ supervisor_id: string; subordinate_id: string }[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [rankColors, setRankColors] = useState<RankColors>({});

  const supabase = createClient();

  // Load rank colors from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRankColors(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save rank colors to localStorage whenever they change
  const updateRankColor = useCallback((rank: string, color: string | null) => {
    setRankColors((prev) => {
      const next = { ...prev };
      if (color) {
        next[rank] = color;
      } else {
        delete next[rank];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (profile) {
      loadChainData();
    }
  }, [profile]);

  async function loadChainData() {
    if (!profile) return;
    setIsLoading(true);

    try {
      // Get all subordinates in my chain
      const { data: chainData } = await (supabase.rpc as Function)("get_subordinate_chain", {
        supervisor_uuid: profile.id,
      }) as { data: { subordinate_id: string; depth: number }[] | null };

      if (chainData && chainData.length > 0) {
        const subordinateIds = chainData.map((c: { subordinate_id: string }) => c.subordinate_id);
        const allChainIds = [...subordinateIds, profile.id];
        
        // Get all profiles in the chain plus myself
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", allChainIds);

        setAllProfiles((profiles as Profile[]) || [profile]);

        // Get all team relationships where supervisor is in our chain
        // This gives us all the parent-child relationships we need to build the tree
        const { data: teams } = await supabase
          .from("teams")
          .select("supervisor_id, subordinate_id")
          .in("supervisor_id", allChainIds);

        setTeamRelations(teams || []);
      } else {
        setAllProfiles([profile]);
        setTeamRelations([]);
      }

      // Expand the root node by default
      setExpandedNodes(new Set([profile.id]));
    } catch (error) {
      console.error("Error loading chain:", error);
    } finally {
      setIsLoading(false);
    }
  }

  // Build tree structure
  const tree = useMemo(() => {
    if (!profile || allProfiles.length === 0) return null;

    const buildTree = (nodeId: string): TreeNode | null => {
      const nodeProfile = allProfiles.find((p) => p.id === nodeId);
      if (!nodeProfile) return null;

      const childIds = teamRelations
        .filter((r) => r.supervisor_id === nodeId)
        .map((r) => r.subordinate_id);

      const children = childIds
        .map((id) => buildTree(id))
        .filter((n): n is TreeNode => n !== null);

      return {
        profile: nodeProfile,
        children,
        isExpanded: expandedNodes.has(nodeId),
      };
    };

    return buildTree(profile.id);
  }, [profile, allProfiles, teamRelations, expandedNodes]);

  function toggleExpand(nodeId: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  // Returns inline style object for custom colors, or empty for default styling
  function getRankStyle(rank: string | null): React.CSSProperties {
    const color = rankColors[rank || ""];
    if (!color) return {};
    
    // Create a lighter background version of the color
    return {
      backgroundColor: `${color}20`, // 20 = ~12% opacity in hex
      borderColor: color,
    };
  }

  // Check if rank has a custom color
  function hasCustomColor(rank: string | null): boolean {
    return Boolean(rankColors[rank || ""]);
  }

  function renderTreeNode(node: TreeNode, depth: number = 0, isLast: boolean = true) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.profile.id);

    return (
      <div key={node.profile.id} className="relative min-w-0">
        {/* Connector lines - hidden on mobile for cleaner look */}
        {depth > 0 && (
          <>
            {/* Horizontal line to node */}
            <div
              className="absolute border-t-2 border-border hidden sm:block"
              style={{
                left: -16,
                top: 24,
                width: 16,
              }}
            />
            {/* Vertical line from parent */}
            {!isLast && (
              <div
                className="absolute border-l-2 border-border hidden sm:block"
                style={{
                  left: -16,
                  top: 24,
                  height: "calc(100% + 8px)",
                }}
              />
            )}
          </>
        )}

        {/* Node card - responsive padding */}
        <div
          className={cn(
            "relative p-2 sm:p-3 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md bg-card",
            !hasCustomColor(node.profile.rank) && "border-border",
            node.profile.id === profile?.id && "ring-2 ring-primary ring-offset-1 sm:ring-offset-2"
          )}
          style={getRankStyle(node.profile.rank)}
          onClick={() => hasChildren && toggleExpand(node.profile.id)}
        >
          <div className="flex items-center gap-2 sm:gap-3">
            {hasChildren && (
              <div className="shrink-0">
                {isExpanded ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </div>
            )}
            <Avatar className="size-8 sm:size-10 shrink-0">
              <AvatarFallback className="text-xs sm:text-sm font-medium">
                {node.profile.full_name?.split(" ").map((n) => n[0]).join("") || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-xs sm:text-sm truncate">
                {node.profile.rank} {node.profile.full_name}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                {node.profile.afsc} • {node.profile.unit}
              </p>
            </div>
            {hasChildren && (
              <Badge variant="secondary" className="shrink-0 text-[10px] sm:text-xs px-1.5 sm:px-2">
                {node.children.length}
              </Badge>
            )}
          </div>
        </div>

        {/* Children - responsive margin */}
        {hasChildren && isExpanded && (
          <div className="ml-4 sm:ml-6 md:ml-8 mt-2 space-y-2 relative">
            {/* Vertical line connecting children - hidden on mobile */}
            <div
              className="absolute border-l-2 border-border hidden sm:block"
              style={{
                left: -16,
                top: 0,
                height: "calc(100% - 24px)",
              }}
            />
            {node.children.map((child, idx) =>
              renderTreeNode(child, depth + 1, idx === node.children.length - 1)
            )}
          </div>
        )}
      </div>
    );
  }

  // Stats
  const stats = useMemo(() => {
    const rankCounts: Record<string, number> = {};
    allProfiles.forEach((p) => {
      if (p.id !== profile?.id) {
        const rank = p.rank || "Unknown";
        rankCounts[rank] = (rankCounts[rank] || 0) + 1;
      }
    });
    return rankCounts;
  }, [allProfiles, profile]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Chain of Command</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Visualization of your supervision hierarchy
        </p>
      </div>

      {/* Stats - horizontal scroll on mobile */}
      <div className="relative -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-6 md:overflow-visible md:pb-0 snap-x snap-mandatory">
          <Card className="shrink-0 w-[140px] md:w-auto snap-start">
            <CardContent className="pt-3 pb-3 md:pt-4">
              <div className="flex items-center gap-2">
                <Users className="size-4 md:size-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xl md:text-2xl font-bold">{allProfiles.length - 1}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground truncate">Total in Chain</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {Object.entries(stats)
            .sort(([a], [b]) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))
            .slice(0, 5)
            .map(([rank, count]) => (
              <Card key={rank} className="shrink-0 w-[120px] md:w-auto snap-start">
                <CardContent className="pt-3 pb-3 md:pt-4">
                  <div className="flex items-center gap-2">
                    <User className="size-4 md:size-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xl md:text-2xl font-bold">{count}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground truncate">{rank}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      {/* Tree */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 sm:pb-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="size-4 sm:size-5" />
            Supervision Tree
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Click on a node to expand/collapse. Your position is highlighted.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {tree ? (
            <div className="p-2 sm:p-4 overflow-x-auto">
              <div className="min-w-0">{renderTreeNode(tree)}</div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8 text-sm">
              No subordinates in your chain of command.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rank Color Settings */}
      <Card>
        <CardHeader className="pb-2 sm:pb-6">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm">Rank Colors</CardTitle>
              <CardDescription className="text-xs">
                Tap a rank to customize its color
              </CardDescription>
            </div>
            {Object.keys(rankColors).length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRankColors({});
                  localStorage.removeItem(STORAGE_KEY);
                }}
                className="text-xs text-muted-foreground shrink-0"
              >
                Reset
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2 sm:gap-3">
            {RANK_ORDER.map((rank) => {
              const color = rankColors[rank];
              return (
                <Popover key={rank}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "px-2 sm:px-3 py-1.5 rounded border-2 text-[10px] sm:text-xs font-medium transition-all hover:shadow-md cursor-pointer w-full sm:w-auto",
                        !color && "bg-card border-border hover:border-muted-foreground"
                      )}
                      style={color ? { backgroundColor: `${color}20`, borderColor: color } : undefined}
                    >
                      {rank}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-3" align="center" side="top">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-medium">{rank} Color</span>
                        {color && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            onClick={() => updateRankColor(rank, null)}
                          >
                            <X className="size-3" />
                          </Button>
                        )}
                      </div>
                      <input
                        type="color"
                        value={color || "#6b7280"}
                        onChange={(e) => updateRankColor(rank, e.target.value)}
                        className="w-full h-10 rounded cursor-pointer border-0"
                      />
                      <div className="grid grid-cols-4 gap-1.5">
                        {["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"].map((preset) => (
                          <button
                            key={preset}
                            onClick={() => updateRankColor(rank, preset)}
                            className={cn(
                              "size-7 rounded-full border-2 transition-transform hover:scale-110",
                              color === preset ? "border-foreground ring-2 ring-offset-2 ring-foreground" : "border-transparent"
                            )}
                            style={{ backgroundColor: preset }}
                          />
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


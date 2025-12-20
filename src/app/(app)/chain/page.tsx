"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Loader2, User, Users, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

interface TreeNode {
  profile: Profile;
  children: TreeNode[];
  isExpanded: boolean;
}

export default function ChainPage() {
  const { profile } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [teamRelations, setTeamRelations] = useState<{ supervisor_id: string; subordinate_id: string }[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const supabase = createClient();

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

  function getRankColor(rank: string | null): string {
    const colors: Record<string, string> = {
      CMSgt: "bg-purple-100 dark:bg-purple-900/30 border-purple-500",
      SMSgt: "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-500",
      MSgt: "bg-blue-100 dark:bg-blue-900/30 border-blue-500",
      TSgt: "bg-cyan-100 dark:bg-cyan-900/30 border-cyan-500",
      SSgt: "bg-teal-100 dark:bg-teal-900/30 border-teal-500",
      SrA: "bg-green-100 dark:bg-green-900/30 border-green-500",
      A1C: "bg-lime-100 dark:bg-lime-900/30 border-lime-500",
      Amn: "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500",
      AB: "bg-orange-100 dark:bg-orange-900/30 border-orange-500",
    };
    return colors[rank || ""] || "bg-gray-100 dark:bg-gray-900/30 border-gray-500";
  }

  function renderTreeNode(node: TreeNode, depth: number = 0, isLast: boolean = true) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.profile.id);

    return (
      <div key={node.profile.id} className="relative">
        {/* Connector lines */}
        {depth > 0 && (
          <>
            {/* Horizontal line to node */}
            <div
              className="absolute border-t-2 border-border"
              style={{
                left: -24,
                top: 28,
                width: 24,
              }}
            />
            {/* Vertical line from parent */}
            {!isLast && (
              <div
                className="absolute border-l-2 border-border"
                style={{
                  left: -24,
                  top: 28,
                  height: "calc(100% + 8px)",
                }}
              />
            )}
          </>
        )}

        {/* Node card */}
        <div
          className={cn(
            "relative p-3 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md",
            getRankColor(node.profile.rank),
            node.profile.id === profile?.id && "ring-2 ring-primary ring-offset-2"
          )}
          onClick={() => hasChildren && toggleExpand(node.profile.id)}
        >
          <div className="flex items-center gap-3">
            {hasChildren && (
              <div className="shrink-0">
                {isExpanded ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </div>
            )}
            <Avatar className="size-10 shrink-0">
              <AvatarFallback className="text-sm font-medium">
                {node.profile.full_name?.split(" ").map((n) => n[0]).join("") || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">
                {node.profile.rank} {node.profile.full_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {node.profile.afsc} • {node.profile.unit}
              </p>
            </div>
            {hasChildren && (
              <Badge variant="secondary" className="shrink-0">
                {node.children.length}
              </Badge>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="ml-8 mt-2 space-y-2 relative">
            {/* Vertical line connecting children */}
            <div
              className="absolute border-l-2 border-border"
              style={{
                left: -24,
                top: 0,
                height: "calc(100% - 28px)",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Chain of Command</h1>
        <p className="text-muted-foreground">
          Visualization of your supervision hierarchy
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{allProfiles.length - 1}</p>
                <p className="text-xs text-muted-foreground">Total in Chain</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {Object.entries(stats)
          .sort(([a], [b]) => {
            const order = ["CMSgt", "SMSgt", "MSgt", "TSgt", "SSgt", "SrA", "A1C", "Amn", "AB"];
            return order.indexOf(a) - order.indexOf(b);
          })
          .slice(0, 5)
          .map(([rank, count]) => (
            <Card key={rank}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <User className="size-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{rank}s</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Tree */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Supervision Tree
          </CardTitle>
          <CardDescription>
            Click on a node to expand/collapse. Your position is highlighted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tree ? (
            <div className="p-4">{renderTreeNode(tree)}</div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No subordinates in your chain of command.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rank Colors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {["CMSgt", "SMSgt", "MSgt", "TSgt", "SSgt", "SrA", "A1C", "Amn", "AB"].map((rank) => (
              <div
                key={rank}
                className={cn("px-3 py-1 rounded border-2 text-xs font-medium", getRankColor(rank))}
              >
                {rank}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


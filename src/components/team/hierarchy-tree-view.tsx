"use client";

import { useMemo, useRef, useEffect, useState, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/utils";
import type { Rank } from "@/types/database";

// Layout configuration - compact spacing for large trees
const LAYOUT_CONFIG = {
  nodeWidth: 75,          // Horizontal space per node (was 90)
  cardWidth: 68,          // Actual card width
  baseRowHeight: 55,      // Vertical space between tiers (was 80)
  juniorStackHeight: 45,  // Height per stacked junior enlisted (was 60)
  topPadding: 20,         // Top padding
  leftPadding: 40,        // Left padding
  cardHeight: 36,         // Approximate card height for line calculations
};

// Rank ordering from highest to lowest (officers first, then enlisted)
const HIERARCHY_RANK_ORDER: Rank[] = [
  // General Officers
  "Gen", "Lt Gen", "Maj Gen", "Brig Gen",
  // Field Grade Officers
  "Col", "Lt Col", "Maj",
  // Company Grade Officers
  "Capt", "1st Lt", "2d Lt",
  // Senior Enlisted
  "CMSgt", "SMSgt", "MSgt", "TSgt", "SSgt",
  // Junior Enlisted
  "SrA", "A1C", "Amn", "AB",
  // Civilian
  "Civilian",
];

// Junior enlisted ranks that should be stacked vertically under SSgt
const JUNIOR_ENLISTED_RANKS: Rank[] = ["SrA", "A1C", "Amn", "AB"];

// Check if a rank is junior enlisted
function isJuniorEnlisted(rank: Rank | null): boolean {
  return rank !== null && JUNIOR_ENLISTED_RANKS.includes(rank);
}

// Display tiers for row-based layout (junior enlisted combined)
const DISPLAY_TIERS: (Rank | "JuniorEnlisted")[] = [
  // General Officers
  "Gen", "Lt Gen", "Maj Gen", "Brig Gen",
  // Field Grade Officers
  "Col", "Lt Col", "Maj",
  // Company Grade Officers
  "Capt", "1st Lt", "2d Lt",
  // Senior Enlisted (each gets own row)
  "CMSgt", "SMSgt", "MSgt", "TSgt", "SSgt",
  // Junior Enlisted (combined into one tier)
  "JuniorEnlisted",
  // Civilian
  "Civilian",
];

// Get display tier for a rank
function getDisplayTier(rank: Rank | null): Rank | "JuniorEnlisted" | "Unknown" {
  if (!rank) return "Unknown";
  if (isJuniorEnlisted(rank)) return "JuniorEnlisted";
  return rank;
}

// Tree node data structure (matching team page)
interface TreeNodeData {
  id: string;
  full_name: string | null;
  rank: Rank | null;
  afsc: string | null;
  unit: string | null;
  isManagedMember: boolean;
  isPlaceholder?: boolean;
  email?: string | null;
  member_status?: "active" | "prior_subordinate" | "archived" | "pending_link";
  supervision_start_date?: string | null;
  supervision_end_date?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
}

interface TreeNode {
  data: TreeNodeData;
  children: TreeNode[];
  isExpanded: boolean;
}

// Flattened member with position info for hierarchy view
interface HierarchyMember {
  id: string;
  name: string;
  rank: Rank | null;
  parentId: string | null;
  isManagedMember: boolean;
  isPlaceholder?: boolean;
  isCurrentUser: boolean;
  children: string[]; // IDs of direct children
  stackIndex?: number; // Vertical position within junior enlisted stack (0 = top)
  stackTotal?: number; // Total items in the stack
}

interface RankColors {
  [key: string]: string;
}

interface HierarchyTreeViewProps {
  tree: TreeNode | null;
  currentUserId: string;
  rankColors: RankColors;
  onMemberClick?: (memberId: string, isManagedMember: boolean) => void;
}

// Get the last name from full name
function getLastName(fullName: string | null): string {
  if (!fullName) return "Unknown";
  const parts = fullName.trim().split(" ");
  return parts[parts.length - 1] || "Unknown";
}

// Get rank index for ordering (lower = higher rank)
function getRankIndex(rank: Rank | null): number {
  if (!rank) return HIERARCHY_RANK_ORDER.length;
  const idx = HIERARCHY_RANK_ORDER.indexOf(rank);
  return idx === -1 ? HIERARCHY_RANK_ORDER.length : idx;
}

// Flatten tree into a map of members with parent/child relationships
function flattenTree(
  node: TreeNode,
  parentId: string | null,
  currentUserId: string,
  result: Map<string, HierarchyMember>
): void {
  const member: HierarchyMember = {
    id: node.data.id,
    name: node.data.full_name || "Unknown",
    rank: node.data.rank,
    parentId,
    isManagedMember: node.data.isManagedMember,
    isPlaceholder: node.data.isPlaceholder,
    isCurrentUser: node.data.id === currentUserId,
    children: node.children.map((c) => c.data.id),
  };
  result.set(node.data.id, member);

  for (const child of node.children) {
    flattenTree(child, node.data.id, currentUserId, result);
  }
}

// Group members by display tier (junior enlisted combined)
function groupByDisplayTier(members: Map<string, HierarchyMember>): Map<Rank | "JuniorEnlisted" | "Unknown", HierarchyMember[]> {
  const groups = new Map<Rank | "JuniorEnlisted" | "Unknown", HierarchyMember[]>();
  
  for (const member of members.values()) {
    const tier = getDisplayTier(member.rank);
    if (!groups.has(tier)) {
      groups.set(tier, []);
    }
    groups.get(tier)!.push(member);
  }
  
  return groups;
}

// Get display tier index for ordering
function getDisplayTierIndex(tier: Rank | "JuniorEnlisted" | "Unknown"): number {
  if (tier === "Unknown") return DISPLAY_TIERS.length;
  const idx = DISPLAY_TIERS.indexOf(tier);
  return idx === -1 ? DISPLAY_TIERS.length : idx;
}

// Calculate horizontal position for a member based on their subtree
interface PositionedMember extends HierarchyMember {
  x: number; // Horizontal center position
  width: number; // Width of subtree
}

function calculatePositions(
  members: Map<string, HierarchyMember>,
  rootId: string
): Map<string, PositionedMember> {
  const positioned = new Map<string, PositionedMember>();
  const { nodeWidth, leftPadding } = LAYOUT_CONFIG;
  
  // Check if all children of a member are junior enlisted (will be stacked vertically)
  function hasOnlyJuniorEnlistedChildren(memberId: string): boolean {
    const member = members.get(memberId);
    if (!member || member.children.length === 0) return false;
    return member.children.every(childId => {
      const child = members.get(childId);
      return child && isJuniorEnlisted(child.rank);
    });
  }
  
  // Calculate subtree width recursively (bottom-up)
  // Junior enlisted children are stacked vertically, so they don't add horizontal width
  function getSubtreeWidth(memberId: string): number {
    const member = members.get(memberId);
    if (!member) return nodeWidth;
    
    if (member.children.length === 0) {
      return nodeWidth;
    }
    
    // If this member only has junior enlisted children, they stack vertically
    // So the subtree width is just this node's width
    if (hasOnlyJuniorEnlistedChildren(memberId)) {
      return nodeWidth;
    }
    
    // Sort children by rank, then alphabetically
    const sortedChildren = [...member.children].sort((a, b) => {
      const memberA = members.get(a);
      const memberB = members.get(b);
      const rankDiff = getRankIndex(memberA?.rank || null) - getRankIndex(memberB?.rank || null);
      if (rankDiff !== 0) return rankDiff;
      return (memberA?.name || "").localeCompare(memberB?.name || "");
    });
    
    let totalWidth = 0;
    for (const childId of sortedChildren) {
      const child = members.get(childId);
      // Skip junior enlisted in width calculation - they're stacked vertically
      if (child && isJuniorEnlisted(child.rank)) {
        continue;
      }
      totalWidth += getSubtreeWidth(childId);
    }
    
    return Math.max(nodeWidth, totalWidth);
  }
  
  // Position nodes recursively (top-down)
  function positionNode(memberId: string, startX: number): number {
    const member = members.get(memberId);
    if (!member) return startX;
    
    const subtreeWidth = getSubtreeWidth(memberId);
    
    if (member.children.length === 0) {
      // Leaf node - center in its allocated space
      positioned.set(memberId, {
        ...member,
        x: startX + nodeWidth / 2,
        width: nodeWidth,
      });
      return startX + nodeWidth;
    }
    
    // If this member only has junior enlisted children (stacked vertically)
    // Position this node and all children at same X
    if (hasOnlyJuniorEnlistedChildren(memberId)) {
      const centerX = startX + nodeWidth / 2;
      positioned.set(memberId, {
        ...member,
        x: centerX,
        width: nodeWidth,
      });
      // Position all junior enlisted children at same X (they'll be stacked vertically)
      for (const childId of member.children) {
        const child = members.get(childId);
        if (child) {
          positioned.set(childId, {
            ...child,
            x: centerX,
            width: nodeWidth,
          });
        }
      }
      return startX + nodeWidth;
    }
    
    // Sort children by rank, then alphabetically
    const sortedChildren = [...member.children].sort((a, b) => {
      const memberA = members.get(a);
      const memberB = members.get(b);
      const rankDiff = getRankIndex(memberA?.rank || null) - getRankIndex(memberB?.rank || null);
      if (rankDiff !== 0) return rankDiff;
      return (memberA?.name || "").localeCompare(memberB?.name || "");
    });
    
    // Position non-junior children first
    let currentX = startX;
    let minChildX = Infinity;
    let maxChildX = -Infinity;
    
    for (const childId of sortedChildren) {
      const child = members.get(childId);
      // Skip junior enlisted - they get positioned with their SSgt ancestor later
      if (child && isJuniorEnlisted(child.rank)) {
        continue;
      }
      currentX = positionNode(childId, currentX);
      const childPos = positioned.get(childId);
      if (childPos) {
        minChildX = Math.min(minChildX, childPos.x);
        maxChildX = Math.max(maxChildX, childPos.x);
      }
    }
    
    // Center parent above children
    const parentX = minChildX === Infinity ? startX + nodeWidth / 2 : (minChildX + maxChildX) / 2;
    
    positioned.set(memberId, {
      ...member,
      x: parentX,
      width: subtreeWidth,
    });
    
    return startX + subtreeWidth;
  }
  
  positionNode(rootId, leftPadding);
  
  return positioned;
}

export function HierarchyTreeView({
  tree,
  currentUserId,
  rankColors,
  onMemberClick,
}: HierarchyTreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Drag-to-pan state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  
  // Flatten tree and calculate positions
  const { positioned, tierRows, totalWidth, totalHeight } = useMemo(() => {
    if (!tree) {
      return { positioned: new Map(), tierRows: [], totalWidth: 0, totalHeight: 0 };
    }
    
    const { baseRowHeight, juniorStackHeight, topPadding, nodeWidth } = LAYOUT_CONFIG;
    
    // Flatten tree
    const members = new Map<string, HierarchyMember>();
    flattenTree(tree, null, currentUserId, members);
    
    // Calculate stack indices for junior enlisted under each SSgt
    // Find all junior enlisted and group by their nearest SSgt+ ancestor
    const juniorEnlistedByAncestor = new Map<string, HierarchyMember[]>();
    
    for (const member of members.values()) {
      if (isJuniorEnlisted(member.rank)) {
        // Find the nearest SSgt+ ancestor (the supervisor who is SSgt or higher)
        let ancestorId = member.parentId;
        while (ancestorId) {
          const ancestor = members.get(ancestorId);
          if (!ancestor) break;
          if (!isJuniorEnlisted(ancestor.rank)) {
            // Found non-junior enlisted ancestor
            if (!juniorEnlistedByAncestor.has(ancestorId)) {
              juniorEnlistedByAncestor.set(ancestorId, []);
            }
            juniorEnlistedByAncestor.get(ancestorId)!.push(member);
            break;
          }
          ancestorId = ancestor.parentId;
        }
      }
    }
    
    // Sort each group by rank order and assign stack indices
    // Also track which SSgt ancestor each junior enlisted belongs to
    const juniorToAncestorMap = new Map<string, string>();
    
    for (const [ancestorId, juniorMembers] of juniorEnlistedByAncestor) {
      juniorMembers.sort((a, b) => {
        const rankDiff = getRankIndex(a.rank) - getRankIndex(b.rank);
        if (rankDiff !== 0) return rankDiff;
        return a.name.localeCompare(b.name);
      });
      
      juniorMembers.forEach((m, idx) => {
        m.stackIndex = idx;
        m.stackTotal = juniorMembers.length;
        juniorToAncestorMap.set(m.id, ancestorId);
      });
    }
    
    // Calculate positions
    const pos = calculatePositions(members, tree.data.id);
    
    // Override x positions for junior enlisted to align with their SSgt ancestor
    for (const [memberId, ancestorId] of juniorToAncestorMap) {
      const memberPos = pos.get(memberId);
      const ancestorPos = pos.get(ancestorId);
      if (memberPos && ancestorPos) {
        memberPos.x = ancestorPos.x;
      }
    }
    
    // Group by display tier for row rendering
    const groups = groupByDisplayTier(members);
    
    // Sort tiers by hierarchy order
    const sortedTiers = Array.from(groups.keys()).sort((a, b) => {
      return getDisplayTierIndex(a) - getDisplayTierIndex(b);
    });
    
    // Find max stack size for junior enlisted
    let maxStackSize = 0;
    for (const [, juniorMembers] of juniorEnlistedByAncestor) {
      maxStackSize = Math.max(maxStackSize, juniorMembers.length);
    }
    
    let currentY = topPadding + 20;
    const rows = sortedTiers.map((tier) => {
      const tierMembers = groups.get(tier) || [];
      const isJuniorTier = tier === "JuniorEnlisted";
      const tierHeight = isJuniorTier 
        ? Math.max(baseRowHeight, maxStackSize * juniorStackHeight)
        : baseRowHeight;
      
      const row = {
        tier,
        y: currentY,
        height: tierHeight,
        members: tierMembers,
        isJuniorEnlisted: isJuniorTier,
      };
      
      currentY += tierHeight;
      return row;
    });
    
    // Calculate total dimensions
    let maxX = 0;
    for (const p of pos.values()) {
      maxX = Math.max(maxX, p.x + nodeWidth / 2);
    }
    
    return {
      positioned: pos,
      tierRows: rows,
      totalWidth: Math.max(maxX + 20, 400),
      totalHeight: currentY + 20,
    };
  }, [tree, currentUserId]);
  
  // Update dimensions on resize
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  // Scroll to show the root (current user) when tree first loads
  // Only scrolls when tree is wider than container (flexbox centers small trees automatically)
  useEffect(() => {
    if (!containerRef.current || !tree || positioned.size === 0) return;
    
    const containerWidth = containerRef.current.clientWidth;
    
    // If tree fits within container, flexbox will center it - no scroll needed
    if (totalWidth <= containerWidth) {
      containerRef.current.scrollLeft = 0;
      containerRef.current.scrollTop = 0;
      return;
    }
    
    // Find the root node position to scroll to it for large trees
    const rootPos = positioned.get(tree.data.id);
    if (rootPos) {
      // Center the root node horizontally in the view
      const scrollLeft = Math.max(0, rootPos.x - containerWidth / 2);
      containerRef.current.scrollLeft = scrollLeft;
      containerRef.current.scrollTop = 0;
    }
  }, [tree, positioned, totalWidth]);
  
  // Drag-to-pan handlers
  const handleMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    // Only start drag on left mouse button and if not clicking a button
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    });
    e.preventDefault();
  }, []);
  
  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDragging || !containerRef.current) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    
    containerRef.current.scrollLeft = dragStart.scrollLeft - deltaX;
    containerRef.current.scrollTop = dragStart.scrollTop - deltaY;
  }, [isDragging, dragStart]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  // Get color style for rank
  const getRankStyle = useCallback((rank: Rank | null): React.CSSProperties => {
    const color = rankColors[rank || ""];
    if (!color) return {};
    return {
      backgroundColor: `${color}30`,
      borderColor: color,
    };
  }, [rankColors]);
  
  const hasCustomColor = useCallback((rank: Rank | null): boolean => {
    return Boolean(rankColors[rank || ""]);
  }, [rankColors]);
  
  if (!tree) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        No supervision hierarchy to display.
      </div>
    );
  }
  
  // For large trees, don't scale - just allow horizontal scrolling
  // Only scale if the tree fits reasonably (scale would be > 0.5)
  const rawScale = dimensions.width > 0 ? (dimensions.width - 40) / totalWidth : 1;
  const shouldScale = rawScale >= 0.5 && rawScale < 1;
  const scale = shouldScale ? rawScale : 1;
  const effectiveHeight = shouldScale ? totalHeight * scale : totalHeight;
  
  const { cardWidth, juniorStackHeight, cardHeight } = LAYOUT_CONFIG;
  
  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full overflow-auto border border-border/50 rounded-md bg-muted/20 select-none",
        // Custom scrollbar styling to hide the corner square
        "[&::-webkit-scrollbar-corner]:bg-transparent [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2",
        "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full",
        "[&::-webkit-scrollbar-track]:bg-transparent",
        // Center content when tree is smaller than container
        "flex justify-center",
        isDragging ? "cursor-grabbing" : "cursor-grab"
      )}
      style={{ 
        height: Math.min(totalHeight + 40, 500),
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Inner div with explicit dimensions creates the scrollable area */}
      <div
        className="relative shrink-0"
        style={{
          width: totalWidth,
          height: totalHeight,
          minWidth: totalWidth,
          minHeight: totalHeight,
          transform: shouldScale ? `scale(${scale})` : undefined,
          transformOrigin: "top left",
        }}
      >
        {/* SVG for connecting lines */}
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: totalWidth, height: totalHeight }}
          aria-hidden="true"
        >
          {/* Draw lines between parent and children */}
          {Array.from(positioned.values()).map((member) => {
            const parent = member.parentId ? positioned.get(member.parentId) : null;
            if (!parent) return null;
            
            // Find the row for parent and child
            const parentRow = tierRows.find((r) => 
              r.members.some((m) => m.id === parent.id)
            );
            const childRow = tierRows.find((r) => 
              r.members.some((m) => m.id === member.id)
            );
            
            if (!parentRow || !childRow) return null;
            
            // Calculate Y positions accounting for stacking
            const parentStackOffset = parent.stackIndex !== undefined 
              ? parent.stackIndex * juniorStackHeight 
              : 0;
            const childStackOffset = member.stackIndex !== undefined 
              ? member.stackIndex * juniorStackHeight 
              : 0;
            
            // Draw line from parent bottom to child top (with tighter spacing)
            const startX = parent.x;
            const startY = parentRow.y + parentStackOffset + cardHeight / 2 + 2;
            const endX = member.x;
            const endY = childRow.y + childStackOffset - cardHeight / 2 - 2;
            
            // If same x position (stacked column), draw straight line
            // Otherwise draw Manhattan-style routed line with shorter middle segment
            const isSameColumn = Math.abs(startX - endX) < 5;
            const midY = startY + (endY - startY) * 0.5;
            const pathD = isSameColumn
              ? `M ${startX} ${startY} L ${endX} ${endY}`
              : `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
            
            return (
              <path
                key={`line-${parent.id}-${member.id}`}
                d={pathD}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-muted-foreground opacity-40"
              />
            );
          })}
        </svg>
        
        {/* Render tier rows */}
        {tierRows.map((row) => (
          <div
            key={row.tier}
            className="absolute left-0 right-0"
            style={{ top: row.y - cardHeight / 2, height: row.height }}
          >
            {/* Members in this row */}
            {row.members.map((member) => {
              const pos = positioned.get(member.id);
              if (!pos) return null;
              
              // Calculate vertical offset for stacked junior enlisted
              const stackOffset = member.stackIndex !== undefined 
                ? member.stackIndex * juniorStackHeight 
                : 0;
              
              return (
                <button
                  key={member.id}
                  className={cn(
                    "absolute flex flex-col items-center justify-center",
                    "px-1.5 py-1 rounded-md border-2 bg-card shadow-sm",
                    "transition-all hover:shadow-md hover:scale-105",
                    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                    "text-center",
                    !hasCustomColor(member.rank) && "border-border",
                    member.isCurrentUser && "ring-2 ring-primary ring-offset-1",
                    member.isPlaceholder && "opacity-80"
                  )}
                  style={{
                    left: pos.x - cardWidth / 2,
                    top: stackOffset,
                    width: cardWidth,
                    height: cardHeight,
                    ...getRankStyle(member.rank),
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMemberClick?.(member.id, member.isManagedMember);
                  }}
                  aria-label={`${member.rank || ""} ${member.name}`}
                >
                  <span className="text-[9px] font-semibold text-muted-foreground truncate w-full leading-tight">
                    {member.rank || "—"}
                  </span>
                  <span className="text-[10px] font-medium truncate w-full leading-tight">
                    {getLastName(member.name)}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

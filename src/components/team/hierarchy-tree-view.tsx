"use client";

import { useMemo, useRef, useEffect, useState, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Rank } from "@/types/database";
import { LuCircleMinus, LuCirclePlus, } from "react-icons/lu";

// Layout configuration - compact spacing for large trees
const LAYOUT_CONFIG = {
  nodeWidth: 75,          // Horizontal space per node (was 90)
  cardWidth: 68,          // Actual card width
  baseRowHeight: 55,      // Vertical space between tiers (was 80)
  juniorStackHeight: 45,  // Height per stacked junior enlisted (was 60)
  topPadding: 60,         // Top padding - extra space for dragging
  leftPadding: 80,        // Left padding - extra space for dragging
  rightPadding: 80,       // Right padding - extra space for dragging
  bottomPadding: 60,      // Bottom padding - extra space for dragging
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
  depth?: number; // Depth in tree (0 = root)
  isSameRankAsParent?: boolean; // True if parent has same rank tier (positioned to the right)
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

// Flatten tree for layout — always includes every member so positions stay fixed.
// Rank filter collapse mode may omit filtered ranks; member collapse is visual-only.
function flattenTree(
  node: TreeNode,
  parentId: string | null,
  currentUserId: string,
  result: Map<string, HierarchyMember>,
  visibleRanks: Set<Rank>,
  filterMode: "fade" | "collapse",
  depth: number = 0,
  parentRank: Rank | null = null
): void {
  const isRankVisible = visibleRanks.size === 0 ||
    (node.data.rank && visibleRanks.has(node.data.rank));

  const shouldInclude = filterMode === "fade" || isRankVisible;
  const childParentId = shouldInclude ? node.data.id : parentId;

  const nodeTier = getDisplayTier(node.data.rank);
  const parentTier = getDisplayTier(parentRank);
  const isSameRankAsParent = parentId !== null && nodeTier === parentTier && nodeTier !== "JuniorEnlisted";

  if (shouldInclude) {
    const childIds: string[] = [];
    for (const child of node.children) {
      const childRankVisible = visibleRanks.size === 0 ||
        (child.data.rank && visibleRanks.has(child.data.rank));

      if (filterMode === "fade" || childRankVisible) {
        childIds.push(child.data.id);
      } else {
        childIds.push(...findVisibleDescendantIds(child, visibleRanks));
      }
    }

    result.set(node.data.id, {
      id: node.data.id,
      name: node.data.full_name || "Unknown",
      rank: node.data.rank,
      parentId,
      isManagedMember: node.data.isManagedMember,
      isPlaceholder: node.data.isPlaceholder,
      isCurrentUser: node.data.id === currentUserId,
      children: childIds,
      depth,
      isSameRankAsParent,
    });
  }

  for (const child of node.children) {
    flattenTree(child, childParentId, currentUserId, result, visibleRanks, filterMode, depth + 1, node.data.rank);
  }
}

// Hide descendants when an ancestor is collapsed — layout slots stay reserved.
function isHiddenByCollapse(
  memberId: string,
  members: Map<string, HierarchyMember>,
  collapsedNodes: Set<string>
): boolean {
  let member = members.get(memberId);
  while (member?.parentId) {
    if (collapsedNodes.has(member.parentId)) return true;
    member = members.get(member.parentId);
  }
  return false;
}

// Helper to find IDs of visible descendants (for connecting across filtered-out nodes)
function findVisibleDescendantIds(node: TreeNode, visibleRanks: Set<Rank>): string[] {
  const result: string[] = [];
  
  const isVisible = visibleRanks.size === 0 || 
    (node.data.rank && visibleRanks.has(node.data.rank));
  
  if (isVisible) {
    result.push(node.data.id);
  } else {
    // Not visible, check children
    for (const child of node.children) {
      result.push(...findVisibleDescendantIds(child, visibleRanks));
    }
  }
  
  return result;
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

// Group members by depth (for proper tier placement when same-rank supervision exists)
function groupByDepth(members: Map<string, HierarchyMember>): Map<number, HierarchyMember[]> {
  const groups = new Map<number, HierarchyMember[]>();
  
  for (const member of members.values()) {
    const depth = member.depth ?? 0;
    if (!groups.has(depth)) {
      groups.set(depth, []);
    }
    groups.get(depth)!.push(member);
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
  
  // Get the chain of same-rank children (horizontal chain)
  function getSameRankChain(memberId: string): string[] {
    const chain: string[] = [];
    const member = members.get(memberId);
    if (!member) return chain;
    
    for (const childId of member.children) {
      const child = members.get(childId);
      if (child?.isSameRankAsParent) {
        chain.push(childId);
        // Recursively get chain from this child too
        chain.push(...getSameRankChain(childId));
      }
    }
    return chain;
  }
  
  // Calculate subtree width recursively (bottom-up)
  // Junior enlisted children are stacked vertically, so they don't add horizontal width
  // Same-rank children are positioned horizontally, adding to this node's row width
  function getSubtreeWidth(memberId: string): number {
    const member = members.get(memberId);
    if (!member) return nodeWidth;
    
    // Calculate width needed for same-rank horizontal chain at this level
    const sameRankChain = getSameRankChain(memberId);
    const horizontalChainWidth = (1 + sameRankChain.length) * nodeWidth;
    
    if (member.children.length === 0) {
      return nodeWidth;
    }
    
    // If this member only has junior enlisted children, they stack vertically
    // So the subtree width is just this node's width (plus any same-rank chain)
    if (hasOnlyJuniorEnlistedChildren(memberId)) {
      return horizontalChainWidth;
    }
    
    // Sort children by rank, then alphabetically
    const sortedChildren = [...member.children].sort((a, b) => {
      const memberA = members.get(a);
      const memberB = members.get(b);
      const rankDiff = getRankIndex(memberA?.rank || null) - getRankIndex(memberB?.rank || null);
      if (rankDiff !== 0) return rankDiff;
      return (memberA?.name || "").localeCompare(memberB?.name || "");
    });
    
    let totalChildWidth = 0;
    for (const childId of sortedChildren) {
      const child = members.get(childId);
      // Skip junior enlisted in width calculation - they're stacked vertically
      if (child && isJuniorEnlisted(child.rank)) {
        continue;
      }
      // Skip same-rank children - they're positioned horizontally with parent
      if (child?.isSameRankAsParent) {
        continue;
      }
      totalChildWidth += getSubtreeWidth(childId);
    }
    
    // Width is max of: horizontal chain width, or children subtree width
    return Math.max(horizontalChainWidth, totalChildWidth);
  }
  
  // Position a horizontal chain of same-rank members
  function positionSameRankChain(startMemberId: string, startX: number): number {
    let currentX = startX;
    const member = members.get(startMemberId);
    if (!member) return currentX;
    
    // Find same-rank children of this member
    for (const childId of member.children) {
      const child = members.get(childId);
      if (child?.isSameRankAsParent) {
        // Position this same-rank child to the right
        positioned.set(childId, {
          ...child,
          x: currentX + nodeWidth / 2,
          width: nodeWidth,
        });
        currentX += nodeWidth;
        
        // Recursively position any same-rank children of this child
        currentX = positionSameRankChain(childId, currentX);
        
        // Also need to position non-same-rank children of this same-rank child
        positionChildrenOfSameRankMember(childId);
      }
    }
    return currentX;
  }
  
  // Position children of a same-rank member (their regular children go below)
  function positionChildrenOfSameRankMember(memberId: string): void {
    const member = members.get(memberId);
    if (!member) return;
    
    const memberPos = positioned.get(memberId);
    if (!memberPos) return;
    
    // Position non-same-rank, non-junior children below this member
    for (const childId of member.children) {
      const child = members.get(childId);
      if (!child) continue;
      if (child.isSameRankAsParent) continue; // Already positioned in chain
      if (isJuniorEnlisted(child.rank)) {
        // Position junior enlisted at same X
        positioned.set(childId, {
          ...child,
          x: memberPos.x,
          width: nodeWidth,
        });
      } else {
        // Regular child - position below centered
        positionNode(childId, memberPos.x - nodeWidth / 2);
      }
    }
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
    
    // Position non-junior, non-same-rank children first (below this node)
    let currentX = startX;
    let minChildX = Infinity;
    let maxChildX = -Infinity;
    
    for (const childId of sortedChildren) {
      const child = members.get(childId);
      // Skip junior enlisted - they get positioned with their SSgt ancestor later
      if (child && isJuniorEnlisted(child.rank)) {
        continue;
      }
      // Skip same-rank children - they get positioned horizontally
      if (child?.isSameRankAsParent) {
        continue;
      }
      currentX = positionNode(childId, currentX);
      const childPos = positioned.get(childId);
      if (childPos) {
        minChildX = Math.min(minChildX, childPos.x);
        maxChildX = Math.max(maxChildX, childPos.x);
      }
    }
    
    // Calculate parent X position
    // If there are regular children below, center above them
    // Otherwise, start at startX
    let parentX: number;
    if (minChildX !== Infinity) {
      parentX = (minChildX + maxChildX) / 2;
    } else {
      parentX = startX + nodeWidth / 2;
    }
    
    positioned.set(memberId, {
      ...member,
      x: parentX,
      width: subtreeWidth,
    });
    
    // Position same-rank children to the right of this member
    let chainEndX = parentX + nodeWidth / 2;
    chainEndX = positionSameRankChain(memberId, chainEndX);
    
    // Return the rightmost edge of the subtree
    return Math.max(currentX, chainEndX);
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  
  // Dynamic height based on viewport
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);
  
  // Collapsed nodes state - stores IDs of members whose children are hidden
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  
  // Toggle collapse state for a member
  const toggleCollapse = useCallback((memberId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }, []);
  
  // Rank tiers for quick filter buttons
  // NCO ranks (show collapse buttons in tree)
  const NCO_FILTER_RANKS: Rank[] = ["SSgt", "TSgt", "MSgt", "SMSgt", "CMSgt"];
  // Junior enlisted ranks (no collapse buttons in tree, but can filter to show)
  const JUNIOR_FILTER_RANKS: Rank[] = ["AB", "Amn", "A1C", "SrA"];
  
  // Visible ranks filter - when empty, all ranks are shown
  // When populated, only ranks in the set are visible
  const [visibleRanks, setVisibleRanks] = useState<Set<Rank>>(new Set());
  
  // Filter mode: "fade" keeps cards in place but faded, "collapse" removes them from tree
  const [filterMode, setFilterMode] = useState<"fade" | "collapse">("fade");
  
  // Toggle a rank's visibility
  const toggleRankVisibility = useCallback((rank: Rank) => {
    setVisibleRanks(prev => {
      const next = new Set(prev);
      if (next.has(rank)) {
        next.delete(rank);
      } else {
        next.add(rank);
      }
      return next;
    });
  }, []);
  
  // Show all ranks
  const showAllRanks = useCallback(() => {
    setVisibleRanks(new Set());
    setCollapsedNodes(new Set());
  }, []);
  
  // Check if a rank should be visible
  const isRankVisible = useCallback((rank: Rank | null): boolean => {
    if (visibleRanks.size === 0) return true; // Empty means show all
    if (!rank) return false;
    return visibleRanks.has(rank);
  }, [visibleRanks]);
  
  // Check if a rank should be included in tree layout (for collapse mode)
  const isRankIncluded = useCallback((rank: Rank | null): boolean => {
    if (filterMode === "fade") return true; // Fade mode always includes all
    return isRankVisible(rank);
  }, [filterMode, isRankVisible]);
  
  // Zoom state (1 = 100%, 0.5 = 50%, 2 = 200%)
  const [zoom, setZoom] = useState(1);
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 2;
  
  // Canvas pan offset (Figma-style — not scroll-based)
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;

  // Spacebar held for drag mode (disables card clicks)
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);
  const isSpaceHeldRef = useRef(false);

  // Drag-to-pan state
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  
  // Flatten tree and calculate positions
  const { members, positioned, tierRows, totalWidth, totalHeight, childrenCountMap } = useMemo(() => {
    if (!tree) {
      return {
        members: new Map<string, HierarchyMember>(),
        positioned: new Map(),
        tierRows: [],
        totalWidth: 0,
        totalHeight: 0,
        childrenCountMap: new Map(),
      };
    }
    
    const { baseRowHeight, juniorStackHeight, topPadding, leftPadding, rightPadding, bottomPadding, nodeWidth } = LAYOUT_CONFIG;
    
    // First, build a map of original children count (before collapse filtering)
    const childrenCount = new Map<string, number>();
    function countChildren(node: TreeNode): void {
      childrenCount.set(node.data.id, node.children.length);
      for (const child of node.children) {
        countChildren(child);
      }
    }
    countChildren(tree);
    
    // Flatten full tree for stable layout (collapse is visual-only at render time)
    const members = new Map<string, HierarchyMember>();
    flattenTree(tree, null, currentUserId, members, visibleRanks, filterMode);
    
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
    // In collapse mode, the original root might be filtered out, so find actual roots
    // (members whose parentId is null or whose parent is not in the members map)
    const rootIds: string[] = [];
    for (const member of members.values()) {
      if (member.parentId === null || !members.has(member.parentId)) {
        rootIds.push(member.id);
      }
    }
    
    // If original root exists in members, use it; otherwise use found roots
    const pos = new Map<string, PositionedMember>();
    if (members.has(tree.data.id)) {
      const positions = calculatePositions(members, tree.data.id);
      for (const [id, p] of positions) {
        pos.set(id, p);
      }
    } else if (rootIds.length > 0) {
      // Position each root tree separately, side by side
      let currentX = LAYOUT_CONFIG.leftPadding;
      for (const rootId of rootIds) {
        const positions = calculatePositions(members, rootId);
        // Offset positions by currentX
        let maxX = 0;
        for (const [id, p] of positions) {
          const offsetP = { ...p, x: p.x + currentX - LAYOUT_CONFIG.leftPadding };
          pos.set(id, offsetP);
          maxX = Math.max(maxX, offsetP.x);
        }
        currentX = maxX + LAYOUT_CONFIG.nodeWidth;
      }
    }
    
    // Override x positions for junior enlisted to align with their SSgt ancestor
    for (const [memberId, ancestorId] of juniorToAncestorMap) {
      const memberPos = pos.get(memberId);
      const ancestorPos = pos.get(ancestorId);
      if (memberPos && ancestorPos) {
        memberPos.x = ancestorPos.x;
      }
    }
    
    // Group by display tier for row rendering (rank-based)
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
      members,
      positioned: pos,
      tierRows: rows,
      totalWidth: Math.max(maxX + rightPadding, 400),
      totalHeight: currentY + bottomPadding,
      childrenCountMap: childrenCount,
    };
  }, [tree, currentUserId, visibleRanks, filterMode]);
  
  // Track if initial pan has been set for current tree
  const hasInitialPanned = useRef(false);
  const lastTreeRootId = useRef<string | null>(null);
  
  // Reset initial pan flag when tree root changes (different user/tree)
  useEffect(() => {
    if (tree && tree.data.id !== lastTreeRootId.current) {
      hasInitialPanned.current = false;
      lastTreeRootId.current = tree.data.id;
    }
  }, [tree]);
  
  // Center the root on initial tree load only — preserve pan on collapse/expand
  useEffect(() => {
    if (!containerRef.current || !tree || positioned.size === 0) return;
    if (hasInitialPanned.current) return;
    hasInitialPanned.current = true;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const rootPos = positioned.get(tree.data.id);

    if (rootPos) {
      setPan({
        x: containerWidth / 2 - rootPos.x,
        y: Math.max(24, containerHeight * 0.15),
      });
      return;
    }

    setPan({
      x: (containerWidth - totalWidth) / 2,
      y: (containerHeight - totalHeight) / 2,
    });
  }, [tree, positioned, totalWidth, totalHeight]);

  const stopPanDrag = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    document.removeEventListener("mousemove", onDocumentMouseMove);
    document.removeEventListener("mouseup", onDocumentMouseUp);
  }, []);

  const onDocumentMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    setPan({
      x: dragStartRef.current.panX + deltaX,
      y: dragStartRef.current.panY + deltaY,
    });
  }, []);

  const onDocumentMouseUp = useCallback(() => {
    stopPanDrag();
  }, [stopPanDrag]);

  const startPanDrag = useCallback((clientX: number, clientY: number) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    document.addEventListener("mousemove", onDocumentMouseMove);
    document.addEventListener("mouseup", onDocumentMouseUp);
  }, [onDocumentMouseMove, onDocumentMouseUp]);

  // Drag-to-pan: Space+click, middle mouse, or click empty canvas area
  const handleMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const isMiddleButton = e.button === 1;
    const isLeftWithSpace = e.button === 0 && isSpaceHeldRef.current;
    const isLeftOnBackground =
      e.button === 0 && !(e.target as HTMLElement).closest("button");

    if (!isMiddleButton && !isLeftWithSpace && !isLeftOnBackground) return;

    e.preventDefault();
    startPanDrag(e.clientX, e.clientY);
  }, [startPanDrag]);

  // Wheel: Ctrl/Cmd+zoom, otherwise pan (trackpad / scroll)
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => {
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
        return Math.round(newZoom * 100) / 100;
      });
      return;
    }

    setPan((prev) => ({
      x: prev.x - e.deltaX,
      y: prev.y - e.deltaY,
    }));
  }, []);
  
  // Track if mouse is over container for spacebar handling
  const isMouseOverContainer = useRef(false);
  
  // Handle keyboard events for spacebar drag mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle spacebar
      if (e.code !== "Space") return;
      
      // Always prevent default for spacebar when mouse is over container
      if (isMouseOverContainer.current) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (!e.repeat) {
          isSpaceHeldRef.current = true;
          setIsSpaceHeld(true);
        }
        return false;
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        isSpaceHeldRef.current = false;
        setIsSpaceHeld(false);
        stopPanDrag();
      }
    };
    
    // Prevent spacebar scroll on the container itself
    const handleContainerKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
      }
    };
    
    const container = containerRef.current;
    
    // Use capture phase at document level to catch event before any scroll
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("keyup", handleKeyUp, { capture: true });
    
    // Also prevent on the container directly
    if (container) {
      container.addEventListener("keydown", handleContainerKeyDown);
    }
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("keyup", handleKeyUp, { capture: true });
      if (container) {
        container.removeEventListener("keydown", handleContainerKeyDown);
      }
      stopPanDrag();
    };
  }, [stopPanDrag]);
  
  // Attach wheel event listener (needs to be non-passive for preventDefault)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    container.addEventListener("wheel", handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);
  
  // Calculate container height to fit within viewport without causing page scroll
  useEffect(() => {
    const calculateHeight = () => {
      if (!containerRef.current) return;
      
      // Get the scroll container's position
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      // Leave some margin at the bottom (for card padding and page margin)
      const bottomMargin = 32;
      const availableHeight = viewportHeight - rect.top - bottomMargin;
      // Minimum height of 300px
      const newHeight = Math.max(300, availableHeight);
      setContainerHeight(newHeight);
    };
    
    // Use requestAnimationFrame for initial calculation to ensure layout is complete
    const rafId = requestAnimationFrame(() => {
      calculateHeight();
    });
    
    // Recalculate on resize
    window.addEventListener("resize", calculateHeight);
    
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", calculateHeight);
    };
  }, []);
  
  // Get color style for rank - uses inset box-shadow to overlay color on top of solid bg-card
  const getRankStyle = useCallback((rank: Rank | null): React.CSSProperties => {
    const color = rankColors[rank || ""];
    if (!color) return {};
    return {
      // Use inset box-shadow for color overlay so bg-card stays solid underneath
      boxShadow: `inset 0 0 0 100px ${color}30`,
      borderColor: color,
    };
  }, [rankColors]);
  
  const hasCustomColor = useCallback((rank: Rank | null): boolean => {
    return Boolean(rankColors[rank || ""]);
  }, [rankColors]);

  const resetView = useCallback(() => {
    setZoom(1);
    if (!containerRef.current || !tree) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const rootPos = positioned.get(tree.data.id);

    if (rootPos) {
      setPan({
        x: containerWidth / 2 - rootPos.x,
        y: Math.max(24, containerHeight * 0.15),
      });
      return;
    }

    setPan({
      x: (containerWidth - totalWidth) / 2,
      y: (containerHeight - totalHeight) / 2,
    });
  }, [tree, positioned, totalWidth, totalHeight]);
  
  if (!tree) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        No supervision hierarchy to display.
      </div>
    );
  }
  
  const { cardWidth, juniorStackHeight, cardHeight } = LAYOUT_CONFIG;
  const isRankFilterActive = visibleRanks.size > 0;
  const layoutTransition =
    filterMode === "collapse" && isRankFilterActive
      ? "left 200ms ease-out, top 200ms ease-out, opacity 150ms ease-in-out"
      : "opacity 150ms ease-in-out";

  const getCursorClass = () => {
    if (isDragging) return "cursor-grabbing";
    if (isSpaceHeld) return "cursor-grab";
    return "cursor-default";
  };
  
  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-2">
      {/* Quick filter buttons and zoom controls */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Rank filter buttons - toggle visibility of each rank */}
        <div className="flex items-center gap-1 flex-wrap ">
          {/* Filter mode toggle */}
          <button
            onClick={() => setFilterMode(prev => prev === "fade" ? "collapse" : "fade")}
            className={cn(
              "px-2 py-1 text-xs rounded-md border transition-colors mr-2",
              "bg-muted/50 border-border hover:bg-muted"
            )}
            aria-label={`Switch to ${filterMode === "fade" ? "collapse" : "fade"} mode`}
            title={filterMode === "fade" 
              ? "Fade mode: Hidden ranks stay in place but faded. Click to switch to Collapse mode." 
              : "Collapse mode: Hidden ranks removed from tree. Click to switch to Fade mode."}
          >
            {filterMode === "fade" ? "Fade" : "Collapse"}
          </button>
          <span className="text-xs text-muted-foreground mr-1">Show:</span>
          <button
            onClick={showAllRanks}
            className={cn(
              "px-2 py-1 text-xs rounded-md border transition-colors",
              visibleRanks.size === 0
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            )}
            aria-label="Show all ranks"
          >
            All
          </button>
          {/* NCO rank filters */}
          {[...NCO_FILTER_RANKS].reverse().map((rank) => (
            <button
              key={rank}
              onClick={() => toggleRankVisibility(rank)}
              className={cn(
                "px-2 py-1 text-xs rounded-md border transition-colors",
                visibleRanks.has(rank)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              )}
              aria-label={`Toggle ${rank} visibility`}
              title={`Toggle ${rank} visibility`}
            >
              {rank}
            </button>
          ))}
          {/* Separator */}
          <span className="text-muted-foreground/50 mx-1">|</span>
          {/* Junior enlisted rank filters */}
          {[...JUNIOR_FILTER_RANKS].reverse().map((rank) => (
            <button
              key={rank}
              onClick={() => toggleRankVisibility(rank)}
              className={cn(
                "px-2 py-1 text-xs rounded-md border transition-colors",
                visibleRanks.has(rank)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              )}
              aria-label={`Toggle ${rank} visibility`}
              title={`Toggle ${rank} visibility`}
            >
              {rank}
            </button>
          ))}
        </div>
        
       
      </div>
      
      <div
        ref={containerRef}
        className={cn(
          "relative w-full overflow-hidden border border-border/50 rounded-md bg-muted/20 select-none touch-none",
          getCursorClass()
        )}
        style={{
          height: containerHeight ?? 400,
          minHeight: 300,
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => { isMouseOverContainer.current = true; }}
        onMouseLeave={() => { isMouseOverContainer.current = false; }}
        tabIndex={0}
        aria-label="Supervision tree canvas. Hold Space and drag to pan, scroll to move, Ctrl or Cmd scroll to zoom."
      >
        {/* Zoom controls — fixed to viewport, not panned */}
        <div className="pointer-events-auto absolute top-2 right-2 z-50 flex items-center gap-2 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-sm text-muted-foreground backdrop-blur-sm">
          <span>{Math.round(zoom * 100)}%</span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.max(MIN_ZOOM, prev - 0.1))}
              className="px-1 transition-colors hover:text-foreground"
              aria-label="Zoom out"
            >
              <LuCircleMinus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="px-1 transition-colors hover:text-foreground"
              aria-label="Reset zoom and center view"
            >
              -
            </button>
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.min(MAX_ZOOM, prev + 0.1))}
              className="px-1 transition-colors hover:text-foreground"
              aria-label="Zoom in"
            >
              <LuCirclePlus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <p className="pointer-events-none absolute bottom-2 left-2 z-50 text-[10px] text-muted-foreground/80 sm:text-xs">
          Space + drag to pan · Scroll to move · ⌘/Ctrl + scroll to zoom
        </p>

        {/* Canvas layer — pan + zoom transform */}
        <div
          className="absolute top-0 left-0"
          style={{
            width: totalWidth,
            height: totalHeight,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: isDragging ? "none" : "transform 150ms ease-out",
          }}
        >
        {/* SVG for connecting lines - z-index 0 to stay behind cards */}
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none z-0"
          style={{ width: totalWidth, height: totalHeight }}
          aria-hidden="true"
        >
          {/* Draw lines between parent and children */}
          {Array.from(positioned.values()).map((member) => {
            if (isHiddenByCollapse(member.id, members, collapsedNodes)) return null;

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
            
            let pathD: string;
            
            // Same-rank children get horizontal lines (left to right in same row)
            if (member.isSameRankAsParent) {
              const startX = parent.x + cardWidth / 2 + 2;
              const startY = parentRow.y + parentStackOffset;
              const endX = member.x - cardWidth / 2 - 2;
              const endY = childRow.y + childStackOffset;
              pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
            } else {
              // Regular vertical line from parent bottom to child top
              const startX = parent.x;
              const startY = parentRow.y + parentStackOffset + cardHeight / 2 + 2;
              const endX = member.x;
              const endY = childRow.y + childStackOffset - cardHeight / 2 - 2;
              
              // If same x position (stacked column), draw straight line
              // Otherwise draw Manhattan-style routed line with shorter middle segment
              const isSameColumn = Math.abs(startX - endX) < 5;
              const midY = startY + (endY - startY) * 0.5;
              pathD = isSameColumn
                ? `M ${startX} ${startY} L ${endX} ${endY}`
                : `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
            }
            
            return (
              <path
                key={`line-${parent.id}-${member.id}`}
                d={pathD}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-muted-foreground opacity-40"
                style={{
                  transition:
                    filterMode === "collapse" && isRankFilterActive
                      ? "d 200ms ease-out, opacity 150ms ease-in-out"
                      : "opacity 150ms ease-in-out",
                }}
              />
            );
          })}
        </svg>
        
        {/* Render tier rows - z-index 10 to stay above connecting lines */}
        {tierRows.map((row) => (
          <div
            key={row.tier}
            className="absolute left-0 right-0 z-10"
            style={{
              top: row.y - cardHeight / 2,
              height: row.height,
              transition:
                filterMode === "collapse" && isRankFilterActive
                  ? "top 200ms ease-out, height 200ms ease-out"
                  : "none",
            }}
          >
            {/* Members in this row */}
            {row.members.map((member) => {
              const pos = positioned.get(member.id);
              if (!pos) return null;
              
              // Calculate vertical offset for stacked junior enlisted
              const stackOffset = member.stackIndex !== undefined 
                ? member.stackIndex * juniorStackHeight 
                : 0;
              
              // Check if this member has children (can be collapsed)
              const originalChildCount = childrenCountMap.get(member.id) || 0;
              const hasChildren = originalChildCount > 0;
              const isCollapsed = collapsedNodes.has(member.id);
              
              const isVisible = isRankVisible(member.rank);
              const hiddenByCollapse = isHiddenByCollapse(member.id, members, collapsedNodes);

              return (
                <div
                  key={member.id}
                  className="absolute z-10"
                  style={{
                    left: pos.x - cardWidth / 2,
                    top: stackOffset,
                    opacity: hiddenByCollapse ? 0 : isVisible ? 1 : 0.1,
                    visibility: hiddenByCollapse ? "hidden" : "visible",
                    transition: layoutTransition,
                    pointerEvents: isSpaceHeld || hiddenByCollapse || !isVisible ? "none" : "auto",
                  }}
                >
                  <button
                    className={cn(
                      "flex flex-col items-center justify-center",
                      "px-1.5 py-1 rounded-md border-2 bg-card shadow-sm",
                      "transition-all duration-200 hover:shadow-md hover:scale-105",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                      "text-center",
                      !hasCustomColor(member.rank) && "border-border",
                      member.isCurrentUser && "ring-2 ring-primary ring-offset-1",
                      member.isPlaceholder && "opacity-80"
                    )}
                    style={{
                      width: cardWidth,
                      height: cardHeight,
                      ...getRankStyle(member.rank),
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Don't trigger click if spacebar is held (drag mode)
                      if (isSpaceHeld) return;
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
                  
                  {/* Collapse/expand toggle for members with children (not for junior enlisted) */}
                  {hasChildren && !isJuniorEnlisted(member.rank) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Don't trigger click if spacebar is held (drag mode)
                        if (isSpaceHeld) return;
                        toggleCollapse(member.id);
                      }}
                      className={cn(
                        "absolute left-1/2 -translate-x-1/2 -bottom-3",
                        "w-5 h-5 rounded-full bg-card border border-border shadow-sm",
                        "flex items-center justify-center",
                        "hover:bg-muted hover:scale-110 transition-all duration-200",
                        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                        "z-20"
                      )}
                      aria-label={isCollapsed ? `Expand ${originalChildCount} subordinates` : `Collapse subordinates`}
                      title={isCollapsed ? `Expand ${originalChildCount} subordinates` : `Collapse subordinates`}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

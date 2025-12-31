"use client";

import { useState, useEffect, useRef } from "react";
import type { FeedAccomplishment } from "@/stores/team-feed-store";
import { useUserStore } from "@/stores/user-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  Calendar,
  Briefcase,
  Building,
  Target,
  BarChart3,
  Tag,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Pencil,
  MessageSquare,
  Send,
  Check,
  X,
  Loader2,
  CheckCircle2,
  Clock,
  Lock,
  Eye,
} from "lucide-react";
import { ENTRY_MGAS, DEFAULT_ACTION_VERBS } from "@/lib/constants";
import { ChainOfCommandDisplay } from "./chain-of-command-display";
import { updateAccomplishment } from "@/app/actions/accomplishments";
import {
  getAccomplishmentComments,
  createAccomplishmentComment,
  resolveAccomplishmentComment,
  deleteAccomplishmentComment,
  getAccomplishmentChainMembers,
} from "@/app/actions/accomplishment-comments";
import type { AccomplishmentCommentWithAuthor, ChainMember } from "@/types/database";

interface AccomplishmentDetailDialogProps {
  accomplishment: FeedAccomplishment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccomplishmentUpdated?: (id: string, updates: Partial<FeedAccomplishment>) => void;
}

export function AccomplishmentDetailDialog({
  accomplishment,
  open,
  onOpenChange,
  onAccomplishmentUpdated,
}: AccomplishmentDetailDialogProps) {
  const { profile } = useUserStore();
  const [showChain, setShowChain] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Comments state
  const [comments, setComments] = useState<AccomplishmentCommentWithAuthor[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  
  // Visibility selection state (for private comments)
  const [chainMembers, setChainMembers] = useState<ChainMember[]>([]);
  const [isLoadingChainMembers, setIsLoadingChainMembers] = useState(false);
  const [selectedVisibleTo, setSelectedVisibleTo] = useState<string[]>([]);
  const [showVisibilitySelect, setShowVisibilitySelect] = useState(false);
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    date: "",
    action_verb: "",
    details: "",
    impact: "",
    metrics: "",
    mpa: "",
    tags: "",
  });

  // Check if current user is in the chain of supervision
  const isInChain = accomplishment?.supervisor_chain?.some(
    (member) => member.id === profile?.id
  ) ?? false;

  // Load comments and chain members when dialog opens
  useEffect(() => {
    if (open && accomplishment) {
      loadComments();
      loadChainMembers();
      // Reset visibility selection
      setSelectedVisibleTo([]);
      setShowVisibilitySelect(false);
    }
  }, [open, accomplishment?.id]);

  // Reset edit state when accomplishment changes
  useEffect(() => {
    if (accomplishment) {
      setEditForm({
        date: accomplishment.date,
        action_verb: accomplishment.action_verb,
        details: accomplishment.details,
        impact: accomplishment.impact,
        metrics: accomplishment.metrics || "",
        mpa: accomplishment.mpa,
        tags: Array.isArray(accomplishment.tags) ? accomplishment.tags.join(", ") : "",
      });
    }
    setIsEditing(false);
  }, [accomplishment]);

  async function loadComments() {
    if (!accomplishment) return;
    setIsLoadingComments(true);
    const result = await getAccomplishmentComments(accomplishment.id);
    if (result.data) {
      setComments(result.data);
    }
    setIsLoadingComments(false);
  }

  async function loadChainMembers() {
    if (!accomplishment) return;
    setIsLoadingChainMembers(true);
    const result = await getAccomplishmentChainMembers(accomplishment.id);
    if (result.data) {
      setChainMembers(result.data);
    }
    setIsLoadingChainMembers(false);
  }

  async function handleSubmitEdit() {
    if (!accomplishment) return;
    
    setIsSubmitting(true);
    const tags = editForm.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const result = await updateAccomplishment(accomplishment.id, {
      date: editForm.date,
      action_verb: editForm.action_verb,
      details: editForm.details,
      impact: editForm.impact,
      metrics: editForm.metrics || null,
      mpa: editForm.mpa,
      tags,
    });

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Accomplishment updated");
      setIsEditing(false);
      onAccomplishmentUpdated?.(accomplishment.id, {
        ...editForm,
        metrics: editForm.metrics || null,
        tags,
      });
    }
    setIsSubmitting(false);
  }

  async function handleSubmitComment() {
    if (!accomplishment || !newComment.trim()) return;

    setIsSubmittingComment(true);
    const visibleTo = selectedVisibleTo.length > 0 ? selectedVisibleTo : null;
    const result = await createAccomplishmentComment(accomplishment.id, newComment.trim(), visibleTo);
    
    if (result.error) {
      toast.error(result.error);
    } else {
      setNewComment("");
      setSelectedVisibleTo([]);
      setShowVisibilitySelect(false);
      await loadComments();
      setTimeout(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
      toast.success(visibleTo ? "Private comment sent" : "Comment added");
    }
    setIsSubmittingComment(false);
  }

  // Toggle a user in the visibility list
  function toggleVisibility(userId: string) {
    setSelectedVisibleTo((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  async function handleResolveComment(commentId: string, isResolved: boolean) {
    const result = await resolveAccomplishmentComment(commentId, isResolved);
    if (result.error) {
      toast.error(result.error);
    } else {
      await loadComments();
      toast.success(isResolved ? "Marked as resolved" : "Reopened");
    }
  }

  async function handleDeleteComment(commentId: string) {
    const result = await deleteAccomplishmentComment(commentId);
    if (result.error) {
      toast.error(result.error);
    } else {
      await loadComments();
      toast.success("Comment deleted");
    }
  }

  if (!accomplishment) return null;

  const mpaLabel =
    ENTRY_MGAS.find((m) => m.key === accomplishment.mpa)?.label ||
    accomplishment.mpa;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  };

  const unresolvedCount = comments.filter((c) => !c.is_resolved).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header - Fixed at top */}
        <div className="shrink-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-4 py-3 sm:px-6 sm:py-4">
          <DialogHeader className="text-left space-y-0">
            {/* Mobile: Stack vertically */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="size-10 sm:size-12 rounded-full bg-primary/20 flex items-center justify-center text-base sm:text-lg font-semibold text-primary shrink-0">
                  {accomplishment.author_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-base sm:text-lg break-words">
                    {accomplishment.author_rank && (
                      <span className="text-muted-foreground">
                        {accomplishment.author_rank}{" "}
                      </span>
                    )}
                    {accomplishment.author_name}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm mt-0.5">
                    {accomplishment.author_afsc && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="size-3" />
                        {accomplishment.author_afsc}
                      </span>
                    )}
                    {accomplishment.author_unit && (
                      <span className="flex items-center gap-1 truncate max-w-[150px] sm:max-w-none">
                        <Building className="size-3 shrink-0" />
                        <span className="truncate">{accomplishment.author_unit}</span>
                      </span>
                    )}
                  </DialogDescription>
                </div>
              </div>
              {/* Actions row */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs shrink-0">
                  {mpaLabel}
                </Badge>
                {isInChain && !isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="h-7 px-2 text-xs shrink-0"
                  >
                    <Pencil className="size-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6 space-y-5">
            {isEditing ? (
              // Edit Form
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-date" className="text-sm">Date</Label>
                    <Input
                      id="edit-date"
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-mpa" className="text-sm">Major Performance Area</Label>
                    <Select
                      value={editForm.mpa}
                      onValueChange={(value) => setEditForm({ ...editForm, mpa: value })}
                    >
                      <SelectTrigger id="edit-mpa" className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTRY_MGAS.map((mpa) => (
                          <SelectItem key={mpa.key} value={mpa.key}>
                            {mpa.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-action" className="text-sm">Action Verb</Label>
                    <Select
                      value={editForm.action_verb}
                      onValueChange={(value) => setEditForm({ ...editForm, action_verb: value })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select verb" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEFAULT_ACTION_VERBS.map((verb) => (
                          <SelectItem key={verb} value={verb}>
                            {verb}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-details" className="text-sm">Details</Label>
                    <Textarea
                      id="edit-details"
                      value={editForm.details}
                      onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
                      className="min-h-[100px] text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-impact" className="text-sm">Impact</Label>
                    <Textarea
                      id="edit-impact"
                      value={editForm.impact}
                      onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
                      className="min-h-[100px] text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-metrics" className="text-sm">Metrics</Label>
                    <Input
                      id="edit-metrics"
                      value={editForm.metrics}
                      onChange={(e) => setEditForm({ ...editForm, metrics: e.target.value })}
                      placeholder="e.g., 15% increase, 200 hours saved"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-tags" className="text-sm">Tags (comma separated)</Label>
                    <Input
                      id="edit-tags"
                      value={editForm.tags}
                      onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                      placeholder="e.g., leadership, training"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(false)}
                    disabled={isSubmitting}
                    className="h-9"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSubmitEdit} disabled={isSubmitting} className="h-9">
                    {isSubmitting ? (
                      <>
                        <Loader2 className="size-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              // View Mode
              <>
                {/* Date and action */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="size-3.5" />
                    <span>{formatDate(accomplishment.date)}</span>
                  </div>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="text-muted-foreground">
                    {formatTimeAgo(accomplishment.created_at)}
                  </span>
                  <span className="text-muted-foreground/40">•</span>
                  <Badge variant="secondary" className="font-medium text-xs">
                    {accomplishment.action_verb}
                  </Badge>
                </div>

                {/* Details and Impact - 2 column on larger screens */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Details */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Target className="size-4 text-primary shrink-0" />
                      What They Did
                    </h4>
                    <p className="text-sm leading-relaxed break-words">
                      {accomplishment.details}
                    </p>
                  </div>

                  {/* Impact */}
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="size-4 text-emerald-500 shrink-0" />
                      Impact & Results
                    </h4>
                    <p className="text-sm leading-relaxed break-words">
                      {accomplishment.impact}
                    </p>
                  </div>
                </div>

                {/* Metrics and Tags row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Metrics */}
                  {accomplishment.metrics && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <BarChart3 className="size-4 text-blue-500 shrink-0" />
                        Metrics
                      </h4>
                      <p className="text-sm leading-relaxed font-mono text-blue-600 dark:text-blue-400 break-all">
                        {accomplishment.metrics}
                      </p>
                    </div>
                  )}

                  {/* Tags */}
                  {accomplishment.tags && accomplishment.tags.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Tag className="size-4 text-orange-500 shrink-0" />
                        Tags
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {accomplishment.tags.map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Chain of Command - Collapsed by default */}
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between hover:bg-muted/50 h-9 px-2"
                onClick={() => setShowChain(!showChain)}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <GitBranch className="size-4 text-violet-500" />
                  Chain of Command
                </span>
                {showChain ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>

              {showChain && (
                <ChainOfCommandDisplay
                  accomplishment={accomplishment}
                  className="mt-2"
                />
              )}
            </div>

            {/* Comments Section - Only visible to chain of supervision */}
            {isInChain && (
              <>
                <Separator />
                
                <div className="space-y-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between hover:bg-muted/50 h-9 px-2"
                    onClick={() => setShowComments(!showComments)}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquare className="size-4 text-primary" />
                      Supervision Comments
                      {unresolvedCount > 0 && (
                        <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">
                          {unresolvedCount} open
                        </Badge>
                      )}
                    </span>
                    {showComments ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </Button>

                  {showComments && (
                    <div className="space-y-3">
                      {/* Comments List - Scrollable */}
                      {isLoadingComments ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : comments.length === 0 ? (
                        <div className="text-center py-4 text-sm text-muted-foreground">
                          <MessageSquare className="size-6 mx-auto mb-2 opacity-50" />
                          <p className="text-xs">No comments yet</p>
                        </div>
                      ) : (
                        <div className="max-h-[200px] sm:max-h-[250px] overflow-y-auto space-y-2 pr-1">
                          {comments.map((comment) => (
                            <CommentItem
                              key={comment.id}
                              comment={comment}
                              currentUserId={profile?.id}
                              onResolve={handleResolveComment}
                              onDelete={handleDeleteComment}
                            />
                          ))}
                          <div ref={commentsEndRef} />
                        </div>
                      )}

                      {/* New Comment Form */}
                      <div className="space-y-2">
                        {/* Visibility Toggle */}
                        <div className="space-y-2">
                          <Button
                            type="button"
                            variant={showVisibilitySelect ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => {
                              setShowVisibilitySelect(!showVisibilitySelect);
                              if (showVisibilitySelect) {
                                setSelectedVisibleTo([]);
                              }
                            }}
                          >
                            {selectedVisibleTo.length === 0 ? (
                              <>
                                <Eye className="size-3" />
                                <span className="hidden sm:inline">Visible to Chain</span>
                                <span className="sm:hidden">Public</span>
                              </>
                            ) : (
                              <>
                                <Lock className="size-3" />
                                <span className="hidden sm:inline">
                                  Private ({selectedVisibleTo.length} selected)
                                </span>
                                <span className="sm:hidden">
                                  Private ({selectedVisibleTo.length})
                                </span>
                              </>
                            )}
                          </Button>
                          
                          {/* Visibility Toggle List */}
                          {showVisibilitySelect && (
                            <div className="rounded-lg border bg-muted/30 p-2">
                              <p className="text-xs text-muted-foreground px-1 pb-1">
                                Select who can see this comment:
                              </p>
                              {isLoadingChainMembers ? (
                                <div className="flex items-center gap-2 py-2 px-1 text-xs text-muted-foreground">
                                  <Loader2 className="size-3 animate-spin" />
                                  Loading...
                                </div>
                              ) : chainMembers.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2 px-1">
                                  No recipients available
                                </p>
                              ) : (
                                <div className="max-h-[150px] overflow-y-auto space-y-1">
                                  {chainMembers.map((member) => {
                                    const isSelected = selectedVisibleTo.includes(member.user_id);
                                    return (
                                      <button
                                        key={member.user_id}
                                        type="button"
                                        onClick={() => toggleVisibility(member.user_id)}
                                        className={`w-full flex items-center gap-2 p-2 rounded-md text-left text-xs transition-colors ${
                                          isSelected 
                                            ? "bg-primary/10 text-primary" 
                                            : "hover:bg-muted"
                                        }`}
                                      >
                                        <div className={`size-4 rounded border flex items-center justify-center shrink-0 ${
                                          isSelected 
                                            ? "bg-primary border-primary text-primary-foreground" 
                                            : "border-muted-foreground/30"
                                        }`}>
                                          {isSelected && <Check className="size-3" />}
                                        </div>
                                        <span className="flex-1">
                                          {member.rank ? `${member.rank} ` : ""}{member.full_name}
                                        </span>
                                        {member.is_owner && (
                                          <Badge variant="outline" className="h-4 text-[10px] px-1 shrink-0">
                                            Owner
                                          </Badge>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Comment Input */}
                        <div className="flex gap-2 items-start">
                          <div className="flex-1 min-w-0">
                            <Textarea
                              placeholder={selectedVisibleTo.length === 0 
                                ? "Add a comment..." 
                                : `Private message to ${selectedVisibleTo.length} selected...`
                              }
                              value={newComment}
                              onChange={(e) => setNewComment(e.target.value)}
                              className="min-h-[50px] text-sm resize-none"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault();
                                  handleSubmitComment();
                                }
                              }}
                            />
                          </div>
                          <Button
                            size="icon"
                            onClick={handleSubmitComment}
                            disabled={!newComment.trim() || isSubmittingComment}
                            className="shrink-0 size-9"
                          >
                            {isSubmittingComment ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Send className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Comment Item Component
interface CommentItemProps {
  comment: AccomplishmentCommentWithAuthor;
  currentUserId?: string;
  onResolve: (id: string, isResolved: boolean) => void;
  onDelete: (id: string) => void;
}

function CommentItem({ comment, currentUserId, onResolve, onDelete }: CommentItemProps) {
  const isAuthor = comment.author_id === currentUserId;
  const isPrivate = comment.visible_to && comment.visible_to.length > 0;
  const isInVisibleTo = isPrivate && currentUserId && comment.visible_to?.includes(currentUserId);
  
  const formatCommentDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div
      className={`group rounded-lg border p-2.5 sm:p-3 transition-colors ${
        isPrivate 
          ? "bg-primary/5 border-primary/20" 
          : comment.is_resolved
            ? "bg-muted/30 border-muted"
            : "bg-card border-border"
      }`}
    >
      <div className="flex items-start gap-2 sm:gap-3">
        {/* Avatar */}
        <div className={`size-7 sm:size-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
          isPrivate ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"
        }`}>
          {(comment.author_name || "?")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
              <span className="text-xs sm:text-sm font-medium truncate">
                {comment.author_rank && (
                  <span className="text-muted-foreground">{comment.author_rank} </span>
                )}
                {comment.author_name}
              </span>
              {isPrivate && (
                <Badge variant="secondary" className="text-xs gap-1 h-5 px-1.5 bg-primary/10 text-primary border-primary/20">
                  <Lock className="size-3" />
                  <span className="hidden sm:inline">
                    {isAuthor 
                      ? `To ${comment.visible_to_names.slice(0, 2).join(", ")}${comment.visible_to_names.length > 2 ? ` +${comment.visible_to_names.length - 2}` : ""}`
                      : isInVisibleTo 
                        ? "Private to you" 
                        : "Private"
                    }
                  </span>
                </Badge>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                <Clock className="size-3" />
                {formatCommentDate(comment.created_at)}
              </span>
              {comment.is_resolved && (
                <Badge variant="outline" className="text-xs gap-1 text-muted-foreground h-5 px-1">
                  <CheckCircle2 className="size-3" />
                  <span className="hidden sm:inline">Resolved</span>
                </Badge>
              )}
            </div>
            {/* Actions - Always visible on mobile for touch */}
            <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="size-6 sm:size-7"
                onClick={() => onResolve(comment.id, !comment.is_resolved)}
                title={comment.is_resolved ? "Reopen" : "Mark as resolved"}
              >
                {comment.is_resolved ? (
                  <X className="size-3" />
                ) : (
                  <Check className="size-3" />
                )}
              </Button>
              {isAuthor && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 sm:size-7 text-destructive hover:text-destructive"
                  onClick={() => onDelete(comment.id)}
                  title="Delete comment"
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>
          </div>
          <p
            className={`text-xs sm:text-sm mt-1 break-words ${
              comment.is_resolved ? "text-muted-foreground" : ""
            }`}
          >
            {comment.comment_text}
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Loader2,
  Tag,
  RotateCcw,
  Settings2,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import type { UserAwardCategory } from "@/types/database";

interface AwardCategoriesManagerProps {
  userId: string;
  categories: UserAwardCategory[];
  onCategoriesChange: (categories: UserAwardCategory[]) => void;
  selectedCategoryKey: string;
  onSelectCategory: (categoryKey: string) => void;
}

export function AwardCategoriesManager({
  userId,
  categories,
  onCategoriesChange,
  selectedCategoryKey,
  onSelectCategory,
}: AwardCategoriesManagerProps) {
  const supabase = createClient();

  // UI State
  const [isExpanded, setIsExpanded] = useState(false);

  // Add/Edit dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<UserAwardCategory | null>(null);
  const [formLabel, setFormLabel] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation state
  const [deletingCategory, setDeletingCategory] = useState<UserAwardCategory | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset defaults dialog
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Generate a unique category key from label
  const generateCategoryKey = useCallback((label: string): string => {
    const baseKey = label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 30);

    // Check if key already exists
    const existingKeys = new Set(categories.map((c) => c.category_key));
    if (!existingKeys.has(baseKey)) return baseKey;

    // Append number if exists
    let counter = 2;
    while (existingKeys.has(`${baseKey}_${counter}`)) {
      counter++;
    }
    return `${baseKey}_${counter}`;
  }, [categories]);

  // Handle add category
  const handleAddCategory = async () => {
    if (!formLabel.trim()) {
      toast.error("Please enter a category label");
      return;
    }

    setIsSaving(true);
    try {
      const categoryKey = generateCategoryKey(formLabel);
      const maxOrder = Math.max(0, ...categories.map((c) => c.display_order));

      const insertData = {
        user_id: userId,
        category_key: categoryKey,
        label: formLabel.trim(),
        description: formDescription.trim() || null,
        is_default: false,
        display_order: maxOrder + 1,
      };
      const { data, error } = await supabase
        .from("user_award_categories")
        // @ts-ignore - Table types not yet regenerated in supabase types
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      const newCategories = [...categories, data as UserAwardCategory];
      onCategoriesChange(newCategories);
      toast.success("Category added");
      handleCloseDialog();
    } catch (error) {
      console.error("Error adding category:", error);
      toast.error("Failed to add category");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle edit category
  const handleEditCategory = async () => {
    if (!editingCategory || !formLabel.trim()) {
      toast.error("Please enter a category label");
      return;
    }

    setIsSaving(true);
    try {
      const updateData = {
        label: formLabel.trim(),
        description: formDescription.trim() || null,
      };
      const { error } = await supabase
        .from("user_award_categories")
        // @ts-ignore - Table types not yet regenerated in supabase types
        .update(updateData)
        .eq("id", editingCategory.id);

      if (error) throw error;

      const updatedCategories = categories.map((c) =>
        c.id === editingCategory.id
          ? { ...c, label: formLabel.trim(), description: formDescription.trim() || null }
          : c
      );
      onCategoriesChange(updatedCategories);
      toast.success("Category updated");
      handleCloseDialog();
    } catch (error) {
      console.error("Error updating category:", error);
      toast.error("Failed to update category");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete category
  const handleDeleteCategory = async () => {
    if (!deletingCategory) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("user_award_categories")
        .delete()
        .eq("id", deletingCategory.id);

      if (error) throw error;

      const updatedCategories = categories.filter((c) => c.id !== deletingCategory.id);
      onCategoriesChange(updatedCategories);

      // If we deleted the selected category, select the first available
      if (selectedCategoryKey === deletingCategory.category_key && updatedCategories.length > 0) {
        onSelectCategory(updatedCategories[0].category_key);
      }

      toast.success("Category deleted");
      setDeletingCategory(null);
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle reset to defaults
  const handleResetDefaults = async () => {
    setIsResetting(true);
    try {
      // Delete all existing categories for this user
      const { error: deleteError } = await supabase
        .from("user_award_categories")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      // Re-initialize with defaults using the database function
      const { data, error } = await supabase.rpc("initialize_user_award_categories", 
        // @ts-ignore - RPC function types not yet regenerated in supabase types
        { p_user_id: userId }
      );

      if (error) throw error;

      const categories = data as unknown as UserAwardCategory[];
      onCategoriesChange(categories);

      // Select first category if current selection no longer exists
      if (categories && categories.length > 0) {
        const newKeys = new Set(categories.map((c) => c.category_key));
        if (!newKeys.has(selectedCategoryKey)) {
          onSelectCategory(categories[0].category_key);
        }
      }

      toast.success("Categories reset to defaults");
      setShowResetDialog(false);
    } catch (error) {
      console.error("Error resetting categories:", error);
      toast.error("Failed to reset categories");
    } finally {
      setIsResetting(false);
    }
  };

  // Close add/edit dialog
  const handleCloseDialog = () => {
    setShowAddDialog(false);
    setEditingCategory(null);
    setFormLabel("");
    setFormDescription("");
  };

  // Open edit dialog
  const openEditDialog = (category: UserAwardCategory) => {
    setEditingCategory(category);
    setFormLabel(category.label);
    setFormDescription(category.description || "");
    setShowAddDialog(true);
  };

  // Open add dialog
  const openAddDialog = () => {
    setEditingCategory(null);
    setFormLabel("");
    setFormDescription("");
    setShowAddDialog(true);
  };

  return (
    <div className="space-y-2">
      {/* Category Selection with Manage Toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">Award Category</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
          aria-label={isExpanded ? "Collapse category manager" : "Expand category manager"}
        >
          <Settings2 className="size-3" />
          Manage
          {isExpanded ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </Button>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelectCategory(category.category_key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedCategoryKey === category.category_key
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground"
            )}
            aria-label={`Select ${category.label} category`}
            aria-pressed={selectedCategoryKey === category.category_key}
          >
            {category.label}
          </button>
        ))}

        {categories.length === 0 && (
          <span className="text-xs text-muted-foreground py-1.5">
            No categories available
          </span>
        )}
      </div>

      {/* Expanded Management Section */}
      {isExpanded && (
        <div className="mt-3 p-3 rounded-lg border bg-muted/30 animate-in slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tag className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Manage Categories</span>
              <Badge variant="secondary" className="text-[10px]">
                {categories.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowResetDialog(true)}
                    className="h-7 px-2 text-xs"
                  >
                    <RotateCcw className="size-3 mr-1" />
                    Reset
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset to default categories</TooltipContent>
              </Tooltip>
              <Button
                variant="default"
                size="sm"
                onClick={openAddDialog}
                className="h-7 px-2 text-xs"
              >
                <Plus className="size-3 mr-1" />
                Add
              </Button>
            </div>
          </div>

          {/* Categories List */}
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {categories.map((category) => (
              <div
                key={category.id}
                className={cn(
                  "flex items-center justify-between p-2 rounded-md group transition-colors",
                  "hover:bg-muted"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GripVertical className="size-3.5 text-muted-foreground/50 cursor-grab shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">
                        {category.label}
                      </span>
                      {category.is_default && (
                        <Badge variant="outline" className="text-[9px] py-0 shrink-0">
                          Default
                        </Badge>
                      )}
                    </div>
                    {category.description && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {category.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(category)}
                        className="h-6 w-6 p-0"
                        aria-label={`Edit ${category.label}`}
                      >
                        <Pencil className="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingCategory(category)}
                        className="h-6 w-6 p-0 hover:text-destructive"
                        aria-label={`Delete ${category.label}`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            ))}

            {categories.length === 0 && (
              <div className="text-center py-6">
                <Tag className="size-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mb-2">
                  No categories yet
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResetDialog(true)}
                  className="text-xs"
                >
                  <RotateCcw className="size-3 mr-1" />
                  Load Defaults
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="size-5" />
              {editingCategory ? "Edit Category" : "Add Category"}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? "Update the category label and description."
                : "Create a new award category for your packages."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-label">Label *</Label>
              <Input
                id="category-label"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="e.g., First Sergeant, Innovator"
                maxLength={50}
                aria-required="true"
              />
              <p className="text-[10px] text-muted-foreground">
                This will be displayed in the category selector
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <Input
                id="category-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional description"
                maxLength={100}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button
              onClick={editingCategory ? handleEditCategory : handleAddCategory}
              disabled={isSaving || !formLabel.trim()}
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : editingCategory ? (
                <Check className="size-4 mr-1.5" />
              ) : (
                <Plus className="size-4 mr-1.5" />
              )}
              {editingCategory ? "Save" : "Add Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingCategory} onOpenChange={(open) => !open && setDeletingCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deletingCategory?.label}&rdquo;?
              This action cannot be undone.
              {deletingCategory?.is_default && (
                <span className="block mt-2 text-amber-600">
                  Note: This is a default category. You can restore it by clicking &ldquo;Reset to Defaults&rdquo;.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategory}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="size-4 mr-1.5" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Confirmation */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default Categories</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all your custom categories and restore the default set.
              Any award packages using custom categories will keep their category values,
              but the category may not appear in the selector.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetDefaults}
              disabled={isResetting}
            >
              {isResetting ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <RotateCcw className="size-4 mr-1.5" />
              )}
              Reset to Defaults
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FolderKanban,
  Users,
  Target,
  TrendingUp,
  Sparkles,
  LinkIcon,
  Crown,
  UserPlus,
  FileText,
  CheckCircle2,
} from "lucide-react";

const STORAGE_KEY = "projects-info-seen";

interface ProjectsInfoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectsInfoModal({ open, onOpenChange }: ProjectsInfoModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <FolderKanban className="size-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Introducing Projects</DialogTitle>
              <DialogDescription>
                Streamline your EPB statements with shared context
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* What are Projects */}
          <section>
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
              <FolderKanban className="size-4 text-primary" />
              What are Projects?
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Projects allow you to group related accomplishments under a shared context. 
              When you and your team work on a major initiative, you can create a project 
              to capture the overall <strong>results</strong>, <strong>impact</strong>, and 
              <strong> key stakeholders</strong> once — then everyone on the project can 
              leverage this information in their EPB statements.
            </p>
          </section>

          {/* Key Features */}
          <section>
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <Sparkles className="size-4 text-amber-500" />
              Key Features
            </h3>
            <div className="grid gap-3">
              <FeatureCard
                icon={<Target className="size-4 text-green-600" />}
                title="Shared Results & Impact"
                description="Define the project's results and impact once. When members generate EPB statements from linked accomplishments, this context is automatically included to create stronger, more detailed statements."
              />
              <FeatureCard
                icon={<Users className="size-4 text-blue-600" />}
                title="Team Collaboration"
                description="Add anyone from your chain of command to a project. All assigned members can see project details and link their accomplishments to benefit from the shared context."
              />
              <FeatureCard
                icon={<Crown className="size-4 text-amber-500" />}
                title="Flexible Ownership"
                description="Project creators become owners who can edit metadata and manage members. Ownership can be shared with others for collaborative management."
              />
              <FeatureCard
                icon={<LinkIcon className="size-4 text-purple-600" />}
                title="Link Accomplishments"
                description="In the Entries page, you can associate any accomplishment with a project you're assigned to. This links your individual contribution to the broader project outcomes."
              />
            </div>
          </section>

          {/* How it Works */}
          <section>
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
              <FileText className="size-4 text-primary" />
              How it Enhances Your EPB Statements
            </h3>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex gap-3">
                <Badge variant="outline" className="shrink-0 h-6">1</Badge>
                <p className="text-sm">
                  <strong>Create a project</strong> for a major initiative (e.g., "Unit Inspection Prep", 
                  "New Training Program", "System Migration")
                </p>
              </div>
              <div className="flex gap-3">
                <Badge variant="outline" className="shrink-0 h-6">2</Badge>
                <p className="text-sm">
                  <strong>Add project metadata</strong> like results ("achieved 98% compliance"), 
                  impact ("reduced processing time by 40%"), and key stakeholders
                </p>
              </div>
              <div className="flex gap-3">
                <Badge variant="outline" className="shrink-0 h-6">3</Badge>
                <p className="text-sm">
                  <strong>Assign team members</strong> who contributed to the project from your 
                  supervision chain
                </p>
              </div>
              <div className="flex gap-3">
                <Badge variant="outline" className="shrink-0 h-6">4</Badge>
                <p className="text-sm">
                  <strong>Link accomplishments</strong> — each member links their entries to the 
                  project in the Entries page
                </p>
              </div>
              <div className="flex gap-3">
                <Badge variant="outline" className="shrink-0 h-6">5</Badge>
                <p className="text-sm">
                  <strong>Generate enhanced statements</strong> — when generating EPB statements, 
                  the AI incorporates project context to craft statements that connect individual 
                  contributions to the larger outcomes
                </p>
              </div>
            </div>
          </section>

          {/* Supervisor Benefit */}
          <section className="bg-amber-500/10 rounded-lg p-4 border border-amber-500/20">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
              <Crown className="size-4 text-amber-600" />
              For Supervisors
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              When you generate EPB statements and have subordinates on the same project, 
              the AI understands your leadership role and frames your statements to reflect 
              that you <em>led</em>, <em>directed</em>, or <em>facilitated</em> the team's 
              accomplishments — automatically connecting your actions to the combined project 
              outcomes.
            </p>
          </section>

          {/* Quick Tips */}
          <section>
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
              <CheckCircle2 className="size-4 text-green-600" />
              Quick Tips
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Click on a project to highlight assigned members in the supervision tree
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Use "Assign Members" mode to quickly add people by clicking on them in the tree
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Add detailed results and impact for better AI-generated statements
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Include key stakeholders to add credibility and context to statements
              </li>
            </ul>
          </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Got it, let&apos;s go!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-card">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>
        <h4 className="font-medium text-sm">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// Hook to manage the one-time display logic
export function useProjectsInfoModal() {
  const [showModal, setShowModal] = useState(false);
  const [hasSeenInfo, setHasSeenInfo] = useState(true); // Default to true to prevent flash

  useEffect(() => {
    // Check localStorage on mount
    const seen = localStorage.getItem(STORAGE_KEY);
    setHasSeenInfo(seen === "true");
  }, []);

  const openModal = () => setShowModal(true);
  
  const closeModal = () => {
    setShowModal(false);
    // Mark as seen in localStorage
    localStorage.setItem(STORAGE_KEY, "true");
    setHasSeenInfo(true);
  };

  // Show on first open of projects panel
  const triggerFirstTimeModal = () => {
    if (!hasSeenInfo) {
      setShowModal(true);
    }
  };

  return {
    showModal,
    openModal,
    closeModal: () => closeModal(),
    onOpenChange: (open: boolean) => {
      if (!open) closeModal();
      else setShowModal(true);
    },
    hasSeenInfo,
    triggerFirstTimeModal,
  };
}

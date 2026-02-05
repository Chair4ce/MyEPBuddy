import { create } from "zustand";
import { persist } from "zustand/middleware";

// Tour types
export type TourId = 
  | "team-setup"        // First-time team setup tour
  | "add-subordinate"   // Adding a managed subordinate
  | "connect-supervisor" // Connecting to a supervisor
  | "epb-basics"        // EPB generation intro
  | "awards-basics"     // Awards intro
  | "decorations-basics" // Decorations intro
  | "settings-llm";     // LLM settings tour

export interface TourStep {
  id: string;
  target?: string;           // CSS selector for element to highlight
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
  action?: "click" | "navigate" | "open-sidebar" | "wait";
  actionTarget?: string;     // URL or selector for action
  autoAdvance?: "select" | "input" | "click" | "any"; // Auto-advance when user interacts
  showSkip?: boolean;
  showBack?: boolean;
  highlightPadding?: number;
}

interface OnboardingState {
  // Current tour state
  activeTour: TourId | null;
  currentStepIndex: number;
  isVisible: boolean;
  
  // Completed tours (persisted)
  completedTours: TourId[];
  
  // First-time user flags
  hasSeenWelcome: boolean;
  hasCreatedFirstTeamMember: boolean;
  hasConnectedSupervisor: boolean;
  
  // Tour actions
  startTour: (tourId: TourId) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  setStep: (index: number) => void;
  
  // State setters
  setHasSeenWelcome: (value: boolean) => void;
  setHasCreatedFirstTeamMember: (value: boolean) => void;
  setHasConnectedSupervisor: (value: boolean) => void;
  
  // Reset for testing
  resetOnboarding: () => void;
}

// Tour definitions with short, simple steps
export const TOUR_DEFINITIONS: Record<TourId, TourStep[]> = {
  "team-setup": [
    {
      id: "welcome",
      title: "Welcome to myEPBuddy!",
      content: "Let's get you set up with your team in under a minute.",
      placement: "center",
      showSkip: true,
    },
    {
      id: "open-sidebar",
      target: "[data-tour='sidebar-toggle']",
      title: "Navigation",
      content: "Your main menu is here. Let's go to the Team page.",
      placement: "right",
      action: "open-sidebar",
    },
    {
      id: "team-nav",
      target: "[data-tour='nav-team']",
      title: "My Team",
      content: "Click here to manage your team.",
      placement: "right",
      action: "navigate",
      actionTarget: "/team",
    },
    {
      id: "team-options",
      title: "Two Ways to Build Your Team",
      content: "Add subordinates you manage, or connect with your supervisor.",
      placement: "center",
    },
    {
      id: "add-subordinate",
      target: "[data-tour='add-member-btn']",
      title: "Add Managed Subordinate",
      content: "Create entries for someone who doesn't have an account yet.",
      placement: "bottom",
      showSkip: true,
    },
    {
      id: "connect-member",
      target: "[data-tour='send-request-btn']",
      title: "Connect to Existing Member",
      content: "Link with someone who already has an account.",
      placement: "bottom",
      showSkip: true,
    },
    {
      id: "complete",
      title: "You're All Set!",
      content: "Start building your team. We'll show more features as you go.",
      placement: "center",
    },
  ],
  
  "add-subordinate": [
    {
      id: "open-dialog",
      target: "[data-tour='add-member-btn']",
      title: "Add a Team Member",
      content: "Click this button to add someone you supervise.",
      placement: "bottom",
      action: "click",
    },
    {
      id: "reports-to",
      target: "[data-tour='reports-to-field']",
      title: "Reports To",
      content: "Choose who this person reports to.",
      placement: "bottom",
      autoAdvance: "select",
    },
    {
      id: "basic-info",
      target: "[data-tour='member-name-field']",
      title: "Enter Their Name",
      content: "Add their full name to continue.",
      placement: "bottom",
      autoAdvance: "input",
    },
    {
      id: "remaining-fields",
      target: "[data-tour='remaining-fields']",
      title: "Complete the Form",
      content: "Fill in rank, AFSC, unit, and email. Then click Next.",
      placement: "center",
      highlightPadding: 12,
    },
    {
      id: "submit",
      target: "[data-tour='submit-member-btn']",
      title: "Add to Team",
      content: "Click here to add this person to your team.",
      placement: "top",
      autoAdvance: "click",
    },
  ],
  
  "connect-supervisor": [
    {
      id: "open-dialog",
      target: "[data-tour='send-request-btn']",
      title: "Connect to a Member",
      content: "Click here to link with someone who already uses myEPBuddy.",
      placement: "bottom",
      action: "click",
    },
    {
      id: "request-type",
      target: "[data-tour='request-type-field']",
      title: "Connection Type",
      content: "Choose if you want to supervise them, or have them supervise you.",
      placement: "right",
      autoAdvance: "select",
    },
    {
      id: "search-email",
      target: "[data-tour='search-email-field']",
      title: "Find by Email",
      content: "Enter their email address and click Search to find them.",
      placement: "right",
      autoAdvance: "input",
    },
  ],
  
  "epb-basics": [
    {
      id: "intro",
      title: "EPB Generation",
      content: "Turn your entries into polished EPB statements.",
      placement: "center",
    },
    {
      id: "select-member",
      title: "Select Member",
      content: "Choose yourself or a subordinate to generate EPB for.",
      placement: "center",
    },
    {
      id: "mpa-sections",
      title: "MPA Sections",
      content: "Each section pulls from relevant entries automatically.",
      placement: "center",
    },
    {
      id: "generate",
      title: "AI Generation",
      content: "The AI creates statements based on your entries and style preferences.",
      placement: "center",
    },
  ],
  
  "awards-basics": [
    {
      id: "intro",
      title: "Award Packages",
      content: "Create award nominations with AI-assisted writing.",
      placement: "center",
    },
    {
      id: "create",
      title: "Create Award",
      content: "Select the award type and nominee to get started.",
      placement: "center",
    },
  ],
  
  "decorations-basics": [
    {
      id: "intro",
      title: "Decoration Citations",
      content: "Build citation narratives from accomplishments.",
      placement: "center",
    },
    {
      id: "create",
      title: "Create Decoration",
      content: "Select the decoration type and start building your citation.",
      placement: "center",
    },
  ],
  
  "settings-llm": [
    {
      id: "intro",
      title: "LLM Settings",
      content: "Customize how AI generates your statements.",
      placement: "center",
    },
    {
      id: "prompts",
      title: "Custom Prompts",
      content: "Adjust writing style, tone, and preferences here.",
      placement: "center",
    },
  ],
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      activeTour: null,
      currentStepIndex: 0,
      isVisible: false,
      completedTours: [],
      hasSeenWelcome: false,
      hasCreatedFirstTeamMember: false,
      hasConnectedSupervisor: false,
      
      startTour: (tourId) => {
        // Don't restart completed tours unless explicitly requested
        set({
          activeTour: tourId,
          currentStepIndex: 0,
          isVisible: true,
        });
      },
      
      nextStep: () => {
        const { activeTour, currentStepIndex } = get();
        if (!activeTour) return;
        
        const steps = TOUR_DEFINITIONS[activeTour];
        if (currentStepIndex < steps.length - 1) {
          set({ currentStepIndex: currentStepIndex + 1 });
        } else {
          // Complete the tour
          get().completeTour();
        }
      },
      
      prevStep: () => {
        const { currentStepIndex } = get();
        if (currentStepIndex > 0) {
          set({ currentStepIndex: currentStepIndex - 1 });
        }
      },
      
      skipTour: () => {
        const { activeTour, completedTours } = get();
        if (activeTour && !completedTours.includes(activeTour)) {
          set({
            completedTours: [...completedTours, activeTour],
            activeTour: null,
            currentStepIndex: 0,
            isVisible: false,
          });
        } else {
          set({
            activeTour: null,
            currentStepIndex: 0,
            isVisible: false,
          });
        }
      },
      
      completeTour: () => {
        const { activeTour, completedTours } = get();
        if (activeTour && !completedTours.includes(activeTour)) {
          set({
            completedTours: [...completedTours, activeTour],
            activeTour: null,
            currentStepIndex: 0,
            isVisible: false,
          });
        } else {
          set({
            activeTour: null,
            currentStepIndex: 0,
            isVisible: false,
          });
        }
      },
      
      setStep: (index) => set({ currentStepIndex: index }),
      
      setHasSeenWelcome: (value) => set({ hasSeenWelcome: value }),
      setHasCreatedFirstTeamMember: (value) => set({ hasCreatedFirstTeamMember: value }),
      setHasConnectedSupervisor: (value) => set({ hasConnectedSupervisor: value }),
      
      resetOnboarding: () => set({
        activeTour: null,
        currentStepIndex: 0,
        isVisible: false,
        completedTours: [],
        hasSeenWelcome: false,
        hasCreatedFirstTeamMember: false,
        hasConnectedSupervisor: false,
      }),
    }),
    {
      name: "onboarding-storage",
      partialize: (state) => ({
        completedTours: state.completedTours,
        hasSeenWelcome: state.hasSeenWelcome,
        hasCreatedFirstTeamMember: state.hasCreatedFirstTeamMember,
        hasConnectedSupervisor: state.hasConnectedSupervisor,
      }),
    }
  )
);

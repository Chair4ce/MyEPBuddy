"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { toast } from "@/components/ui/sonner";
import { Sun, Moon, LogOut, User, Settings } from "lucide-react";
import type { Profile } from "@/types/database";
import { clearAllTermsSessionFlags } from "@/lib/terms-session";
import { useCreditsStore } from "@/stores/credits-store";

interface AppHeaderProps {
  profile: Profile | null;
}

export function AppHeader({ profile: initialProfile }: AppHeaderProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const supabase = createClient();
  
  // Use store profile for reactivity, fallback to initial prop
  const storeProfile = useUserStore((state) => state.profile);
  const profile = storeProfile ?? initialProfile;

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error("Error signing out");
      return;
    }

    useUserStore.getState().setIsSigningOut(true);
    clearAllTermsSessionFlags();
    useUserStore.getState().reset();
    useCreditsStore.getState().reset();

    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 h-16 flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between h-full px-4 md:px-6 lg:px-8">
        <div className="lg:hidden w-10 flex-shrink-0" />
        
        {/* Unclassified Banner - centered */}
        <div className="flex-1 flex justify-center">
          <span className="px-3 py-1 text-xs font-semibold tracking-wider rounded bg-green-600 text-white dark:bg-green-700 dark:text-green-50 select-none">
            UNCLASSIFIED
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full flex-shrink-0"
                aria-label="User menu"
              >
                <ProfileAvatar
                  key={profile?.avatar_url || "no-avatar"}
                  profile={profile}
                  className="size-9 flex-shrink-0"
                  fallbackClassName="bg-primary/10 text-primary"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">
                    {profile?.rank ? `${profile.rank} ` : ""}
                    {profile?.full_name || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {profile?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <User className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings/api-keys")}>
                <Settings className="mr-2 size-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}


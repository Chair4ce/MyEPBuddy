"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  FileText,
  Users,
  Sparkles,
  Settings,
  Key,
  Shield,
  Menu,
  X,
  Library,
  Wand2,
  Heart,
  Award,
} from "lucide-react";
import type { Profile } from "@/types/database";

interface AppSidebarProps {
  profile: Profile | null;
}

const navItems = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["member", "admin"],
  },
  {
    title: "My Performance",
    href: "/entries",
    icon: FileText,
    roles: ["member", "admin"],
  },
  {
    title: "My Team",
    href: "/team",
    icon: Users,
    roles: ["member", "admin"],
  },
  {
    title: "Generate EPB",
    href: "/generate",
    icon: Sparkles,
    roles: ["member", "admin"],
  },
  {
    title: "Generate Award",
    href: "/award",
    icon: Award,
    roles: ["member", "admin"],
  },
  {
    title: "Statement Library",
    href: "/library",
    icon: Library,
    roles: ["member", "admin"],
  },
];

const settingsItems = [
  {
    title: "Profile",
    href: "/settings",
    icon: Settings,
    roles: ["member", "admin"],
  },
  {
    title: "LLM Settings",
    href: "/settings/llm",
    icon: Wand2,
    roles: ["member", "admin"],
  },
  {
    title: "API Keys",
    href: "/settings/api-keys",
    icon: Key,
    roles: ["member", "admin"],
  },
  {
    title: "Admin Config",
    href: "/admin/config",
    icon: Shield,
    roles: ["admin"],
  },
];

export function AppSidebar({ profile }: AppSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const userRole = profile?.role || "subordinate";

  const filteredNavItems = navItems.filter((item) =>
    item.roles.includes(userRole)
  );
  const filteredSettingsItems = settingsItems.filter((item) =>
    item.roles.includes(userRole)
  );

  return (
    <>
      {/* Mobile hamburger button - only visible when sidebar is closed */}
      {!isOpen && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-4 left-4 z-50 lg:hidden"
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </Button>
      )}

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-full w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-in-out",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo & Close button */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-sidebar-border">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-bold text-lg"
              onClick={() => setIsOpen(false)}
            >
              <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-bold text-sm">
                EP
              </div>
              <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                My EPBuddy
              </span>
            </Link>
            {/* Mobile close button - inside sidebar header */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden -mr-2"
              onClick={() => setIsOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1 px-3 py-4">
            <nav className="space-y-1">
              {filteredNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.title}
                  </Link>
                );
              })}
            </nav>

            <Separator className="my-4" />

            <div className="text-xs font-medium text-muted-foreground px-3 mb-2">
              Settings
            </div>
            <nav className="space-y-1">
              {filteredSettingsItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.title}
                  </Link>
                );
              })}
            </nav>

            <Separator className="my-4" />

            {/* Support Link */}
            <Link
              href="/support"
              onClick={() => setIsOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                pathname === "/support"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Heart className="size-4 text-pink-500" />
              <span>Support</span>
            </Link>
          </ScrollArea>

          {/* User info */}
          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                {profile?.full_name?.charAt(0) || profile?.email?.charAt(0) || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {profile?.rank ? `${profile.rank} ` : ""}
                  {profile?.full_name || "User"}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {profile?.role || "subordinate"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}


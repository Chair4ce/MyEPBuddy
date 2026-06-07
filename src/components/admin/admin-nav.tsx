"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_LINKS = [
  {
    title: "Config",
    href: "/admin/config",
    icon: Shield,
    description: "Feature flags and app settings",
  },
  {
    title: "Usage Analytics",
    href: "/admin/usage",
    icon: BarChart3,
    description: "Trial burn, conversion, and free-key cost",
  },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap gap-2"
      aria-label="Admin sections"
    >
      {ADMIN_LINKS.map((link) => {
        const isActive =
          pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-w-[200px] flex-1 flex-col gap-1 rounded-lg border p-4 transition-colors sm:max-w-xs",
              isActive
                ? "border-primary bg-primary/5 shadow-sm"
                : "bg-muted/30 hover:bg-muted/50 hover:border-muted-foreground/20",
            )}
          >
            <span className="flex items-center gap-2 font-medium">
              <Icon className="size-4 shrink-0" aria-hidden />
              {link.title}
            </span>
            <span className="text-xs text-muted-foreground">
              {link.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

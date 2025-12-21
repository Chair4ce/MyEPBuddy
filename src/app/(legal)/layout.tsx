import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-bold text-sm">
              EP
            </div>
            <span>My EPBuddy</span>
          </Link>
          
          {/* Unclassified Banner */}
          <span className="hidden sm:inline-block px-3 py-1 text-xs font-semibold tracking-wider rounded bg-green-600 text-white dark:bg-green-700 dark:text-green-50 select-none">
            UNCLASSIFIED
          </span>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="size-6 rounded bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-bold text-xs">
                EP
              </div>
              <span>My EPBuddy © {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Not affiliated with the U.S. Air Force or DoD
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}


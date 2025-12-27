import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center space-y-6 max-w-md animate-fade-in">
        {/* 404 Badge */}
        <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-destructive/10 text-destructive text-sm font-medium">
          404 Error
        </div>

        {/* Main heading */}
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground">
          Page not found
        </h1>

        {/* Description */}
        <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Check the URL or navigate back to safety.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Button asChild variant="default" size="lg">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>

      {/* Subtle background decoration */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}




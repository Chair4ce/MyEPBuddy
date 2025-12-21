import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Sparkles,
  Users,
  Shield,
  ArrowRight,
  Check,
  Zap,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl">
            <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-bold text-sm">
              EP
            </div>
            <span>My EPBuddy</span>
          </div>
          
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

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />

          <div className="container mx-auto px-4 py-24 md:py-32 relative">
            <div className="max-w-3xl mx-auto text-center space-y-8">
              <Badge variant="secondary" className="px-4 py-1.5">
                <Sparkles className="size-3 mr-2" />
                AFI 36-2406 Compliant
              </Badge>

              <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-br from-foreground via-foreground to-muted-foreground bg-clip-text">
                Your Air Force EPB Writing Assistant
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
                Track accomplishments and generate high-quality, myEval-ready
                Enlisted Performance Brief narrative statements. Built for
                supervisors and their subordinates.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Start Free
                    <ArrowRight className="size-4 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">
                Everything You Need for EPBs
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                A complete solution for tracking accomplishments and generating
                professional EPB statements
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureCard
                icon={FileText}
                title="Track Accomplishments"
                description="Structured entry forms for capturing actions, impacts, and metrics throughout the year"
              />
              <FeatureCard
                icon={Sparkles}
                title="AI-Powered Generation"
                description="Generate rank-appropriate, compliant narrative statements with multiple AI model options"
              />
              <FeatureCard
                icon={Users}
                title="Team Management"
                description="Supervisors can manage subordinates and track their progress across all MPAs"
              />
              <FeatureCard
                icon={Shield}
                title="myEval Ready"
                description="Clean, plain-text output optimized for direct copy-paste into myEval"
              />
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-24">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <h2 className="text-3xl font-bold">
                  Write Better EPBs, Faster
                </h2>
                <p className="text-lg text-muted-foreground">
                  Stop struggling with EPB statements. Our AI-powered tool helps
                  you create professional, compliant narrative statements that
                  accurately reflect your accomplishments.
                </p>

                <ul className="space-y-4">
                  {[
                    "Automatic character counting (≤350 chars)",
                    "Rank-appropriate action verbs",
                    "Coverage tracking across all MPAs",
                    "Multiple AI models to choose from",
                    "Secure, encrypted API key storage",
                    "Real-time streaming generation",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <Check className="size-3 text-primary" />
                      </div>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <Button asChild>
                  <Link href="/signup">
                    Get Started Free
                    <ArrowRight className="size-4 ml-2" />
                  </Link>
                </Button>
              </div>

              <div className="relative">
                <div className="bg-card border rounded-xl p-6 shadow-lg">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Badge>Executing the Mission</Badge>
                      <span className="text-sm text-muted-foreground">
                        Generated
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        Led 5-person team during critical intel ops; processed
                        200+ reports directly supporting combat ops—zero errors
                        across 90-day deployment
                      </div>
                      <div className="p-3 bg-muted rounded-lg text-sm">
                        Spearheaded training program for 15 analysts; improved
                        unit proficiency 30%—earned &quot;Exceptional&quot;
                        rating during UCI
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Using GPT-4o</span>
                      <span className="text-green-600 dark:text-green-400">
                        348/350 characters
                      </span>
                    </div>
                  </div>
                </div>
                <div className="absolute -z-10 inset-0 blur-3xl bg-gradient-to-br from-primary/20 to-primary/5" />
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-primary/5">
          <div className="container mx-auto px-4 text-center">
            <div className="max-w-2xl mx-auto space-y-6">
              <Zap className="size-12 mx-auto text-primary" />
              <h2 className="text-3xl font-bold">
                Ready to Upgrade Your EPB Process?
              </h2>
              <p className="text-lg text-muted-foreground">
                Join supervisors and airmen who are writing better EPBs with
                less stress. Start tracking accomplishments today.
              </p>
              <Button size="lg" asChild>
                <Link href="/signup">
                  Create Free Account
                  <ArrowRight className="size-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
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

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-card border rounded-xl p-6 space-y-4 hover:shadow-md transition-shadow">
      <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="size-6 text-primary" />
      </div>
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}


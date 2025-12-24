"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Coffee, Rocket, Code2, Sparkles, ExternalLink, Github, GitPullRequest } from "lucide-react";

export default function SupportPage() {
  const buyMeACoffeeUrl = "https://buymeacoffee.com/chairforceone";

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center size-16 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 mb-2">
          <Heart className="size-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Support My EPBuddy</h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Your support helps keep this project alive and growing
        </p>
      </div>

      {/* Story Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 p-8">
          <div className="flex items-start gap-4">
            <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Code2 className="size-6 text-primary" />
            </div>
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">My Story</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Hey there! I&apos;m a passionate developer who loves building useful apps 
                  that make people&apos;s lives easier. My EPBuddy started as a personal project 
                  to help Airmen and Guardians manage their EPB accomplishments more 
                  efficiently — and it&apos;s grown into something I&apos;m truly proud of.
                </p>
                <p>
                  Every feature, every line of code, and every late night debugging session 
                  is driven by my love for creating tools that actually matter. I believe 
                  great software should be accessible to everyone, and I&apos;m committed to 
                  keeping this app free and constantly improving.
                </p>
                <p className="text-foreground font-medium">
                  <Sparkles className="size-4 inline-block mr-1 text-primary" />
                  Your support means the world to me and directly fuels continued 
                  development, new features, and better experiences for everyone.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Donation Card */}
      <Card>
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-6 text-center">
            {/* Coffee Icon */}
            <div className="relative group">
              <div className="absolute -inset-3 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
              <div className="relative size-24 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center shadow-lg">
                <Coffee className="size-12 text-white" />
              </div>
            </div>

            {/* Info */}
            <div className="space-y-3">
              <h3 className="text-2xl font-bold">Buy Me a Coffee</h3>
              <p className="text-muted-foreground max-w-md">
                If My EPBuddy has helped you, consider buying me a coffee to keep the project going!
              </p>
            </div>

            <Button 
              asChild 
              size="lg" 
              className="bg-[#FFDD00] hover:bg-[#E5C700] text-black font-semibold gap-2 px-8"
            >
              <a 
                href={buyMeACoffeeUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Buy me a coffee"
              >
                <Coffee className="size-5" />
                Buy Me a Coffee
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* What Your Support Enables */}
      <Card>
        <CardContent className="p-8">
          <h3 className="text-xl font-semibold mb-6 text-center">
            What Your Support Enables
          </h3>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="text-center space-y-3">
              <div className="size-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto">
                <Rocket className="size-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h4 className="font-medium">New Features</h4>
              <p className="text-sm text-muted-foreground">
                More AI capabilities, integrations, and tools to supercharge your EPB
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="size-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <Code2 className="size-6 text-green-600 dark:text-green-400" />
              </div>
              <h4 className="font-medium">Active Development</h4>
              <p className="text-sm text-muted-foreground">
                Bug fixes, performance improvements, and regular updates
              </p>
            </div>
            <div className="text-center space-y-3">
              <div className="size-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto">
                <Heart className="size-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h4 className="font-medium">Community Growth</h4>
              <p className="text-sm text-muted-foreground">
                Keeping the app free and accessible for all service members
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contribute Section */}
      <Card className="border-2 border-dashed">
        <CardContent className="p-8">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="size-16 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-200 dark:to-gray-100 flex items-center justify-center shrink-0">
              <Github className="size-8 text-white dark:text-gray-900" />
            </div>
            <div className="flex-1 text-center sm:text-left space-y-3">
              <h3 className="text-xl font-semibold">Want to Contribute?</h3>
              <p className="text-muted-foreground">
                My EPBuddy is open source! If you&apos;re a developer and would like to 
                help add features, fix bugs, or improve the app, feel free to submit 
                a Pull Request on GitHub.
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2">
                <Button asChild variant="outline" className="gap-2">
                  <a
                    href="https://github.com/Chair4ce/MyEPBuddy"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="View repository on GitHub"
                  >
                    <Github className="size-4" />
                    View Repository
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
                <Button asChild variant="ghost" className="gap-2">
                  <a
                    href="https://github.com/Chair4ce/MyEPBuddy/pulls"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Submit a Pull Request"
                  >
                    <GitPullRequest className="size-4" />
                    Submit a PR
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thank You */}
      <div className="text-center py-6">
        <p className="text-muted-foreground">
          Thank you for being part of this journey. Every contribution, big or small, 
          makes a difference.
        </p>
      </div>
    </div>
  );
}


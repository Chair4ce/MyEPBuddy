"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coffee, MessageSquareMore, ExternalLink, Github, GitPullRequest } from "lucide-react";

export default function SupportPage() {
  const buyMeACoffeeUrl = "https://buymeacoffee.com/chairforceone";

  return (
    <div className="space-y-6 w-full max-w-4xl pb-8">
      <div className="space-y-2">
      
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Support My EPBuddy</h1>
        <p className="text-muted-foreground max-w-2xl">
          If My EPBuddy saves you time, reduces editing stress, or helps your team move faster, your support helps keep development steady and sustainable.
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Coffee className="size-5 text-primary" />
            Buy Me a Coffee
          </CardTitle>
          <CardDescription className="text-sm">
            Hey! Like the app? Consider buying me some coffee so I can stay up late and code more features... or don&apos;t and maybe I will get some sleep.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Every cup helps keep bugs down, features up, and my keyboard clacking at unhealthy hours.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-[#FFDD00] hover:bg-[#E5C700] text-black font-semibold gap-2 w-full sm:w-auto"
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <MessageSquareMore className="size-5 text-primary" />
            Share Your Feedback
          </CardTitle>
          <CardDescription className="text-sm">
            Tell us what&apos;s working, what&apos;s not, or what you&apos;d like to see next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the floating feedback form in the bottom-right corner anytime while you&apos;re in the app. Quick notes, feature requests, and bug reports all help.
          </p>
        </CardContent>
      </Card>

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

      <div className="text-center pt-2">
        <p className="text-sm text-muted-foreground">
          Thanks for supporting the mission and helping keep My EPBuddy moving forward.
        </p>
      </div>
    </div>
  );
}


"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";

// Random name generation for anonymous reviewers
const ADJECTIVES = ["Swift", "Brave", "Sharp", "Keen", "Bold", "Wise", "Noble", "Calm", "Bright", "Sure"];
const NOUNS = ["Eagle", "Falcon", "Hawk", "Phoenix", "Raven", "Condor", "Osprey", "Owl", "Griffin", "Sparrow"];

function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${adj} ${noun} ${suffix}`;
}

interface ReviewerNameInputProps {
  rateeName: string;
  rateeRank?: string;
  cycleYear?: number;
  linkLabel?: string | null;
  isAnonymous: boolean;
  onContinue: (name: string, nameSource: "label" | "provided" | "generated") => void;
}

export function ReviewerNameInput({
  rateeName,
  rateeRank,
  cycleYear,
  linkLabel,
  isAnonymous,
  onContinue,
}: ReviewerNameInputProps) {
  const [name, setName] = useState("");
  const [generatedName] = useState(() => generateRandomName());

  // For labeled links, pre-fill the name
  useEffect(() => {
    if (linkLabel) {
      setName(linkLabel);
    }
  }, [linkLabel]);

  const handleContinue = () => {
    if (linkLabel) {
      // Labeled link - use the label
      onContinue(linkLabel, "label");
    } else if (name.trim()) {
      // User provided a name
      onContinue(name.trim(), "provided");
    } else {
      // Use generated name
      onContinue(generatedName, "generated");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            EPB Review for {rateeRank} {rateeName}
          </CardTitle>
          {cycleYear && (
            <CardDescription>Cycle Year: {cycleYear}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {linkLabel ? (
            // Labeled link - show pre-filled name
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 border">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reviewing as:</p>
                  <p className="font-medium">{linkLabel}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                This link was created for you by the EPB author.
              </p>
            </div>
          ) : (
            // Anonymous link - ask for name
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reviewer-name">Your Name (optional)</Label>
                <Input
                  id="reviewer-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name..."
                  aria-label="Your name for the review"
                />
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border">
                <p className="text-xs text-muted-foreground">
                  If you don&apos;t provide a name, you&apos;ll be identified as:
                </p>
                <p className="text-sm font-medium mt-1 text-primary">
                  {generatedName}
                </p>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleContinue}
          >
            Continue to Review
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Your feedback will help improve this EPB. You can add comments by selecting text.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Copy,
  Check,
  Mail,
  Link2,
  User,
  Users,
  AlertTriangle,
} from "lucide-react";

interface CreateReviewLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shellType: "epb" | "award" | "decoration";
  shellId: string;
  rateeName: string;
  rateeRank?: string;
}

type LinkType = "labeled" | "anonymous";

export function CreateReviewLinkDialog({
  open,
  onOpenChange,
  shellType,
  shellId,
  rateeName,
  rateeRank,
}: CreateReviewLinkDialogProps) {
  const [linkType, setLinkType] = useState<LinkType>("labeled");
  const [linkLabel, setLinkLabel] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{
    url: string;
    expiresAt: string;
    tokenId: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const resetForm = () => {
    setLinkType("labeled");
    setLinkLabel("");
    setRecipientEmail("");
    setGeneratedLink(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleGenerate = async (sendEmail: boolean = false) => {
    // Validation
    if (linkType === "labeled" && !linkLabel.trim()) {
      toast.error("Please enter a label for this link");
      return;
    }

    if (sendEmail && recipientEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(recipientEmail)) {
        toast.error("Please enter a valid email address");
        return;
      }
    }

    setIsGenerating(true);

    try {
      // Generate the token
      const response = await fetch("/api/review-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shellType,
          shellId,
          rateeName,
          rateeRank,
          linkLabel: linkType === "labeled" ? linkLabel.trim() : null,
          isAnonymous: linkType === "anonymous",
          recipientEmail: recipientEmail.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate link");
      }

      setGeneratedLink({
        url: data.reviewUrl,
        expiresAt: data.expiresAt,
        tokenId: data.token,
      });

      // If sending email and email provided
      if (sendEmail && recipientEmail.trim()) {
        setIsSendingEmail(true);
        try {
          const emailResponse = await fetch("/api/send-review-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tokenId: data.token,
              recipientEmail: recipientEmail.trim(),
              reviewUrl: data.reviewUrl,
              rateeName,
              rateeRank,
              mentorLabel: linkType === "labeled" ? linkLabel.trim() : null,
              expiresAt: data.expiresAt,
            }),
          });

          const emailData = await emailResponse.json();

          if (emailResponse.ok) {
            toast.success(`Review link ready! ${emailData.message || ""}`);
          } else {
            toast.error(emailData.error || "Failed to send email");
          }
        } catch (emailErr) {
          console.error("Email error:", emailErr);
          toast.error("Failed to send email, but link was created");
        } finally {
          setIsSendingEmail(false);
        }
      } else {
        toast.success("Review link created!");
      }
    } catch (error) {
      console.error("Generate error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate link");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink.url);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy error:", err);
      toast.error("Failed to copy link");
    }
  };

  const formatExpiresAt = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share for Mentor Review</DialogTitle>
          <DialogDescription>
            Generate a link to share this {shellType.toUpperCase()} for feedback
          </DialogDescription>
        </DialogHeader>

        {!generatedLink ? (
          <div className="space-y-6">
            {/* Link Type Selection */}
            <div className="space-y-3">
              <Label>Link Type</Label>
              <RadioGroup
                value={linkType}
                onValueChange={(v: string) => setLinkType(v as LinkType)}
                className="space-y-2"
              >
                <label
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    linkType === "labeled"
                      ? "bg-primary/5 border-primary/30"
                      : "hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="labeled" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Labeled Link</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      For a specific mentor. Feedback will be labeled with their name.
                    </p>
                  </div>
                </label>

                <label
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    linkType === "anonymous"
                      ? "bg-primary/5 border-primary/30"
                      : "hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="anonymous" className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground" />
                      <span className="font-medium text-sm">Anonymous Link</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Anyone can use it. Reviewers will be asked for their name.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* Label Input (for labeled links) */}
            {linkType === "labeled" && (
              <div className="space-y-2">
                <Label htmlFor="link-label">Label for this link</Label>
                <Input
                  id="link-label"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="e.g., MSgt Johnson, Flight Chief"
                  aria-label="Link label"
                />
              </div>
            )}

            {/* Email Input (optional) */}
            <div className="space-y-2">
              <Label htmlFor="recipient-email">
                Mentor&apos;s email <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="recipient-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="mentor@example.com"
                aria-label="Recipient email"
              />
              <p className="text-xs text-muted-foreground">
                Enter an email to send the link directly, or leave blank to copy the link.
              </p>
            </div>

            {/* Expiration note */}
            <p className="text-xs text-muted-foreground text-center">
              Link expires in 48 hours or after feedback is submitted
            </p>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {recipientEmail.trim() ? (
                <>
                  <Button
                    onClick={() => handleGenerate(true)}
                    disabled={isGenerating || isSendingEmail}
                    className="gap-2"
                  >
                    {isGenerating || isSendingEmail ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Mail className="size-4" />
                    )}
                    Send Email
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleGenerate(false)}
                    disabled={isGenerating || isSendingEmail}
                    className="gap-2"
                  >
                    <Link2 className="size-4" />
                    Just Copy Link
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => handleGenerate(false)}
                  disabled={isGenerating}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Link2 className="size-4" />
                  )}
                  Generate & Copy Link
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Success state */}
            <div className="flex items-center gap-2 text-green-600">
              <Check className="size-5" />
              <span className="font-medium">
                Link created{linkType === "labeled" ? ` for "${linkLabel}"` : ""}
              </span>
            </div>

            {/* Link display */}
            <div className="space-y-2">
              <Label>Review Link</Label>
              <div className="flex gap-2">
                <Input
                  value={generatedLink.url}
                  readOnly
                  className="font-mono text-xs"
                  aria-label="Generated review link"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy link"
                >
                  {copied ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Expiration */}
            <p className="text-xs text-muted-foreground">
              Expires: {formatExpiresAt(generatedLink.expiresAt)}
            </p>

            {/* Warning for labeled links */}
            {linkType === "labeled" && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Only share this link with <strong>{linkLabel}</strong>. All feedback will be attributed to this name.
                </p>
              </div>
            )}

            {/* Done button */}
            <Button variant="outline" onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

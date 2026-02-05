"use client";

// Force dynamic rendering - this page requires auth session
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import { AppLogo } from "@/components/layout/app-logo";
import { ENLISTED_RANKS, OFFICER_RANKS, CIVILIAN_RANK } from "@/lib/constants";
import type { Rank } from "@/types/database";

export default function CompleteProfilePage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [rank, setRank] = useState<Rank | "">("");
  const [afsc, setAfsc] = useState("");
  const [unit, setUnit] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Check if user is authenticated and get their phone
    async function checkUser() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/phone-login");
        return;
      }
      
      setUserPhone(user.phone || null);

      // Check if profile already exists
      const { data: existingProfileCheck } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle() as { data: { email: string } | null };
      
      if (existingProfileCheck?.email) {
        // Profile already complete, redirect to dashboard
        router.push("/dashboard");
      }
    }
    
    checkUser();
  }, [router, supabase]);

  async function handleCompleteProfile(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("User not authenticated");
        router.push("/phone-login");
        return;
      }

      // Check if email already exists in another account
      const { data: existingProfile } = (await supabase
        .from("profiles")
        .select("id, email")
        .eq("email", email)
        .maybeSingle()) as { data: { id: string; email: string } | null };

      if (existingProfile?.id && existingProfile.id !== user.id) {
        toast.error(
          "This email is already registered. Please sign in with your email account and add your phone number in Settings instead.",
          { duration: 6000 }
        );
        
        // Show option to go to login
        setTimeout(() => {
          const shouldGoToLogin = confirm(
            "This email already has an account. Would you like to sign in with email instead?\n\n" +
            "After signing in, you can add your phone number in Settings to link both accounts."
          );
          
          if (shouldGoToLogin) {
            // Sign out current phone-only session
            supabase.auth.signOut();
            router.push("/login");
          }
        }, 1000);
        return;
      }

      // SECURITY: Validate email format before updating
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        toast.error("Please enter a valid email address");
        return;
      }

      // Combine first and last name for full_name (backwards compatibility)
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

      // Update user metadata with email
      const { error: updateError } = await supabase.auth.updateUser({
        email: email,
        data: {
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          rank: rank,
        },
      });

      if (updateError) {
        // Handle email already exists error from Supabase auth
        if (updateError.message.includes('already') || updateError.message.includes('exists')) {
          toast.error(
            "This email is already registered to another account. Please sign in with email and add your phone in Settings.",
            { duration: 6000 }
          );
          
          setTimeout(() => {
            supabase.auth.signOut();
            router.push("/login");
          }, 2000);
          return;
        }
        toast.error(updateError.message);
        return;
      }

      // Create or update profile
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profileError } = await (supabase as any).from("profiles").upsert({
        id: user.id,
        full_name: fullName,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        email: email,
        rank: rank as Rank,
        afsc: afsc || null,
        unit: unit || null,
        updated_at: new Date().toISOString(),
      });

      if (profileError) {
        toast.error(profileError.message);
        return;
      }

      toast.success("Profile completed!");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <AppLogo size="xl" variant="stacked" />
        </div>
        <p className="text-muted-foreground mt-2">
          Your Air Force EPB writing assistant
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Complete your profile</CardTitle>
          <CardDescription>
            {userPhone && (
              <span className="block mb-2">Phone verified: {userPhone}</span>
            )}
            Please provide additional information to complete your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium mb-2">
              📧 Already have an account?
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-200">
              If you already have an account with this email, please sign in with email instead and add your phone number in Settings. This prevents duplicate accounts.
            </p>
          </div>

          <form onSubmit={handleCompleteProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address *</Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@mail.mil"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                aria-label="Email address"
                autoComplete="email"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Use the email associated with your Air Force account
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={isLoading}
                  aria-label="First name"
                  autoComplete="given-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={isLoading}
                  aria-label="Last name"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rank">Rank *</Label>
              <Select
                value={rank}
                onValueChange={(value) => setRank(value as Rank)}
                disabled={isLoading}
                required
              >
                <SelectTrigger id="rank" aria-label="Rank">
                  <SelectValue placeholder="Select your rank" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Enlisted
                  </div>
                  {ENLISTED_RANKS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.value}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                    Officer
                  </div>
                  {OFFICER_RANKS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.value}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                    Civilian
                  </div>
                  {CIVILIAN_RANK.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="afsc">AFSC (Optional)</Label>
              <Input
                id="afsc"
                type="text"
                placeholder="e.g., 3D1X2"
                value={afsc}
                onChange={(e) => setAfsc(e.target.value)}
                disabled={isLoading}
                aria-label="AFSC"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit (Optional)</Label>
              <Input
                id="unit"
                type="text"
                placeholder="e.g., 123rd Communications Squadron"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={isLoading}
                aria-label="Unit"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Complete Profile"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/sonner";
import { AvatarCropDialog } from "@/components/settings/avatar-crop-dialog";
import { 
  ENLISTED_RANKS,
  OFFICER_RANKS,
  CIVILIAN_RANK,
  getStaticCloseoutDate, 
  getDaysUntilCloseout, 
  getCycleProgress,
  RANK_TO_TIER,
  isOfficer 
} from "@/lib/constants";
import { Loader2, User, Calendar, Clock, Camera, X, RotateCcw, Smartphone, CheckCircle2, Link as LinkIcon, Mail } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Progress } from "@/components/ui/progress";
import type { Rank, Profile } from "@/types/database";

export default function SettingsPage() {
  const { profile, setProfile } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const [googlePictureUrl, setGooglePictureUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    full_name: "",
    rank: "" as Rank | "",
    afsc: "",
    unit: "",
  });

  // Phone number management state
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [canResendPhone, setCanResendPhone] = useState(false);

  // Connected accounts state
  const [hasGoogleLinked, setHasGoogleLinked] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch Google profile picture from auth metadata on mount (only for Google OAuth users)
  useEffect(() => {
    async function fetchGooglePicture() {
      const { data: { user } } = await supabase.auth.getUser();
      // Check if user signed in with Google OAuth
      const isGoogleUser = user?.app_metadata?.provider === "google" || 
        user?.identities?.some((identity) => identity.provider === "google");
      
      if (isGoogleUser && user?.user_metadata?.picture) {
        setGooglePictureUrl(user.user_metadata.picture);
      }
    }
    fetchGooglePicture();
  }, [supabase.auth]);

  // Check if current avatar is NOT the Google picture (i.e., user uploaded a custom one)
  const hasCustomAvatar = profile?.avatar_url && googlePictureUrl && profile.avatar_url !== googlePictureUrl;
  const canRevertToGoogle = googlePictureUrl && (hasCustomAvatar || !profile?.avatar_url);
  
  const initials =
    profile?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || profile?.email?.charAt(0).toUpperCase() || "U";

  // When user selects a file, show the crop dialog
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid image file (JPEG, PNG, GIF, or WebP)");
      return;
    }

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be less than 2MB");
      return;
    }

    // Create object URL for the cropper
    const imageUrl = URL.createObjectURL(file);
    setSelectedImageSrc(imageUrl);
    setCropDialogOpen(true);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // Upload the cropped image
  async function handleCroppedUpload(croppedBlob: Blob) {
    if (!profile) return;

    setIsUploadingAvatar(true);

    try {
      // Generate unique filename
      const fileName = `${profile.id}/avatar-${Date.now()}.jpeg`;

      // Delete old avatar if it exists in storage (not a Google URL)
      if (profile.avatar_url && profile.avatar_url.includes("/storage/v1/object/")) {
        const oldPath = profile.avatar_url.split("/avatars/")[1]?.split("?")[0];
        if (oldPath) {
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      }

      // Upload cropped avatar
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, croppedBlob, { 
          upsert: true,
          contentType: "image/jpeg"
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }

      // Get public URL with cache buster
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);
      
      const avatarUrlWithCacheBuster = `${urlData.publicUrl}?t=${Date.now()}`;

      // Update profile with new avatar URL
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: updateError } = await (supabase as any)
        .from("profiles")
        .update({ avatar_url: avatarUrlWithCacheBuster })
        .eq("id", profile.id)
        .select()
        .single();

      if (updateError) {
        console.error("Profile update error:", updateError);
        toast.error(`Failed to update profile: ${updateError.message}`);
        return;
      }

      setProfile(data as Profile);
      toast.success("Profile photo updated");
      setCropDialogOpen(false);
      
      // Clean up object URL
      if (selectedImageSrc) {
        URL.revokeObjectURL(selectedImageSrc);
        setSelectedImageSrc(null);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      toast.error("Failed to upload image");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  // Handle crop dialog close
  function handleCropDialogClose(open: boolean) {
    if (!open && selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
      setSelectedImageSrc(null);
    }
    setCropDialogOpen(open);
  }

  async function handleRemoveAvatar() {
    if (!profile) return;

    setIsUploadingAvatar(true);

    try {
      // Delete from storage if it's a storage URL
      if (profile.avatar_url && profile.avatar_url.includes("/storage/v1/object/")) {
        const oldPath = profile.avatar_url.split("/avatars/")[1];
        if (oldPath) {
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      }

      // Update profile to remove avatar
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", profile.id)
        .select()
        .single();

      if (error) {
        toast.error("Failed to remove photo");
        return;
      }

      setProfile(data as Profile);
      toast.success("Profile photo removed");
    } catch {
      toast.error("Failed to remove photo");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleRevertToGoogle() {
    if (!profile || !googlePictureUrl) return;

    setIsUploadingAvatar(true);

    try {
      // Delete custom avatar from storage if it exists
      if (profile.avatar_url && profile.avatar_url.includes("/storage/v1/object/")) {
        const oldPath = profile.avatar_url.split("/avatars/")[1]?.split("?")[0];
        if (oldPath) {
          await supabase.storage.from("avatars").remove([oldPath]);
        }
      }

      // Update profile to use Google picture
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("profiles")
        .update({ avatar_url: googlePictureUrl })
        .eq("id", profile.id)
        .select()
        .single();

      if (error) {
        toast.error("Failed to revert to Google photo");
        return;
      }

      setProfile(data as Profile);
      toast.success("Reverted to Google profile photo");
    } catch {
      toast.error("Failed to revert to Google photo");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  // Sync form with profile data when profile loads
  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || "",
        rank: profile.rank || "",
        afsc: profile.afsc || "",
        unit: profile.unit || "",
      });
    }
  }, [profile]);

  // Load user phone number and linked accounts
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserPhone(user.phone || null);
        setUserEmail(user.email || null);
        
        // Check if Google is linked
        const googleIdentity = user.identities?.find(
          (identity) => identity.provider === "google"
        );
        setHasGoogleLinked(!!googleIdentity);
      }
    });
  }, [supabase.auth]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("profiles")
        .update({
          full_name: form.full_name,
          rank: form.rank || null,
          afsc: form.afsc || null,
          unit: form.unit || null,
        })
        .eq("id", profile?.id)
        .select()
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      setProfile(data as Profile);
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddPhone(e: React.FormEvent) {
    e.preventDefault();
    setPhoneLoading(true);

    // SECURITY: Validate phone number format
    const digitsOnly = newPhone.replace(/\D/g, '');
    if (digitsOnly.length < 10 || digitsOnly.length > 15) {
      toast.error("Please enter a valid phone number");
      setPhoneLoading(false);
      return;
    }

    // Format phone to E.164
    const formattedPhone = newPhone.startsWith('+') 
      ? newPhone 
      : `+1${digitsOnly}`;

    try {
      const { error } = await supabase.auth.updateUser({
        phone: formattedPhone,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setPhoneOtpSent(true);
      toast.success("Verification code sent to your phone!");
      setTimeout(() => setCanResendPhone(true), 60000);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setPhoneLoading(false);
    }
  }

  async function handleVerifyPhone(e: React.FormEvent) {
    e.preventDefault();

    if (phoneOtp.length !== 6) {
      toast.error("Please enter the complete 6-digit code");
      return;
    }

    setPhoneLoading(true);

    const formattedPhone = newPhone.startsWith('+') 
      ? newPhone 
      : `+1${newPhone.replace(/\D/g, '')}`;

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: phoneOtp,
        type: 'phone_change',
      });

      if (error) {
        // SECURITY: Clear OTP on failed verification
        setPhoneOtp("");
        toast.error("Invalid or expired code. Please try again.");
        return;
      }

      setUserPhone(formattedPhone);
      setNewPhone("");
      setPhoneOtp("");
      setPhoneOtpSent(false);
      toast.success("Phone number updated successfully!");
    } catch {
      // SECURITY: Clear OTP on error
      setPhoneOtp("");
      toast.error("An unexpected error occurred");
    } finally {
      setPhoneLoading(false);
    }
  }

  async function handleResendPhoneOTP() {
    setCanResendPhone(false);
    setPhoneOtp("");
    await handleAddPhone(new Event('submit') as unknown as React.FormEvent);
  }

  async function handleLinkGoogle() {
    setIsLinkingGoogle(true);

    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
        },
      });

      if (error) {
        toast.error(error.message);
        setIsLinkingGoogle(false);
        return;
      }

      // OAuth flow redirects, so loading state persists
      toast.success("Redirecting to Google...");
    } catch {
      toast.error("Failed to link Google account");
      setIsLinkingGoogle(false);
    }
  }

  async function handleUnlinkGoogle() {
    if (!userEmail) {
      toast.error("Cannot unlink: You need an email or phone to sign in");
      return;
    }

    const confirmed = confirm(
      "Are you sure you want to unlink your Google account?\n\n" +
      "You'll still be able to sign in with email" + (userPhone ? " or phone" : "") + "."
    );

    if (!confirmed) return;

    setIsLinkingGoogle(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const googleIdentity = user?.identities?.find(
        (identity) => identity.provider === "google"
      );

      if (!googleIdentity) {
        toast.error("Google account not linked");
        return;
      }

      const { error } = await supabase.auth.unlinkIdentity(googleIdentity);

      if (error) {
        toast.error(error.message);
        return;
      }

      setHasGoogleLinked(false);
      toast.success("Google account unlinked successfully");
    } catch {
      toast.error("Failed to unlink Google account");
    } finally {
      setIsLinkingGoogle(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground">
          Manage your personal information and preferences
        </p>
      </div>

      {/* Profile Photo Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Camera className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle>Profile Photo</CardTitle>
              <CardDescription>
                Your photo appears in the navigation and team views
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar key={profile?.avatar_url || "no-avatar"} className="size-24 border-2 border-muted">
                <AvatarImage
                  src={profile?.avatar_url || undefined}
                  alt={profile?.full_name || "User"}
                />
                <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {isUploadingAvatar && (
                <div className="absolute inset-0 bg-background/80 rounded-full flex items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  aria-label="Upload new photo"
                >
                  {isUploadingAvatar ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Camera className="size-4 mr-2" />
                      {profile?.avatar_url ? "Change Photo" : "Upload Photo"}
                    </>
                  )}
                </Button>
                {canRevertToGoogle && profile?.avatar_url !== googlePictureUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRevertToGoogle}
                    disabled={isUploadingAvatar}
                    aria-label="Use Google photo"
                  >
                    <RotateCcw className="size-4 mr-2" />
                    Use Google Photo
                  </Button>
                )}
                {profile?.avatar_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={isUploadingAvatar}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove photo"
                  >
                    <X className="size-4 mr-1" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, GIF or WebP. Max 2MB.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Upload profile photo"
            />
          </div>
        </CardContent>
      </Card>

      {/* Avatar Crop Dialog */}
      {selectedImageSrc && (
        <AvatarCropDialog
          open={cropDialogOpen}
          onOpenChange={handleCropDialogClose}
          imageSrc={selectedImageSrc}
          onCropComplete={handleCroppedUpload}
          isUploading={isUploadingAvatar}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                Update your profile details used across the app
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile?.email || ""}
                disabled
                className="bg-muted"
                aria-label="Email (read-only)"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                  placeholder="John Doe"
                  aria-label="Full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rank">Rank</Label>
                <Select
                  value={form.rank || profile?.rank || ""}
                  onValueChange={(value) =>
                    setForm({ ...form, rank: value as Rank })
                  }
                >
                  <SelectTrigger id="rank" aria-label="Select rank">
                    <SelectValue placeholder="Select rank" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Enlisted
                    </div>
                    {ENLISTED_RANKS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                      Officer
                    </div>
                    {OFFICER_RANKS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-1">
                      Civilian
                    </div>
                    {CIVILIAN_RANK.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="afsc">AFSC</Label>
                <Input
                  id="afsc"
                  value={form.afsc}
                  onChange={(e) =>
                    setForm({ ...form, afsc: e.target.value.toUpperCase() })
                  }
                  placeholder="1N0X1"
                  aria-label="Air Force Specialty Code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input
                  id="unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="25 IS"
                  aria-label="Unit"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Phone Number Management Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Smartphone className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle>Phone Number</CardTitle>
              <CardDescription>
                {userPhone ? "Manage your phone number for sign-in" : "Add a phone number to enable phone-based sign-in"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {userPhone && !phoneOtpSent ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <Smartphone className="size-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Current Phone</p>
                  <p className="text-sm text-muted-foreground">{userPhone}</p>
                </div>
                <CheckCircle2 className="size-5 text-green-500" />
              </div>

              <form onSubmit={handleAddPhone} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="updatePhone">Update Phone Number</Label>
                  <Input
                    id="updatePhone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    required
                    disabled={phoneLoading}
                    aria-label="New phone number"
                    autoComplete="tel"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your new phone number with country code (e.g., +1 for US)
                  </p>
                </div>
                <Button type="submit" disabled={phoneLoading}>
                  {phoneLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    "Update Phone Number"
                  )}
                </Button>
              </form>
            </div>
          ) : phoneOtpSent ? (
            <form onSubmit={handleVerifyPhone} className="space-y-6">
              <div className="flex items-center justify-center p-6 rounded-lg bg-primary/10 border border-primary/20">
                <Smartphone className="size-12 text-primary" />
              </div>

              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Code sent to:
                </p>
                <p className="font-medium">{newPhone}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone-otp" className="text-center block">
                  Verification Code
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={phoneOtp}
                    onChange={setPhoneOtp}
                    disabled={phoneLoading}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Code expires in 60 minutes
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={phoneLoading || phoneOtp.length !== 6}
                >
                  {phoneLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Verifying...
                    </>
                  ) : (
                    "Verify Phone Number"
                  )}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleResendPhoneOTP}
                  disabled={!canResendPhone || phoneLoading}
                >
                  {canResendPhone ? "Resend code" : "Resend available in 60s"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setPhoneOtpSent(false);
                    setPhoneOtp("");
                    setNewPhone("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAddPhone} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPhone">Phone Number</Label>
                <Input
                  id="newPhone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  required
                  disabled={phoneLoading}
                  aria-label="Phone number"
                  autoComplete="tel"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your phone number with country code (e.g., +1 for US)
                </p>
              </div>
              <Button type="submit" disabled={phoneLoading}>
                {phoneLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  "Add Phone Number"
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                You'll receive a 6-digit code via SMS to verify your number. Message and data rates may apply.
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Connected Accounts Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <LinkIcon className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>
                Link multiple sign-in methods to your account
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Email */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-3">
              <Mail className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground">
                  {userEmail || "Not set"}
                </p>
              </div>
            </div>
            {userEmail && <CheckCircle2 className="size-5 text-green-500" />}
          </div>

          {/* Phone */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-3">
              <Smartphone className="size-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Phone</p>
                <p className="text-xs text-muted-foreground">
                  {userPhone || "Not linked"}
                </p>
              </div>
            </div>
            {userPhone && <CheckCircle2 className="size-5 text-green-500" />}
          </div>

          {/* Google */}
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-3">
              <svg className="size-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium">Google</p>
                <p className="text-xs text-muted-foreground">
                  {hasGoogleLinked ? "Connected" : "Not linked"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasGoogleLinked ? (
                <>
                  <CheckCircle2 className="size-5 text-green-500" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUnlinkGoogle}
                    disabled={isLinkingGoogle || (!userEmail && !userPhone)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {isLinkingGoogle ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Unlink"
                    )}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLinkGoogle}
                  disabled={isLinkingGoogle}
                >
                  {isLinkingGoogle ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Linking...
                    </>
                  ) : (
                    "Link Google"
                  )}
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground pt-2">
            Link multiple sign-in methods to access your account with any of them. You must have at least one method connected.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Role</CardTitle>
          <CardDescription>
            Your account type and team relationships
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                profile?.role === "admin"
                  ? "bg-primary/10 text-primary"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
              }`}
            >
              {profile?.role === "admin" ? "Administrator" : "Member"}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Team relationships determine who you can supervise and who supervises you. 
            Visit the Team page to manage your supervision relationships.
          </p>
        </CardContent>
      </Card>

      {/* EPB Close-out Date Card */}
      <EPBCloseoutCard rank={profile?.rank || null} />
    </div>
  );
}

// EPB Close-out Information Card
function EPBCloseoutCard({ rank }: { rank: Rank | null }) {
  const tier = rank ? RANK_TO_TIER[rank] : null;
  const closeout = getStaticCloseoutDate(rank);
  const daysUntil = getDaysUntilCloseout(rank);
  const cycleProgress = getCycleProgress(rank);
  
  // Calculate submission deadline (60 days before closeout)
  const submissionDeadline = closeout ? new Date(closeout.date) : null;
  if (submissionDeadline) {
    submissionDeadline.setDate(submissionDeadline.getDate() - 60);
  }
  const daysUntilSubmission = submissionDeadline ? (() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.ceil((submissionDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  })() : null;

  // Civilians don't have EPBs - don't show this card
  if (rank === "Civilian") {
    return null;
  }

  // Officers have OPBs - show OPB closeout info if they have a SCOD (O-1 to O-6)
  if (rank && isOfficer(rank)) {
    // General officers (O-7+) don't have standard SCODs
    const isGeneralOfficer = ["Brig Gen", "Maj Gen", "Lt Gen", "Gen"].includes(rank);
    
    if (isGeneralOfficer) {
      return (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Calendar className="size-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>Officer Performance Report</CardTitle>
                <CardDescription>
                  Performance tracking for {rank}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                General Officers follow a different evaluation system than field-grade and company-grade officers.
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                You can use this app to manage EPBs for your enlisted subordinates and collaborate on award packages for your team.
              </p>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Regular officers (O-1 to O-6) have SCODs
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Calendar className="size-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>OPR Close-out Date</CardTitle>
              <CardDescription>
                Static close-out date for {rank}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* OPR Close-out date display */}
          {closeout && (
            <div className="flex items-center justify-between p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <div>
                <p className="text-sm text-muted-foreground">OPR Close-out Date</p>
                <p className="text-2xl font-bold text-blue-800 dark:text-blue-200">
                  {closeout.label}, {closeout.date.getFullYear()}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1.5 justify-end text-blue-700 dark:text-blue-300">
                  <Clock className="size-4" />
                  <span className="text-sm font-medium">
                    {daysUntil !== null ? (
                      daysUntil === 0 ? "Today!" : 
                      daysUntil === 1 ? "Tomorrow" :
                      daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` :
                      `${daysUntil} days`
                    ) : "—"}
                  </span>
                </div>
                <p className="text-xs mt-0.5 text-blue-600 dark:text-blue-400">
                  {daysUntil !== null && daysUntil > 0 ? "until close-out" : daysUntil === 0 ? "" : "since close-out"}
                </p>
              </div>
            </div>
          )}

          {/* Cycle progress */}
          {cycleProgress !== null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">OPR Cycle Progress</span>
                <span className="font-medium">{Math.round(cycleProgress)}%</span>
              </div>
              <Progress value={cycleProgress} className="h-2" />
            </div>
          )}

          {/* Info about OPB/OPR */}
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-2">
            <p><strong>Note:</strong> Officers have OPRs (Officer Performance Reports) which follow Static Close-out Dates (SCODs) per AFI 36-2406.</p>
            <p>While OPR-specific generation features are in development, you can still use this app to manage EPBs for your enlisted subordinates.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // AB and Amn don't have EPBs
  if (rank && (rank === "AB" || rank === "Amn")) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="size-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>EPB Close-out Date</CardTitle>
              <CardDescription>
                Static close-out date for your rank
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Airmen with rank AB or Amn do not submit EPBs. Your first EPB will be when you reach Senior Airman (SrA) and will include all entries since you joined the Air Force.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!rank || !tier || !closeout) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center">
              <Calendar className="size-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle>EPB Close-out Date</CardTitle>
              <CardDescription>
                Static close-out date for your rank
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Set your rank above to see your EPB close-out date.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full flex items-center justify-center bg-primary/10">
            <Calendar className="size-5 text-primary" />
          </div>
          <div>
            <CardTitle>EPB Close-out Date</CardTitle>
            <CardDescription>
              Static close-out date for {rank}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Submission deadline display (60 days before closeout) */}
        {submissionDeadline && (
          <div className={`flex items-center justify-between p-4 rounded-lg border ${
            daysUntilSubmission !== null && daysUntilSubmission <= 14 
              ? "bg-amber-500/10 border-amber-500/30" 
              : daysUntilSubmission !== null && daysUntilSubmission <= 0 
                ? "bg-destructive/10 border-destructive/30"
                : "bg-primary/5 border-primary/20"
          }`}>
            <div>
              <p className="text-sm text-muted-foreground">EPB draft due to immediate supervisor</p>
              <p className="text-2xl font-bold">
                {submissionDeadline.toLocaleDateString("en-US", { month: "long", day: "numeric" })}, {submissionDeadline.getFullYear()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">60 days before close-out</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 justify-end text-foreground">
                <Clock className="size-4" />
                <span className="text-sm font-medium">
                  {daysUntilSubmission !== null ? (
                    daysUntilSubmission === 0 ? "Today!" : 
                    daysUntilSubmission === 1 ? "Tomorrow" :
                    daysUntilSubmission < 0 ? `${Math.abs(daysUntilSubmission)} days overdue` :
                    `${daysUntilSubmission} days`
                  ) : "—"}
                </span>
              </div>
              <p className="text-xs mt-0.5 opacity-80">
                {daysUntilSubmission !== null && daysUntilSubmission > 0 ? "until deadline" : daysUntilSubmission === 0 ? "" : "past deadline"}
              </p>
            </div>
          </div>
        )}

        {/* Close-out date display */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
          <div>
            <p className="text-sm text-muted-foreground">Official Close-out Date</p>
            <p className="text-xl font-semibold">
              {closeout.label}, {closeout.date.getFullYear()}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end text-foreground">
              <Clock className="size-4" />
              <span className="text-sm font-medium">
                {daysUntil !== null ? (
                  daysUntil === 0 ? "Today!" : 
                  daysUntil === 1 ? "Tomorrow" :
                  daysUntil < 0 ? `${Math.abs(daysUntil)} days ago` :
                  `${daysUntil} days`
                ) : "—"}
              </span>
            </div>
            <p className="text-xs mt-0.5 opacity-80">
              {daysUntil !== null && daysUntil > 0 ? "until close-out" : daysUntil === 0 ? "" : "since close-out"}
            </p>
          </div>
        </div>

        {/* Cycle progress */}
        {cycleProgress !== null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Performance Cycle Progress</span>
              <span className="font-medium">{Math.round(cycleProgress)}%</span>
            </div>
            <Progress value={cycleProgress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {cycleProgress < 25 ? "Early in your cycle—great time to start logging entries!" :
               cycleProgress < 50 ? "Good progress—keep adding accomplishments throughout the year." :
               cycleProgress < 75 ? "Past the halfway point—ensure all major accomplishments are logged." :
               cycleProgress < 90 ? "Approaching close-out—finalize your entries soon." :
               "Close-out approaching—submit your EPB to your supervisor!"}
            </p>
          </div>
        )}

        {/* Info about dates */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
          <p><strong>Note:</strong> These are the official AF static dates for your rank tier.</p>
          <p>Have your EPB draft ready and submitted to your immediate supervisor 60 days before close-out so they can begin the review and editing process up the chain.</p>
        </div>
      </CardContent>
    </Card>
  );
}


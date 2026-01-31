import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ProfileData {
  full_name: string | null;
  rank: string | null;
}

// Rate limiting: Simple in-memory store (in production, use Redis)
const emailRateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_EMAILS_PER_HOUR = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = emailRateLimits.get(userId);
  
  if (!record || now > record.resetAt) {
    emailRateLimits.set(userId, { count: 1, resetAt: now + 3600000 }); // 1 hour
    return true;
  }
  
  if (record.count >= MAX_EMAILS_PER_HOUR) {
    return false;
  }
  
  record.count++;
  return true;
}

// POST: Send review link via email
// NOTE: This is a stub for user to integrate their email service (SendGrid/Twilio)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check rate limit
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Maximum 10 emails per hour." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const {
      tokenId,
      recipientEmail,
      reviewUrl,
      rateeName,
      rateeRank,
      mentorLabel,
      expiresAt,
    } = body;

    // Validate required fields
    if (!tokenId || !recipientEmail || !reviewUrl) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Get user's profile for sender name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, rank")
      .eq("id", user.id)
      .single() as { data: ProfileData | null; error: unknown };

    const senderName = profile?.full_name || "A MyEPBuddy user";
    const senderRank = profile?.rank || "";

    // Prepare email data
    const emailData = {
      to: recipientEmail,
      subject: `${senderRank} ${senderName} requested your feedback on their EPB`,
      senderName: `${senderRank} ${senderName}`.trim(),
      rateeName,
      rateeRank,
      mentorLabel,
      reviewUrl,
      expiresAt: new Date(expiresAt).toLocaleString(),
    };

    // =========================================================================
    // TODO: User integrates their email service here
    // =========================================================================
    // 
    // Example with SendGrid:
    // 
    // import sgMail from "@sendgrid/mail";
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
    // 
    // await sgMail.send({
    //   to: emailData.to,
    //   from: process.env.SENDGRID_FROM_EMAIL!,
    //   subject: emailData.subject,
    //   html: `
    //     <h2>EPB Feedback Request</h2>
    //     <p>Hi ${emailData.mentorLabel || "there"},</p>
    //     <p>${emailData.senderName} has requested your feedback on their 
    //        Enlisted Performance Brief (EPB) for ${emailData.rateeRank} ${emailData.rateeName}.</p>
    //     <p><a href="${emailData.reviewUrl}">Click here to review and provide feedback</a></p>
    //     <p>This link expires on ${emailData.expiresAt}.</p>
    //     <hr>
    //     <p><small>MyEPBuddy - EPB Writing Assistant</small></p>
    //   `,
    // });
    //
    // Example with Twilio SendGrid:
    // Similar to above, just use Twilio's SendGrid SDK
    //
    // =========================================================================

    // For now, we'll simulate success and log the email data
    console.log("Email would be sent:", emailData);

    // Update the token with email info
    const { error: updateError } = await supabase
      .from("review_tokens")
      .update({
        recipient_email: recipientEmail,
        email_sent_at: new Date().toISOString(),
      } as never)
      .eq("id", tokenId)
      .eq("created_by", user.id);

    if (updateError) {
      console.error("Update token error:", updateError);
      // Don't fail the request, email was "sent"
    }

    // Return success with a note that email service needs configuration
    return NextResponse.json({
      success: true,
      message: "Email service not configured. Please integrate SendGrid or Twilio.",
      emailData, // Return data so frontend can show what would be sent
    });
  } catch (error) {
    console.error("Send email error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

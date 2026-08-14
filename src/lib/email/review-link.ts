import { escapeHtml } from "@/lib/email/html-safe";

export type ReviewShellType = "epb" | "award" | "decoration";

export type BuildReviewLinkEmailParams = {
  siteUrl: string;
  senderDisplayName: string;
  rateeName: string;
  rateeRank?: string | null;
  mentorLabel?: string | null;
  reviewUrl: string;
  expiresAt: string;
  shellType: ReviewShellType;
};

export type ReviewLinkEmailContent = {
  subject: string;
  html: string;
  text: string;
};

const SHELL_LABELS: Record<ReviewShellType, string> = {
  epb: "Enlisted Performance Brief (EPB)",
  award: "award package",
  decoration: "decoration package",
};

const SHELL_SHORT: Record<ReviewShellType, string> = {
  epb: "EPB",
  award: "award",
  decoration: "decoration",
};

/**
 * Dark-themed MyEPBuddy review-request email (matches managed-member invite chrome).
 */
export function buildReviewLinkEmail(
  params: BuildReviewLinkEmailParams
): ReviewLinkEmailContent {
  const {
    siteUrl,
    senderDisplayName,
    rateeName,
    rateeRank,
    mentorLabel,
    reviewUrl,
    expiresAt,
    shellType,
  } = params;

  const shellLabel = SHELL_LABELS[shellType] ?? SHELL_LABELS.epb;
  const shellShort = SHELL_SHORT[shellType] ?? "EPB";
  const rateeDisplay = [rateeRank?.trim(), rateeName.trim()]
    .filter(Boolean)
    .join(" ");
  const greetingName = mentorLabel?.trim() || "there";

  const subject = `${senderDisplayName} requested your feedback on their ${shellShort}`;

  const safeSender = escapeHtml(senderDisplayName);
  const safeGreeting = escapeHtml(greetingName);
  const safeRatee = escapeHtml(rateeDisplay || rateeName);
  const safeShell = escapeHtml(shellLabel);
  const safeExpires = escapeHtml(expiresAt);
  const hrefReviewUrl = escapeHtml(reviewUrl);
  const logoUrl = escapeHtml(`${siteUrl.replace(/\/$/, "")}/icon.svg`);

  const textBody = [
    `Hi ${greetingName},`,
    "",
    `${senderDisplayName} has requested your feedback on their ${shellLabel} for ${rateeDisplay || rateeName}.`,
    "",
    `Open the review link:`,
    reviewUrl,
    "",
    `This link expires on ${expiresAt}.`,
    "",
    "If you weren't expecting this, you can safely ignore this email.",
    "",
    "MyEPBuddy - Your AI-Powered EPB Writing Assistant",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #141414; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #141414;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1f1f1f; border-radius: 12px; border: 1px solid #2e2e2e;">
          <tr>
            <td align="center" style="padding: 32px 40px 24px;">
              <img src="${logoUrl}" alt="MyEPBuddy" width="48" height="48" style="display: block;">
              <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #fafafa;">MyEPBuddy</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #fafafa; text-align: center;">
                Feedback requested
              </h2>
              <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                Hi ${safeGreeting},
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                <strong style="color:#fafafa;">${safeSender}</strong> has requested your feedback on their
                ${safeShell} for <strong style="color:#fafafa;">${safeRatee}</strong>.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${hrefReviewUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Review &amp; provide feedback
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3; text-align: center;">
                Or copy and paste this link:
              </p>
              <p style="margin: 0 0 16px; font-size: 12px; color: #818cf8; text-align: center; word-break: break-all;">
                ${hrefReviewUrl}
              </p>
              <p style="margin: 0; font-size: 13px; color: #6b6b6b; text-align: center;">
                This link expires on ${safeExpires}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #2e2e2e;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                If you weren&#039;t expecting this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #2e2e2e;">
              <p style="margin: 0; font-size: 12px; color: #6b6b6b; text-align: center;">
                MyEPBuddy - Your AI-Powered EPB Writing Assistant
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: textBody };
}

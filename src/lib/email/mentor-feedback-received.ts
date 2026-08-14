import { escapeHtml } from "@/lib/email/html-safe";
import type { ReviewShellType } from "@/lib/email/review-link";

export type BuildMentorFeedbackReceivedEmailParams = {
  siteUrl: string;
  recipientName: string | null;
  reviewerName: string;
  rateeName: string;
  rateeRank?: string | null;
  shellType: ReviewShellType;
  commentCount: number;
  appPath?: string;
};

export type MentorFeedbackReceivedEmailContent = {
  subject: string;
  html: string;
  text: string;
};

const SHELL_SHORT: Record<ReviewShellType, string> = {
  epb: "EPB",
  award: "award",
  decoration: "decoration",
};

/**
 * Notify the package owner that a mentor submitted review feedback (Resend).
 */
export function buildMentorFeedbackReceivedEmail(
  params: BuildMentorFeedbackReceivedEmailParams
): MentorFeedbackReceivedEmailContent {
  const {
    siteUrl,
    recipientName,
    reviewerName,
    rateeName,
    rateeRank,
    shellType,
    commentCount,
    appPath = "/generate",
  } = params;

  const shellShort = SHELL_SHORT[shellType] ?? "EPB";
  const rateeDisplay = [rateeRank?.trim(), rateeName.trim()]
    .filter(Boolean)
    .join(" ");
  const greeting = recipientName?.trim() || "there";
  const commentLabel =
    commentCount === 1 ? "1 comment" : `${commentCount} comments`;

  const subject = `${reviewerName} left feedback on your ${shellShort}`;

  const ctaUrl = `${siteUrl.replace(/\/$/, "")}${appPath.startsWith("/") ? appPath : `/${appPath}`}`;
  const hrefCtaUrl = escapeHtml(ctaUrl);
  const logoUrl = escapeHtml(`${siteUrl.replace(/\/$/, "")}/icon.svg`);
  const safeGreeting = escapeHtml(greeting);
  const safeReviewer = escapeHtml(reviewerName);
  const safeRatee = escapeHtml(rateeDisplay || rateeName);
  const safeShell = escapeHtml(shellShort);
  const safeCount = escapeHtml(commentLabel);

  const textBody = [
    `Hi ${greeting},`,
    "",
    `${reviewerName} submitted feedback on your ${shellShort} for ${rateeDisplay || rateeName} (${commentLabel}).`,
    "",
    `Open MyEPBuddy to review it:`,
    ctaUrl,
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
                New feedback
              </h2>
              <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                Hi ${safeGreeting},
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                <strong style="color:#fafafa;">${safeReviewer}</strong> submitted
                <strong style="color:#fafafa;">${safeCount}</strong> on your
                ${safeShell} for <strong style="color:#fafafa;">${safeRatee}</strong>.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${hrefCtaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Review feedback
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; color: #6b6b6b; text-align: center;">
                Or open MyEPBuddy and check Get Feedback on this package.
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

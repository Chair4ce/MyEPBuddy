import { escapeHtml } from "@/lib/email/html-safe";
import {
  buildManagedInviteLoginPath,
  buildManagedInviteSignupPath,
} from "@/lib/managed-member-invite-params";

export type ManagedMemberInviteVariant = "new_user" | "existing_user";

export type BuildManagedMemberInviteEmailParams = {
  siteUrl: string;
  recipientEmail: string;
  recipientName: string | null;
  supervisorDisplayName: string;
  teamMemberId?: string | null;
  inviteToken?: string | null;
  variant: ManagedMemberInviteVariant;
};

export type ManagedMemberInviteEmailContent = {
  subject: string;
  html: string;
  text: string;
};

export function buildManagedInviteCtaUrl(
  siteUrl: string,
  variant: ManagedMemberInviteVariant,
  email: string,
  supervisorDisplayName: string,
  teamMemberId?: string | null,
  inviteToken?: string | null
): string {
  const base = siteUrl.replace(/\/$/, "");
  const path =
    variant === "existing_user"
      ? buildManagedInviteLoginPath({
          email,
          supervisorName: supervisorDisplayName,
          teamMemberId,
          token: inviteToken,
        })
      : buildManagedInviteSignupPath({
          email,
          supervisorName: supervisorDisplayName,
          teamMemberId,
          token: inviteToken,
        });
  return `${base}${path}`;
}

/**
 * Dark-themed MyEPBuddy invite matching supabase/templates/invite.html,
 * personalized for managed-account / supervisor invitations.
 */
export function buildManagedMemberInviteEmail(
  params: BuildManagedMemberInviteEmailParams
): ManagedMemberInviteEmailContent {
  const {
    siteUrl,
    recipientEmail,
    recipientName,
    supervisorDisplayName,
    teamMemberId,
    inviteToken,
    variant,
  } = params;

  const ctaUrl = buildManagedInviteCtaUrl(
    siteUrl,
    variant,
    recipientEmail,
    supervisorDisplayName,
    teamMemberId,
    inviteToken
  );
  const safeSupervisor = escapeHtml(supervisorDisplayName);
  const safeRecipientName = escapeHtml(
    recipientName?.trim() || "there"
  );
  // href must entity-encode &, but the visible copy/paste URL must stay raw.
  const hrefCtaUrl = escapeHtml(ctaUrl);
  const logoUrl = escapeHtml(
    `${siteUrl.replace(/\/$/, "")}/icon.svg`
  );

  const isExisting = variant === "existing_user";
  const subject = isExisting
    ? `${supervisorDisplayName} added you on MyEPBuddy`
    : `${supervisorDisplayName} invited you to MyEPBuddy`;

  const headline = isExisting ? "You're on a team" : "You're invited!";
  const invitedByLine = `Invited by ${supervisorDisplayName}`;
  const bodyCopy = isExisting
    ? `<strong style="color:#fafafa;">${safeSupervisor}</strong> added you as a team member on MyEPBuddy. Log in to review the request and link your account. You can use a personal email if .mil delivery is slow.`
    : `<strong style="color:#fafafa;">${safeSupervisor}</strong> invited you to join MyEPBuddy. Confirmation emails are often delayed on .mil addresses — we recommend signing up with a personal email you can check. Your invite link will still connect you to their team.`;
  const ctaLabel = isExisting ? "Log in to MyEPBuddy" : "Accept Invitation";
  const footerNote = isExisting
    ? "If you weren't expecting this, you can safely ignore this email — nothing happens until you accept in the app."
    : `Sign up with this same email so we can match you to the managed account ${supervisorDisplayName} created. If you weren't expecting this, you can safely ignore this email.`;

  const textBody = [
    `Hi ${recipientName?.trim() || "there"},`,
    "",
    invitedByLine,
    "",
    isExisting
      ? `${supervisorDisplayName} added you as a team member on MyEPBuddy. Log in to review the request and link your account:`
      : `${supervisorDisplayName} invited you to join MyEPBuddy. Create your account with this email to connect:`,
    ctaUrl,
    "",
    footerNote,
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
                ${escapeHtml(headline)}
              </h2>
              <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                Hi ${safeRecipientName},
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.5; color: #818cf8; text-align: center; font-weight: 600;">
                ${escapeHtml(invitedByLine)}
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                ${bodyCopy}
              </p>
              <div style="background-color: #141414; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px; font-size: 13px; color: #a3a3a3; font-weight: 600;">What you'll get:</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding: 6px 0;">
                      <span style="color: #22c55e; margin-right: 8px;">✓</span>
                      <span style="color: #a3a3a3; font-size: 13px;">AI-generated EPB statements</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0;">
                      <span style="color: #22c55e; margin-right: 8px;">✓</span>
                      <span style="color: #a3a3a3; font-size: 13px;">Accomplishment tracking</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0;">
                      <span style="color: #22c55e; margin-right: 8px;">✓</span>
                      <span style="color: #a3a3a3; font-size: 13px;">Team collaboration tools</span>
                    </td>
                  </tr>
                </table>
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${hrefCtaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      ${escapeHtml(ctaLabel)}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3; text-align: center;">
                Or copy and paste this link:
              </p>
              <p style="margin: 0; font-size: 12px; color: #818cf8; text-align: center; word-break: break-all;">
                ${hrefCtaUrl}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #2e2e2e;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                ${escapeHtml(footerNote)}
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

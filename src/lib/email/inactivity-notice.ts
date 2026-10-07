import { escapeHtml } from "@/lib/email/html-safe";
import {
  formatInactivityDate,
  formatInactivityMonth,
  INACTIVITY_LOGIN_ORIGIN,
  type InactivityNoticeKind,
} from "@/lib/inactivity/schedule";

export type { InactivityNoticeKind };

export type BuildInactivityNoticeParams = {
  kind: InactivityNoticeKind;
  activityAt: string;
  suspendAt: string;
  deleteAt: string;
};

export type InactivityNoticeContent = {
  subject: string;
  html: string;
  text: string;
  ctaUrl: string;
};

const CAMPAIGN: Record<InactivityNoticeKind, string> = {
  notice_60: "inactivity-60",
  notice_30: "inactivity-30",
  suspended: "inactivity-suspended",
};

const SUPPORT_EMAIL = "JacyLH@oaiken.com";
const SETTINGS_URL = `${INACTIVITY_LOGIN_ORIGIN}/login?next=%2Fsettings`;

export function inactivityLoginUrl(kind: InactivityNoticeKind): string {
  const params = new URLSearchParams({
    next: "/dashboard",
    utm_campaign: CAMPAIGN[kind],
  });
  return `${INACTIVITY_LOGIN_ORIGIN}/login?${params.toString()}`;
}

function subjectFor(kind: InactivityNoticeKind, suspendLabel: string): string {
  if (kind === "notice_60") {
    return `Your MyEPBuddy account will be suspended on ${suspendLabel}`;
  }
  if (kind === "notice_30") {
    return `Reminder: sign in by ${suspendLabel} to keep your MyEPBuddy account`;
  }
  return "Your MyEPBuddy account was suspended for inactivity";
}

function paragraphsFor(input: {
  kind: InactivityNoticeKind;
  lastActiveLabel: string;
  suspendLabel: string;
  deleteLabel: string;
}): string[] {
  const kept =
    "Saved accomplishments, EPBs, and AI credits stay on the account while it is suspended. Signing in restores everything.";
  const deleted = `If the account is still inactive 30 days after suspension (${input.deleteLabel}), it is permanently deleted and unused AI credits are lost.`;

  if (input.kind === "suspended") {
    return [
      "Your MyEPBuddy account was suspended for inactivity.",
      `Sign in anytime before ${input.deleteLabel} to restore it.`,
      kept,
      deleted,
      "Don't need the account anymore? You don't have to do anything.",
    ];
  }

  const opening =
    input.kind === "notice_30"
      ? `This is your final reminder. We haven't seen you sign in to MyEPBuddy since ${input.lastActiveLabel}.`
      : `We haven't seen you sign in to MyEPBuddy since ${input.lastActiveLabel}.`;

  return [
    opening,
    `To keep your account active, sign in before ${input.suspendLabel}.`,
    kept,
    deleted,
    "Don't need the account anymore? You don't have to do anything. You can also delete it yourself in Settings.",
  ];
}

/**
 * Transactional inactivity notice. Same dark chrome as the other MyEPBuddy
 * mail, with no marketing footer and no unsubscribe placeholder.
 */
export function buildInactivityNoticeEmail(
  params: BuildInactivityNoticeParams
): InactivityNoticeContent {
  const suspendLabel = formatInactivityDate(params.suspendAt);
  const deleteLabel = formatInactivityDate(params.deleteAt);
  const lastActiveLabel = formatInactivityMonth(params.activityAt);
  const subject = subjectFor(params.kind, suspendLabel);
  const paragraphs = paragraphsFor({
    kind: params.kind,
    lastActiveLabel,
    suspendLabel,
    deleteLabel,
  });
  const ctaUrl = inactivityLoginUrl(params.kind);
  const hrefCtaUrl = escapeHtml(ctaUrl);
  const logoUrl = escapeHtml(`${INACTIVITY_LOGIN_ORIGIN}/icon-email.png`);
  const settingsHref = escapeHtml(SETTINGS_URL);
  const bodyHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #d4d4d4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">${escapeHtml(paragraph)}</p>`
    )
    .join("\n");

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
              <img src="${logoUrl}" alt="MyEPBuddy" width="48" height="48" style="display: block; border: 0;">
              <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">MyEPBuddy</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 8px;">
              ${bodyHtml}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="${hrefCtaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Sign in to MyEPBuddy
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #2e2e2e;">
              <p style="margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                You're receiving this because it affects your account. MyEPBuddy is an independent productivity tool and is not affiliated with, endorsed by, or connected to the United States Air Force, the Department of Defense, or any other U.S. Government entity.
              </p>
              <p style="margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                To delete the account yourself, sign in and open Settings: <a href="${settingsHref}" style="color: #818cf8; text-decoration: none;">myepbuddy.com/login</a>
              </p>
              <p style="margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                Questions? Email <a href="mailto:${SUPPORT_EMAIL}" style="color: #818cf8; text-decoration: none;">${SUPPORT_EMAIL}</a>
              </p>
              <p style="margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                Oaiken LLC<br>
                [registered street address]<br>
                [City, ST ZIP]
              </p>
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

  const text = [
    ...paragraphs,
    "",
    `Sign in to MyEPBuddy: ${ctaUrl}`,
    "",
    "You're receiving this because it affects your account. MyEPBuddy is an independent productivity tool and is not affiliated with, endorsed by, or connected to the United States Air Force, the Department of Defense, or any other U.S. Government entity.",
    "",
    `To delete the account yourself, sign in and open Settings: ${SETTINGS_URL}`,
    "",
    `Questions? Email ${SUPPORT_EMAIL}`,
    "",
    "Oaiken LLC",
    "[registered street address]",
    "[City, ST ZIP]",
    "",
    "MyEPBuddy - Your AI-Powered EPB Writing Assistant",
  ].join("\n");

  return { subject, html, text, ctaUrl };
}

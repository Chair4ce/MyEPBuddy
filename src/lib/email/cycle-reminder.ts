import { escapeHtml } from "@/lib/email/html-safe";
import {
  MARKETING_SETTINGS_URL,
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
} from "@/lib/marketing-email-opt-in";

export type CycleReminderSend = "supervisor_soon" | "chief_soon" | "catchup";

export type BuildCycleReminderEmailParams = {
  siteUrl: string;
  rank: string;
  closeoutDateLabel: string;
  send: CycleReminderSend;
  campaign?: string;
  unsubscribeUrl?: string;
};

export type CycleReminderEmailContent = {
  subject: string;
  html: string;
  text: string;
  ctaUrl: string;
};

const COPY: Record<
  CycleReminderSend,
  { subject: string; headline: (rank: string, date: string) => string }
> = {
  supervisor_soon: {
    subject: "It's time to write your EPB",
    headline: (_rank, _date) =>
      "It's time to write your EPB — due to your supervisor in 5 days.",
  },
  chief_soon: {
    subject: "Your EPB deadline is approaching",
    headline: (_rank, _date) =>
      "Reminder: your EPB is due to your chief in 15 days.",
  },
  catchup: {
    subject: "It's time to write your EPB",
    headline: (rank, date) =>
      `It's time to write your EPB — ${rank} closeout is ${date}.`,
  },
};

export function buildCycleReminderCtaUrl(
  siteUrl: string,
  campaign?: string
): string {
  const base = siteUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set("next", "/entries");
  if (campaign) {
    params.set("utm_campaign", campaign);
  }
  return `${base}/login?${params.toString()}`;
}

/**
 * Official MyEPBuddy dark email (same chrome as supabase/templates).
 * CTA: Generate my EPB → login, then /entries.
 */
export function buildCycleReminderEmail(
  params: BuildCycleReminderEmailParams
): CycleReminderEmailContent {
  const siteUrl = params.siteUrl.replace(/\/$/, "");
  const copy = COPY[params.send];
  const headline = copy.headline(params.rank, params.closeoutDateLabel);
  const ctaUrl = buildCycleReminderCtaUrl(siteUrl, params.campaign);
  const hrefCtaUrl = escapeHtml(ctaUrl);
  const logoUrl = escapeHtml(`${siteUrl}/icon-email.png`);
  const unsubscribeUrl = params.unsubscribeUrl ?? RESEND_UNSUBSCRIBE_PLACEHOLDER;
  const settingsUrl = escapeHtml(MARKETING_SETTINGS_URL);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(copy.subject)}</title>
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
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #fafafa; text-align: center; line-height: 1.4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                ${escapeHtml(headline)}
              </h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 8px;">
                    <a href="${hrefCtaUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                      Generate my EPB
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 32px; border-top: 1px solid #2e2e2e;">
              <p style="margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                This is a product update from MyEPBuddy. MyEPBuddy is an independent productivity tool and is not affiliated with, endorsed by, or connected to the United States Air Force, the Department of Defense, or any other U.S. Government entity.
              </p>
              <p style="margin: 0 0 12px; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                To stop these emails, log in at <a href="${settingsUrl}" style="color: #818cf8; text-decoration: none;">${settingsUrl.replace("https://", "")}</a>, open Email preferences, and turn off EPB cycle reminders. You can also <a href="${unsubscribeUrl}" style="color: #818cf8; text-decoration: none;">unsubscribe</a>.
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
    headline,
    "",
    `Generate my EPB: ${ctaUrl}`,
    "",
    "This is a product update from MyEPBuddy. MyEPBuddy is an independent productivity tool and is not affiliated with, endorsed by, or connected to the United States Air Force, the Department of Defense, or any other U.S. Government entity.",
    "",
    `To stop these emails, log in at ${MARKETING_SETTINGS_URL}, open Email preferences, and turn off EPB cycle reminders. You can also unsubscribe: ${unsubscribeUrl}`,
    "",
    "Oaiken LLC",
    "[registered street address]",
    "[City, ST ZIP]",
    "",
    "MyEPBuddy - Your AI-Powered EPB Writing Assistant",
  ].join("\n");

  return { subject: copy.subject, html, text, ctaUrl };
}

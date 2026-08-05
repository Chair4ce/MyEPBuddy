# Supabase Auth Email Templates

Custom dark-themed email templates for MyEPBuddy using the app's branding.

## Color Palette (Dark Theme)

| Color | Hex | Usage |
|-------|-----|-------|
| Background | `#141414` | Main email background |
| Card | `#1f1f1f` | Content card background |
| Card Border | `#2e2e2e` | Subtle borders |
| Primary | `#818cf8` | Buttons, links (indigo) |
| Primary Hover | `#6366f1` | Button hover state |
| Text | `#fafafa` | Main text color |
| Muted Text | `#a3a3a3` | Secondary/helper text |
| Success | `#22c55e` | Success messages |
| Warning | `#f59e0b` | Warning messages |

---

## Template Variables Reference

| Variable | Description | Templates |
|----------|-------------|-----------|
| `{{ .ConfirmationURL }}` | Full confirmation link | All |
| `{{ .Token }}` | OTP code (6 digits) | Magic Link, Recovery |
| `{{ .TokenHash }}` | Hashed token for custom URLs | All |
| `{{ .SiteURL }}` | Your app's site URL | All |
| `{{ .Email }}` | User's email address | All |
| `{{ .NewEmail }}` | New email (for email change) | Email Change |
| `{{ .RedirectTo }}` | Redirect URL after confirm | All |
| `{{ .Data }}` | User metadata (e.g., `{{ .Data.full_name }}`) | All |

---

## 1. Confirm Signup Email

**Subject:** `Confirm your MyEPBuddy account`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your MyEPBuddy account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #141414; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #141414;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1f1f1f; border-radius: 12px; border: 1px solid #2e2e2e;">
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px;">
              <img src="{{ .SiteURL }}/icon.svg" alt="MyEPBuddy" width="48" height="48" style="display: block;">
              <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #fafafa;">MyEPBuddy</h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #fafafa; text-align: center;">
                Welcome! Confirm your email
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                Thanks for signing up for MyEPBuddy. Click the button below to confirm your email address and activate your account.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Confirm Email Address
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3; text-align: center;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-size: 12px; color: #818cf8; text-align: center; word-break: break-all;">
                {{ .ConfirmationURL }}
              </p>
            </td>
          </tr>
          
          <!-- Security Notice -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #2e2e2e;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                This link expires in 24 hours. If you didn't create an account with MyEPBuddy, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
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
</html>
```

---

## 2. Magic Link / Passwordless Login Email

**Subject:** `Sign in to MyEPBuddy`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to MyEPBuddy</title>
</head>
<body style="margin: 0; padding: 0; background-color: #141414; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #141414;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1f1f1f; border-radius: 12px; border: 1px solid #2e2e2e;">
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px;">
              <img src="{{ .SiteURL }}/icon.svg" alt="MyEPBuddy" width="48" height="48" style="display: block;">
              <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #fafafa;">MyEPBuddy</h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #fafafa; text-align: center;">
                Sign in to your account
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                Click the button below to sign in to your MyEPBuddy account. This magic link will expire in 1 hour.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Sign In to MyEPBuddy
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- OTP Code (Optional) -->
              <div style="background-color: #141414; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3;">
                  Or enter this code manually:
                </p>
                <p style="margin: 0; font-size: 32px; font-weight: 700; color: #fafafa; letter-spacing: 8px; font-family: 'JetBrains Mono', monospace;">
                  {{ .Token }}
                </p>
              </div>
              
              <!-- Alternative Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3; text-align: center;">
                Or copy and paste this link:
              </p>
              <p style="margin: 0; font-size: 12px; color: #818cf8; text-align: center; word-break: break-all;">
                {{ .ConfirmationURL }}
              </p>
            </td>
          </tr>
          
          <!-- Security Notice -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #2e2e2e;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                If you didn't request this sign-in link, you can safely ignore this email. Someone may have entered your email by mistake.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
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
</html>
```

---

## 3. Password Reset Email

**Subject:** `Reset your MyEPBuddy password`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your MyEPBuddy password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #141414; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #141414;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1f1f1f; border-radius: 12px; border: 1px solid #2e2e2e;">
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px;">
              <img src="{{ .SiteURL }}/icon.svg" alt="MyEPBuddy" width="48" height="48" style="display: block;">
              <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #fafafa;">MyEPBuddy</h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #fafafa; text-align: center;">
                Reset your password
              </h2>
              <p style="margin: 0 0 8px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                We received a request to reset the password for your account:
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; font-weight: 600; color: #fafafa; text-align: center;">
                {{ .Email }}
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- OTP Code -->
              <div style="background-color: #141414; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3;">
                  Or use this verification code:
                </p>
                <p style="margin: 0; font-size: 32px; font-weight: 700; color: #fafafa; letter-spacing: 8px; font-family: 'JetBrains Mono', monospace;">
                  {{ .Token }}
                </p>
              </div>
              
              <!-- Alternative Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3; text-align: center;">
                Or copy and paste this link:
              </p>
              <p style="margin: 0; font-size: 12px; color: #818cf8; text-align: center; word-break: break-all;">
                {{ .ConfirmationURL }}
              </p>
            </td>
          </tr>
          
          <!-- Security Notice -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #2e2e2e;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="24" valign="top" style="padding-right: 12px;">
                    <span style="color: #f59e0b; font-size: 18px;">⚠️</span>
                  </td>
                  <td>
                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a3a3a3;">
                      <strong style="color: #f59e0b;">Security notice:</strong> This link expires in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you're concerned about your account security.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
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
</html>
```

---

## 4. Change Email Address Email

**Subject:** `Confirm your new email address`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your new email address</title>
</head>
<body style="margin: 0; padding: 0; background-color: #141414; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #141414;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1f1f1f; border-radius: 12px; border: 1px solid #2e2e2e;">
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px;">
              <img src="{{ .SiteURL }}/icon.svg" alt="MyEPBuddy" width="48" height="48" style="display: block;">
              <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #fafafa;">MyEPBuddy</h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #fafafa; text-align: center;">
                Confirm your new email
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                You requested to change your email address. Click the button below to confirm your new email.
              </p>
              
              <!-- Email Change Info -->
              <div style="background-color: #141414; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding: 8px 0;">
                      <p style="margin: 0; font-size: 12px; color: #6b6b6b; text-transform: uppercase; letter-spacing: 0.5px;">Current email</p>
                      <p style="margin: 4px 0 0; font-size: 14px; color: #a3a3a3;">{{ .Email }}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0;">
                      <p style="margin: 0; font-size: 12px; color: #6b6b6b; text-transform: uppercase; letter-spacing: 0.5px;">New email</p>
                      <p style="margin: 4px 0 0; font-size: 14px; color: #22c55e; font-weight: 600;">{{ .NewEmail }}</p>
                    </td>
                  </tr>
                </table>
              </div>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Confirm New Email
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3; text-align: center;">
                Or copy and paste this link:
              </p>
              <p style="margin: 0; font-size: 12px; color: #818cf8; text-align: center; word-break: break-all;">
                {{ .ConfirmationURL }}
              </p>
            </td>
          </tr>
          
          <!-- Security Notice -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #2e2e2e;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="24" valign="top" style="padding-right: 12px;">
                    <span style="color: #f59e0b; font-size: 18px;">⚠️</span>
                  </td>
                  <td>
                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a3a3a3;">
                      <strong style="color: #f59e0b;">Didn't request this?</strong> If you didn't request an email change, please secure your account immediately by resetting your password.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
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
</html>
```

---

## 5. Invite User Email

**Subject:** `You've been invited to MyEPBuddy`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been invited to MyEPBuddy</title>
</head>
<body style="margin: 0; padding: 0; background-color: #141414; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #141414;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1f1f1f; border-radius: 12px; border: 1px solid #2e2e2e;">
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px;">
              <img src="{{ .SiteURL }}/icon.svg" alt="MyEPBuddy" width="48" height="48" style="display: block;">
              <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #fafafa;">MyEPBuddy</h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #fafafa; text-align: center;">
                You're invited!
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                You've been invited to join MyEPBuddy, the AI-powered EPB writing assistant. Click the button below to accept the invitation and create your account.
              </p>
              
              <!-- Feature Highlights -->
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
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 8px 0 24px;">
                    <a href="{{ .ConfirmationURL }}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #818cf8; color: #1f1f1f; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Alternative Link -->
              <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3; text-align: center;">
                Or copy and paste this link:
              </p>
              <p style="margin: 0; font-size: 12px; color: #818cf8; text-align: center; word-break: break-all;">
                {{ .ConfirmationURL }}
              </p>
            </td>
          </tr>
          
          <!-- Security Notice -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #2e2e2e;">
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #6b6b6b; text-align: center;">
                This invitation expires in 7 days. If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
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
</html>
```

---

## 6. Reauthentication Email (MFA/Sensitive Actions)

**Subject:** `Verify it's you - MyEPBuddy`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify it's you</title>
</head>
<body style="margin: 0; padding: 0; background-color: #141414; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #141414;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 480px; background-color: #1f1f1f; border-radius: 12px; border: 1px solid #2e2e2e;">
          <!-- Logo Header -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px;">
              <img src="{{ .SiteURL }}/icon.svg" alt="MyEPBuddy" width="48" height="48" style="display: block;">
              <h1 style="margin: 16px 0 0; font-size: 24px; font-weight: 600; color: #fafafa;">MyEPBuddy</h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #fafafa; text-align: center;">
                Verify it's you
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #a3a3a3; text-align: center;">
                We need to verify your identity to complete a sensitive action on your account. Enter the code below in the app.
              </p>
              
              <!-- OTP Code -->
              <div style="background-color: #141414; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #a3a3a3;">
                  Your verification code:
                </p>
                <p style="margin: 0; font-size: 36px; font-weight: 700; color: #fafafa; letter-spacing: 8px; font-family: 'JetBrains Mono', monospace;">
                  {{ .Token }}
                </p>
                <p style="margin: 12px 0 0; font-size: 12px; color: #6b6b6b;">
                  Code expires in 5 minutes
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Security Notice -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid #2e2e2e;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="24" valign="top" style="padding-right: 12px;">
                    <span style="color: #ef4444; font-size: 18px;">🔒</span>
                  </td>
                  <td>
                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #a3a3a3;">
                      <strong style="color: #ef4444;">Security alert:</strong> If you didn't request this code, someone may be trying to access your account. Please change your password immediately.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
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
</html>
```

---

## How to Apply These Templates

### Dashboard Method

1. Go to **Supabase Dashboard** > **Authentication** > **Email Templates**
2. Select the template type (Confirm signup, Magic Link, etc.)
3. Update the **Subject** field
4. Paste the HTML into the **Body** field
5. Click **Save**

### Local Development (config.toml)

For local development, you can customize templates in your `supabase/config.toml`:

```toml
[auth.email.template.confirmation]
subject = "Confirm your MyEPBuddy account"
content_path = "./supabase/templates/confirmation.html"

[auth.email.template.magic_link]
subject = "Sign in to MyEPBuddy"
content_path = "./supabase/templates/magic_link.html"

[auth.email.template.recovery]
subject = "Reset your MyEPBuddy password"
content_path = "./supabase/templates/recovery.html"

[auth.email.template.email_change]
subject = "Confirm your new email address"
content_path = "./supabase/templates/email_change.html"

[auth.email.template.invite]
subject = "You've been invited to MyEPBuddy"
content_path = "./supabase/templates/invite.html"
```

Then create the template files in `supabase/templates/`.

---

## Multi-environment / Preview Deployments (Vercel)

The token-hash templates (**Magic Link**, **Confirm Signup**, **Password Reset**)
must **not** hardcode `{{ .SiteURL }}` for the confirmation link. `{{ .SiteURL }}`
is the single, fixed project Site URL (production), so a link requested from a
Vercel preview deployment would still point at production.

Instead, base the link on `{{ .RedirectTo }}` (the per-request origin the client
passes as `emailRedirectTo` / `redirectTo`) and fall back to `{{ .SiteURL }}`:

```html
<!-- Magic Link -->
<a href="{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}{{ .SiteURL }}{{ end }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard">Sign In</a>

<!-- Confirm Signup -->
<a href="{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}{{ .SiteURL }}{{ end }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard">Confirm Email</a>

<!-- Password Reset -->
<a href="{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}{{ .SiteURL }}{{ end }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a>
```

The client passes the **origin only** (e.g. `https://<preview>.vercel.app`) as
`emailRedirectTo` — see `getAuthEmailRedirectBase()` in
`src/lib/auth/email-redirect.ts` — and the template appends `/auth/confirm?...`.
The canonical templates live in `supabase/templates/*.html`.

For `{{ .RedirectTo }}` to be honored, the origin must be allow-listed:

1. **Supabase Dashboard → Authentication → URL Configuration**
   - **Site URL:** keep production (`https://www.myepbuddy.com`). Wildcards are
     not allowed here and it is only used as the fallback.
   - **Redirect URLs:** add wildcards (one entry each, not one per branch):
     - `https://*-oaiken-projects.vercel.app`
     - `https://*-oaiken-projects.vercel.app/**` (covers pathed redirects such as
       the Google OAuth `/auth/callback`)
     - keep `https://www.myepbuddy.com/**` (and `https://myepbuddy.com/**` if used)
   - A `*` matches across hyphens but not `.`/`/`, so the wildcard covers both the
     `...-git-<branch>-...` and `...-<hash>-...` preview host forms.
   - **Security:** scope the wildcard to your Vercel team domain
     (`-oaiken-projects.vercel.app`). Do **not** use a bare
     `https://*.vercel.app/**`, which would allow any Vercel app as a redirect
     target (open-redirect risk).
2. **Supabase Dashboard → Authentication → Email Templates:** paste the updated
   Magic Link / Confirm Signup / Reset Password bodies above. The hosted project's
   templates are separate from `supabase/config.toml` (which only configures the
   local stack), so this dashboard step is required for preview/production.

---

## Important Notes

1. **Logo URL**: The templates use `{{ .SiteURL }}/icon.svg`. Make sure your logo is publicly accessible.

2. **Email Prefetching**: Some email providers (Microsoft, etc.) prefetch links, which can invalidate tokens. Consider:
   - Using OTP codes (`{{ .Token }}`) as primary method
   - Or building custom confirmation pages that require user action

3. **Token Expiry**: Configure appropriate expiry times in Supabase settings:
   - Signup confirmation: 24 hours
   - Magic link: 1 hour
   - Password reset: 1 hour
   - Email change: 24 hours

4. **Testing**: Always test emails in multiple clients (Gmail, Outlook, Apple Mail) to ensure rendering consistency.

# Comprehensive Application Security Checklist

A detailed security audit checklist for web applications, with emphasis on Next.js, React, and Supabase stacks. This checklist covers vulnerabilities that are **not automatically handled** by common frameworks.

---

## Table of Contents

1. [Authentication Security](#1-authentication-security)
2. [Authorization & Access Control](#2-authorization--access-control)
3. [Database Security](#3-database-security)
4. [API Security](#4-api-security)
5. [Input Validation & Sanitization](#5-input-validation--sanitization)
6. [Session Management](#6-session-management)
7. [Cryptography & Secrets](#7-cryptography--secrets)
8. [HTTP Security Headers](#8-http-security-headers)
9. [Error Handling & Logging](#9-error-handling--logging)
10. [File Upload Security](#10-file-upload-security)
11. [Third-Party Dependencies](#11-third-party-dependencies)
12. [Infrastructure Security](#12-infrastructure-security)
13. [Client-Side Security](#13-client-side-security)
14. [Real-time & WebSocket Security](#14-real-time--websocket-security)
15. [Edge Functions & Serverless](#15-edge-functions--serverless)
16. [Compliance & Privacy](#16-compliance--privacy)

---

## 1. Authentication Security

### 1.1 Login Protection

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Rate limiting on login endpoints (max 5-10 attempts per 15 min) | ☐ | HIGH | Prevents brute force attacks |
| Account lockout after failed attempts (temporary, not permanent) | ☐ | HIGH | 15-30 min lockout recommended |
| CAPTCHA/challenge after 3+ failed attempts | ☐ | MEDIUM | Prevents automated attacks |
| Login attempt logging with IP, user agent, timestamp | ☐ | HIGH | For forensics and detection |
| Notify users of login from new device/location | ☐ | MEDIUM | User awareness |
| Block login from TOR/known proxy IPs (if appropriate) | ☐ | LOW | Context-dependent |

### 1.2 Password Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Minimum password length (8+ chars, 12+ recommended) | ☐ | HIGH | `supabase/config.toml` |
| Password complexity requirements (mixed case, numbers, symbols) | ☐ | MEDIUM | Balance security vs UX |
| Check against breached password databases (HaveIBeenPwned API) | ☐ | MEDIUM | Prevents known-weak passwords |
| No password hints stored or displayed | ☐ | HIGH | Information leakage |
| Passwords hashed with bcrypt/argon2 (not MD5/SHA1) | ☐ | CRITICAL | Supabase handles this |
| Password change requires current password | ☐ | HIGH | Prevents session hijacking abuse |

### 1.3 Password Reset Flow

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Rate limit password reset requests (1 per 60 seconds) | ☐ | HIGH | Prevents abuse/enumeration |
| Reset tokens expire quickly (15-60 minutes) | ☐ | HIGH | Limits attack window |
| Reset tokens are single-use (invalidated after use) | ☐ | HIGH | Prevents replay |
| Reset tokens are cryptographically random (256+ bits) | ☐ | HIGH | Unpredictable |
| Don't reveal if email exists ("If account exists, email sent") | ☐ | HIGH | Prevents user enumeration |
| Invalidate all sessions after password reset | ☐ | HIGH | Boots attackers out |
| Send notification email after password change | ☐ | MEDIUM | User awareness |

### 1.4 Multi-Factor Authentication (MFA)

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| MFA option available (TOTP, SMS, Email) | ☐ | HIGH | For sensitive apps |
| MFA enforced for admin/privileged accounts | ☐ | CRITICAL | High-value targets |
| Backup codes provided and stored securely | ☐ | MEDIUM | Account recovery |
| MFA bypass rate limited | ☐ | HIGH | Prevents brute force on codes |
| TOTP codes validated with time window tolerance | ☐ | MEDIUM | Handles clock drift |

### 1.5 OTP/Magic Link Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| SMS OTP expiry (5 minutes max) | ☐ | HIGH | Short window for phone codes |
| Email / magic-link OTP expiry (1 hour) | ☐ | HIGH | Shared mailer TTL; .mil delay + Menlo prefetch |
| OTP brute force protection (3 attempts max) | ☐ | HIGH | Prevents guessing |
| OTP length sufficient (6+ digits) | ☐ | MEDIUM | 6 digits = 1M combinations |
| Magic links single-use | ☐ | HIGH | Prevents forwarding attacks |
| Magic links bound to requesting IP/device (optional) | ☐ | MEDIUM | Additional protection |

### 1.6 OAuth/Social Login

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Validate `state` parameter to prevent CSRF | ☐ | CRITICAL | OAuth spec requirement |
| Validate `redirect_uri` against whitelist | ☐ | CRITICAL | Prevents token theft |
| Use PKCE for mobile/SPA OAuth flows | ☐ | HIGH | Prevents authorization code interception |
| Verify email ownership from OAuth provider | ☐ | HIGH | Prevent account linking attacks |
| Handle OAuth account linking securely | ☐ | MEDIUM | Merge vs new account logic |

---

## 2. Authorization & Access Control

### 2.1 Row Level Security (RLS)

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| RLS enabled on ALL tables containing user data | ☐ | CRITICAL | `ALTER TABLE x ENABLE ROW LEVEL SECURITY` |
| No tables with `USING (true)` for SELECT (unless intentional) | ☐ | HIGH | Public data only |
| RLS policies use `auth.uid()` not client-provided IDs | ☐ | CRITICAL | Prevents ID manipulation |
| INSERT policies have `WITH CHECK` clauses | ☐ | HIGH | Validates new data ownership |
| UPDATE policies validate both USING and WITH CHECK | ☐ | HIGH | Prevents ownership transfer attacks |
| DELETE policies are appropriately restrictive | ☐ | HIGH | Audit before allowing |
| Foreign key relationships enforced at DB level | ☐ | HIGH | Data integrity |
| Indexes on FK columns used in RLS policies | ☐ | MEDIUM | Performance |

### 2.2 Function/RPC Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| RPC functions revoke EXECUTE from `anon` role | ☐ | HIGH | Prevent enumeration |
| SECURITY DEFINER functions use `SET search_path = ''` | ☐ | CRITICAL | Prevent search path injection |
| Functions validate `auth.uid()` before operations | ☐ | HIGH | Authorization check |
| Sensitive functions are not exposed via REST API | ☐ | HIGH | Use internal-only schema |
| Function parameters are validated/sanitized | ☐ | HIGH | Input validation |

### 2.3 Role-Based Access Control

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Roles defined and documented | ☐ | HIGH | Clear permission model |
| Least privilege principle applied | ☐ | HIGH | Minimum necessary access |
| Role changes are audited | ☐ | MEDIUM | Track privilege escalation |
| Admin actions require re-authentication | ☐ | MEDIUM | Confirm identity |
| Separation of duties for critical operations | ☐ | MEDIUM | No single point of failure |

### 2.4 Horizontal/Vertical Privilege Escalation

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Users cannot access other users' resources by changing IDs | ☐ | CRITICAL | IDOR prevention |
| Users cannot escalate their own role/permissions | ☐ | CRITICAL | Role tampering |
| API doesn't trust client-provided role/permission claims | ☐ | CRITICAL | Server-side validation |
| Nested resources validate parent ownership | ☐ | HIGH | e.g., /users/1/posts/5 |

---

## 3. Database Security

### 3.1 Query Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Parameterized queries used (no string concatenation) | ☐ | CRITICAL | SQL injection prevention |
| ORM/query builder validates column names | ☐ | HIGH | Column injection |
| Dynamic ORDER BY validated against whitelist | ☐ | HIGH | Common injection vector |
| LIMIT enforced on all queries (max 1000 rows) | ☐ | HIGH | DoS prevention |
| Statement timeout configured (30s default) | ☐ | HIGH | Prevents long-running queries |
| Recursive CTEs have depth limits | ☐ | HIGH | Memory exhaustion |

### 3.2 Data Protection

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Sensitive data encrypted at rest | ☐ | HIGH | PII, financial data |
| Sensitive data encrypted in transit (TLS 1.2+) | ☐ | CRITICAL | All connections |
| API keys/secrets encrypted before storage | ☐ | CRITICAL | Not plaintext |
| PII can be exported/deleted (GDPR compliance) | ☐ | HIGH | Data portability |
| Soft delete with audit trail (not hard delete) | ☐ | MEDIUM | Forensics |
| Database backups encrypted | ☐ | HIGH | Backup security |

### 3.3 Connection Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Database not directly accessible from internet | ☐ | CRITICAL | Firewall rules |
| Connection pooling configured | ☐ | HIGH | Resource management |
| SSL required for database connections | ☐ | CRITICAL | No plaintext |
| Database credentials rotated regularly | ☐ | MEDIUM | Credential hygiene |
| Separate read/write connection strings | ☐ | LOW | Least privilege |

### 3.4 Views and Materialized Data

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Views use `security_invoker = true` | ☐ | HIGH | RLS respected |
| No SECURITY DEFINER views unless necessary | ☐ | HIGH | RLS bypass risk |
| Materialized views don't expose unauthorized data | ☐ | HIGH | Static data leak |

---

## 4. API Security

### 4.1 Rate Limiting

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Global rate limit per IP (100-1000 req/min) | ☐ | HIGH | DDoS mitigation |
| Per-user rate limit (more generous than IP) | ☐ | HIGH | Fair usage |
| Endpoint-specific limits (stricter for auth) | ☐ | HIGH | High-risk endpoints |
| Rate limit headers returned (X-RateLimit-*) | ☐ | MEDIUM | Client feedback |
| Exponential backoff on repeated violations | ☐ | MEDIUM | Progressive restriction |

### 4.2 Request Validation

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Request body size limited (1-10MB typical) | ☐ | HIGH | DoS prevention |
| Content-Type header validated | ☐ | HIGH | Unexpected format attacks |
| JSON depth limited (max 10-20 levels) | ☐ | HIGH | Stack overflow prevention |
| Array lengths limited | ☐ | HIGH | Memory exhaustion |
| String lengths limited | ☐ | HIGH | Memory exhaustion |
| Required fields validated | ☐ | HIGH | Missing data handling |

### 4.3 Response Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Sensitive data excluded from responses (passwords, keys) | ☐ | CRITICAL | Data exposure |
| Internal IDs not exposed if possible (use UUIDs) | ☐ | MEDIUM | Enumeration prevention |
| Stack traces never returned in production | ☐ | CRITICAL | Information leakage |
| Consistent error format across endpoints | ☐ | MEDIUM | Predictable behavior |
| Empty response bodies return 204 not empty 200 | ☐ | LOW | HTTP compliance |

### 4.4 CORS Configuration

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| CORS origins explicitly whitelisted (no wildcards in prod) | ☐ | HIGH | Cross-origin control |
| Credentials mode matches Access-Control-Allow-Credentials | ☐ | HIGH | Cookie handling |
| Preflight caching configured (Access-Control-Max-Age) | ☐ | LOW | Performance |
| CORS doesn't expose sensitive headers | ☐ | MEDIUM | Header leakage |

### 4.5 API Versioning & Documentation

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| API version in URL or header | ☐ | MEDIUM | Breaking change management |
| Deprecated endpoints return warnings | ☐ | LOW | Migration support |
| API version/info not leaked in errors | ☐ | MEDIUM | Fingerprinting |
| Internal API endpoints not publicly documented | ☐ | HIGH | Attack surface reduction |

---

## 5. Input Validation & Sanitization

### 5.1 XSS Prevention

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| User input HTML-escaped before rendering | ☐ | CRITICAL | XSS prevention |
| React's JSX auto-escaping not bypassed (no dangerouslySetInnerHTML) | ☐ | CRITICAL | Framework bypass |
| URL parameters validated (no javascript: protocols) | ☐ | HIGH | Link injection |
| SVG content sanitized (can contain scripts) | ☐ | HIGH | SVG XSS |
| Markdown rendered with sanitization | ☐ | HIGH | Markdown XSS |
| Rich text editors sanitize output | ☐ | HIGH | WYSIWYG XSS |

### 5.2 Injection Prevention

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| SQL injection prevented (parameterized queries) | ☐ | CRITICAL | See Database section |
| NoSQL injection prevented (object validation) | ☐ | CRITICAL | MongoDB etc. |
| Command injection prevented (no shell exec with user input) | ☐ | CRITICAL | OS command execution |
| LDAP injection prevented (if applicable) | ☐ | HIGH | Directory services |
| Email header injection prevented | ☐ | HIGH | Newlines in headers |
| Template injection prevented | ☐ | HIGH | Server-side templates |
| Path traversal prevented (../ in filenames) | ☐ | CRITICAL | File access |

### 5.3 Data Type Validation

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| UUIDs validated before database queries | ☐ | HIGH | Format validation |
| Integers within expected ranges | ☐ | HIGH | Overflow prevention |
| Dates validated and parsed safely | ☐ | MEDIUM | Date manipulation |
| Enums validated against allowed values | ☐ | HIGH | Unexpected values |
| Email addresses validated (format + MX record optional) | ☐ | MEDIUM | Valid format |
| URLs validated (protocol, format) | ☐ | HIGH | URL injection |
| Phone numbers validated | ☐ | LOW | Format consistency |

### 5.4 Business Logic Validation

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Quantity/amount fields cannot be negative | ☐ | HIGH | Logic bypass |
| Discount codes validated on server | ☐ | HIGH | Price manipulation |
| Date ranges make logical sense (start < end) | ☐ | MEDIUM | Logic errors |
| User cannot approve their own requests | ☐ | HIGH | Separation of duties |
| Transactions are atomic (all or nothing) | ☐ | HIGH | Data consistency |

---

## 6. Session Management

### 6.1 Token Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| JWT expiry short (1 hour or less) | ☐ | HIGH | Limits exposure window |
| Refresh token rotation enabled | ☐ | HIGH | Prevents token reuse |
| Refresh token reuse interval configured | ☐ | HIGH | Grace period for race conditions |
| Tokens invalidated on logout | ☐ | HIGH | True logout |
| Tokens invalidated on password change | ☐ | HIGH | Force re-auth |
| JWT signature algorithm specified (no "none") | ☐ | CRITICAL | Algorithm confusion attack |

### 6.2 Cookie Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Cookies marked HttpOnly | ☐ | HIGH | XSS mitigation |
| Cookies marked Secure (HTTPS only) | ☐ | CRITICAL | No plaintext |
| Cookies use SameSite=Lax or Strict | ☐ | HIGH | CSRF mitigation |
| Cookie domain appropriately scoped | ☐ | MEDIUM | Not too broad |
| Session cookies expire on browser close | ☐ | MEDIUM | Shared computer safety |

### 6.3 Session Fixation Prevention

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| New session ID generated on login | ☐ | HIGH | Session fixation |
| Session ID not in URL | ☐ | HIGH | Referrer leakage |
| Session bound to user agent/IP (optional, can break) | ☐ | LOW | Context-dependent |

---

## 7. Cryptography & Secrets

### 7.1 Secret Management

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Secrets not committed to git | ☐ | CRITICAL | .gitignore, git-secrets |
| Secrets in environment variables, not code | ☐ | CRITICAL | Separation |
| Different secrets for each environment | ☐ | HIGH | Isolation |
| Secrets rotated regularly (90 days) | ☐ | MEDIUM | Credential hygiene |
| Secrets manager used (Vault, AWS SM, etc.) | ☐ | MEDIUM | Centralized management |
| Old secrets immediately revoked | ☐ | HIGH | No lingering access |

### 7.2 Encryption Standards

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| AES-256-GCM or ChaCha20-Poly1305 for symmetric | ☐ | HIGH | Modern algorithms |
| RSA 2048+ or ECDSA P-256+ for asymmetric | ☐ | HIGH | Key strength |
| No MD5 or SHA1 for security purposes | ☐ | CRITICAL | Broken algorithms |
| PBKDF2/bcrypt/argon2 for password hashing | ☐ | CRITICAL | Password security |
| Unique IV/nonce for each encryption | ☐ | CRITICAL | IV reuse attacks |
| Encryption keys separate from encrypted data | ☐ | HIGH | Defense in depth |

### 7.3 API Key Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| API keys encrypted before storage | ☐ | CRITICAL | Database breach protection |
| API keys have prefix for identification (sk_live_) | ☐ | LOW | Key type clarity |
| API keys can be revoked individually | ☐ | HIGH | Granular control |
| API key scopes/permissions implemented | ☐ | MEDIUM | Least privilege |
| API keys have expiration dates | ☐ | MEDIUM | Credential hygiene |
| API key usage logged | ☐ | HIGH | Audit trail |

---

## 8. HTTP Security Headers

### 8.1 Required Headers

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| `Strict-Transport-Security` (HSTS) with max-age 1 year | ☐ | CRITICAL | Force HTTPS |
| `X-Content-Type-Options: nosniff` | ☐ | HIGH | MIME sniffing prevention |
| `X-Frame-Options: DENY` or CSP frame-ancestors | ☐ | HIGH | Clickjacking prevention |
| `X-XSS-Protection: 1; mode=block` (legacy browsers) | ☐ | MEDIUM | XSS filter |
| `Referrer-Policy: strict-origin-when-cross-origin` | ☐ | HIGH | Referrer leakage |
| `Permissions-Policy` restricting features | ☐ | MEDIUM | Feature control |

### 8.2 Content Security Policy (CSP)

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| `default-src 'self'` as baseline | ☐ | HIGH | Restrict all by default |
| `script-src` doesn't use 'unsafe-inline' in prod | ☐ | HIGH | XSS mitigation |
| `style-src` minimizes 'unsafe-inline' | ☐ | MEDIUM | Style injection |
| `img-src` whitelist appropriate domains | ☐ | MEDIUM | Image sources |
| `connect-src` restricted to known APIs | ☐ | HIGH | Exfiltration prevention |
| `frame-ancestors 'none'` or specific origins | ☐ | HIGH | Clickjacking |
| `upgrade-insecure-requests` in production | ☐ | HIGH | HTTP to HTTPS |
| CSP violation reporting configured | ☐ | LOW | Monitoring |

### 8.3 Storage Headers

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| `X-Content-Type-Options: nosniff` on file downloads | ☐ | HIGH | Prevent sniffing |
| `Content-Disposition: attachment` for downloads | ☐ | HIGH | Force download |
| `Cache-Control: private, no-store` for sensitive data | ☐ | HIGH | Prevent caching |

---

## 9. Error Handling & Logging

### 9.1 Safe Error Messages

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Generic error messages to clients | ☐ | HIGH | "An error occurred" |
| No stack traces in production responses | ☐ | CRITICAL | Information leakage |
| No SQL errors exposed to clients | ☐ | CRITICAL | Query structure leak |
| No file paths in error messages | ☐ | HIGH | Path disclosure |
| No version numbers in errors | ☐ | MEDIUM | Fingerprinting |
| Database errors mapped to generic messages | ☐ | HIGH | Internal detail hiding |

### 9.2 Logging Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Passwords never logged | ☐ | CRITICAL | Credential exposure |
| Full credit card numbers never logged | ☐ | CRITICAL | PCI compliance |
| API keys/tokens redacted in logs | ☐ | CRITICAL | Credential exposure |
| PII masked or pseudonymized in logs | ☐ | HIGH | Privacy |
| Log injection prevented (newlines escaped) | ☐ | HIGH | Log spoofing |
| Logs stored securely with access controls | ☐ | HIGH | Log confidentiality |
| Log retention policy defined | ☐ | MEDIUM | Compliance |

### 9.3 Audit Logging

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Authentication events logged | ☐ | HIGH | Login, logout, failures |
| Authorization failures logged | ☐ | HIGH | Access attempts |
| Data modifications logged (who, what, when) | ☐ | HIGH | Change tracking |
| Admin actions logged | ☐ | HIGH | Privileged actions |
| Logs include request ID for correlation | ☐ | MEDIUM | Debugging |
| Logs include user ID and IP | ☐ | HIGH | Attribution |
| Logs are immutable (append-only) | ☐ | MEDIUM | Tampering prevention |

---

## 10. File Upload Security

### 10.1 Upload Validation

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| File size limits enforced (server-side) | ☐ | HIGH | DoS prevention |
| File type validated by content (magic bytes) not extension | ☐ | CRITICAL | Extension spoofing |
| Allowed file types explicitly whitelisted | ☐ | HIGH | Deny by default |
| Filename sanitized (remove special chars, path separators) | ☐ | CRITICAL | Path traversal |
| File stored with generated name (not user-provided) | ☐ | HIGH | Name collision/injection |
| Double extensions blocked (.php.jpg) | ☐ | HIGH | Extension bypass |

### 10.2 Storage Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Files stored outside web root | ☐ | CRITICAL | Direct access prevention |
| Files served through application (not direct URLs) | ☐ | HIGH | Access control |
| Antivirus scan on upload | ☐ | MEDIUM | Malware prevention |
| Image files re-encoded (strip EXIF, malicious content) | ☐ | MEDIUM | Metadata/payload removal |
| Separate domain for user uploads (CDN) | ☐ | HIGH | XSS isolation |
| Presigned URLs for private files (time-limited) | ☐ | HIGH | Access control |

### 10.3 Download Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Authorization checked before file download | ☐ | CRITICAL | Access control |
| Content-Disposition header set | ☐ | HIGH | Force download |
| Content-Type set correctly | ☐ | HIGH | Prevent execution |
| X-Content-Type-Options: nosniff | ☐ | HIGH | Sniffing prevention |

---

## 11. Third-Party Dependencies

### 11.1 Dependency Management

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Dependencies pinned to exact versions | ☐ | HIGH | Reproducibility |
| Lock file committed (package-lock.json) | ☐ | HIGH | Version consistency |
| Regular `npm audit` / `pnpm audit` runs | ☐ | HIGH | Vulnerability detection |
| Automated dependency updates (Dependabot, Renovate) | ☐ | MEDIUM | Timely patches |
| Critical vulnerabilities addressed within 24-48 hours | ☐ | CRITICAL | Rapid response |
| Unused dependencies removed | ☐ | LOW | Attack surface |

### 11.2 Supply Chain Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Package integrity verified (checksums) | ☐ | MEDIUM | Tampering detection |
| Private registry for internal packages | ☐ | LOW | Namespace protection |
| Typosquatting check on new dependencies | ☐ | MEDIUM | Name confusion |
| Review dependency before adding | ☐ | MEDIUM | Malicious package |
| Monitor for deprecated packages | ☐ | LOW | Maintenance status |

### 11.3 Third-Party Services

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| API keys for third parties scoped minimally | ☐ | HIGH | Least privilege |
| Third-party endpoints validated | ☐ | HIGH | SSRF prevention |
| Fallback behavior when third party unavailable | ☐ | MEDIUM | Graceful degradation |
| Third-party data handling reviewed | ☐ | HIGH | Privacy compliance |
| Third-party security posture evaluated | ☐ | MEDIUM | Supply chain risk |

---

## 12. Infrastructure Security

### 12.1 TLS/HTTPS

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| TLS 1.2+ required (TLS 1.0/1.1 disabled) | ☐ | CRITICAL | Protocol security |
| Strong cipher suites only | ☐ | HIGH | Cipher security |
| Valid, non-expired SSL certificate | ☐ | CRITICAL | Trust |
| Certificate transparency monitoring | ☐ | LOW | Mis-issuance detection |
| HSTS preload list submission (for public sites) | ☐ | MEDIUM | Maximum HTTPS enforcement |
| No mixed content (HTTP resources on HTTPS page) | ☐ | HIGH | Content security |

### 12.2 DNS Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| DNSSEC enabled | ☐ | LOW | DNS spoofing prevention |
| CAA records configured | ☐ | MEDIUM | CA restriction |
| SPF, DKIM, DMARC for email domain | ☐ | HIGH | Email spoofing prevention |
| DNS records don't expose internal infrastructure | ☐ | MEDIUM | Information disclosure |

### 12.3 Network Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Firewall rules restrict unnecessary ports | ☐ | HIGH | Attack surface |
| Database not directly internet-accessible | ☐ | CRITICAL | Isolation |
| Admin interfaces on separate network/VPN | ☐ | HIGH | Access control |
| DDoS protection (Cloudflare, AWS Shield) | ☐ | MEDIUM | Availability |
| Geographic restrictions if applicable | ☐ | LOW | Context-dependent |

### 12.4 Server Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| OS and packages regularly updated | ☐ | HIGH | Patch management |
| Unnecessary services disabled | ☐ | MEDIUM | Attack surface |
| Server version headers removed/obfuscated | ☐ | MEDIUM | Fingerprinting |
| SSH key-based auth (no passwords) | ☐ | HIGH | Server access |
| Intrusion detection (fail2ban, etc.) | ☐ | MEDIUM | Attack detection |

---

## 13. Client-Side Security

### 13.1 Sensitive Data Handling

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| No sensitive data in localStorage (prefer HttpOnly cookies) | ☐ | HIGH | XSS exposure |
| Session tokens not in URL parameters | ☐ | HIGH | Referrer leakage |
| Sensitive data cleared on logout | ☐ | HIGH | Data remnants |
| No sensitive data in browser history | ☐ | MEDIUM | History leakage |
| Clipboard access requires user consent | ☐ | LOW | Clipboard hijacking |

### 13.2 JavaScript Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| No eval() or Function() with user input | ☐ | CRITICAL | Code injection |
| postMessage origin validated | ☐ | HIGH | Cross-origin messaging |
| JSON.parse() used instead of eval() | ☐ | CRITICAL | Safe parsing |
| No document.write() with user data | ☐ | HIGH | XSS vector |
| innerHTML avoided (use textContent) | ☐ | HIGH | XSS vector |
| Subresource Integrity (SRI) for CDN scripts | ☐ | MEDIUM | Tampering detection |

### 13.3 Form Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Autocomplete disabled for sensitive fields | ☐ | MEDIUM | Data leakage |
| CSRF tokens on state-changing forms | ☐ | HIGH | CSRF prevention |
| Double-submit cookie pattern if stateless | ☐ | HIGH | Alternative CSRF |
| Form action URLs validated | ☐ | HIGH | Action hijacking |
| Hidden fields not trusted for authorization | ☐ | CRITICAL | Tampering |

---

## 14. Real-time & WebSocket Security

### 14.1 WebSocket Authentication

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Authentication required before WebSocket upgrade | ☐ | CRITICAL | Access control |
| Token not passed in URL (use headers or first message) | ☐ | HIGH | Token exposure in logs |
| Re-authenticate on reconnection | ☐ | HIGH | Session validation |
| Connection-specific authorization | ☐ | HIGH | Per-resource access |

### 14.2 WebSocket Data Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Message size limits | ☐ | HIGH | DoS prevention |
| Message rate limiting | ☐ | HIGH | Spam prevention |
| Message content validated | ☐ | HIGH | Injection prevention |
| Binary messages validated if accepted | ☐ | MEDIUM | Format validation |
| Subscription authorization (can user see this channel?) | ☐ | CRITICAL | Data access control |

### 14.3 Supabase Realtime Specific

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| RLS policies apply to realtime subscriptions | ☐ | CRITICAL | Same as REST |
| Broadcast channels have authorization | ☐ | HIGH | Public broadcast risk |
| Presence shows only allowed user info | ☐ | MEDIUM | Privacy |

---

## 15. Edge Functions & Serverless

### 15.1 Function Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Request body size limited | ☐ | HIGH | Memory exhaustion |
| Execution timeout configured | ☐ | HIGH | Resource limits |
| Memory limits configured | ☐ | HIGH | DoS prevention |
| Cold start doesn't leak secrets | ☐ | MEDIUM | Initialization timing |
| Functions don't have excessive permissions | ☐ | HIGH | Least privilege |

### 15.2 Serverless Secrets

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Secrets in environment variables not code | ☐ | CRITICAL | Code exposure |
| Secrets not logged during initialization | ☐ | CRITICAL | Log exposure |
| Different secrets per function if needed | ☐ | MEDIUM | Isolation |

### 15.3 Invocation Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Public functions rate limited | ☐ | HIGH | Abuse prevention |
| Authentication validated in function | ☐ | CRITICAL | Not just at gateway |
| CORS configured appropriately | ☐ | HIGH | Cross-origin control |
| Webhook signatures verified | ☐ | HIGH | Request authenticity |

---

## 16. Compliance & Privacy

### 16.1 Data Privacy (GDPR, CCPA)

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Privacy policy exists and is accessible | ☐ | HIGH | Legal requirement |
| Cookie consent implemented | ☐ | HIGH | Cookie law |
| User can export their data | ☐ | HIGH | Data portability |
| User can delete their account/data | ☐ | HIGH | Right to erasure |
| Data processing purposes documented | ☐ | HIGH | Transparency |
| Third-party data sharing disclosed | ☐ | HIGH | Consent |
| Data retention periods defined | ☐ | MEDIUM | Minimization |

### 16.2 Security Documentation

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Security incident response plan documented | ☐ | HIGH | Incident readiness |
| Data breach notification process defined | ☐ | HIGH | Legal requirement |
| Security contact published (security.txt) | ☐ | LOW | Vulnerability reporting |
| Vulnerability disclosure policy | ☐ | MEDIUM | Researcher engagement |
| Security architecture documented | ☐ | MEDIUM | Team knowledge |

### 16.3 Operational Security

| Check | Status | Priority | Notes |
|-------|--------|----------|-------|
| Regular security audits/penetration tests | ☐ | HIGH | External validation |
| Security training for developers | ☐ | MEDIUM | Awareness |
| Access to production limited and logged | ☐ | HIGH | Least privilege |
| Secrets rotation process documented | ☐ | MEDIUM | Credential management |
| Backup and recovery tested | ☐ | HIGH | Business continuity |

---

## Quick Reference: Priority Legend

| Priority | Action Timeframe | Description |
|----------|------------------|-------------|
| CRITICAL | Immediately | Actively exploitable, major data breach risk |
| HIGH | Within 1 week | Significant security risk |
| MEDIUM | Within 1 month | Moderate risk or defense-in-depth |
| LOW | When convenient | Nice-to-have, minimal risk |

---

## Audit Log

| Date | Auditor | Sections Reviewed | Findings | Remediation Deadline |
|------|---------|-------------------|----------|---------------------|
| | | | | |
| | | | | |
| | | | | |

---

## Changelog

- **v1.0** - Initial comprehensive checklist based on security scan results and industry best practices

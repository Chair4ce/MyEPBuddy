# Supabase Security Quick Reference

A targeted security guide addressing common Supabase-specific vulnerabilities and their remediation.

---

## Original 12 Vulnerabilities - Status & Remediation

| # | Vulnerability | Severity | Category | Fix Location | Status |
|---|---------------|----------|----------|--------------|--------|
| 1 | Login Rate Limiting | HIGH | auth | Dashboard | Manual Config Required |
| 2 | OTP Brute Force | HIGH | auth | Dashboard | Manual Config Required |
| 3 | Content-Type Sniffing (Storage) | MEDIUM | storage | Dashboard + Headers | Headers Done |
| 4 | Realtime Token in URL | MEDIUM | realtime | Config | Acceptable (1hr expiry) |
| 5 | Error Message Information Leakage | MEDIUM | vibecoder | SQL + Code | Fixed |
| 6 | RPC Function Enumeration | HIGH | api | SQL | Fixed |
| 7 | Security Headers Missing | MEDIUM | api | next.config.ts | Already Done |
| 8 | API Version Information Disclosure | LOW | rls | Dashboard | Manual Config |
| 9 | Memory Exhaustion Attack | HIGH | functions | SQL | Fixed |
| 10 | TLS Downgrade Check | HIGH | api | Infrastructure | Supabase Managed |
| 11 | Credentials in Error Messages | MEDIUM | api | Code | Fixed |
| 12 | Password Reset Flow Abuse | HIGH | auth | Dashboard | Manual Config Required |

---

## Dashboard Configuration Required

These settings **cannot be configured via SQL or code** - you must set them in the Supabase Dashboard.

### Authentication > Email Settings

| Setting | Recommended Value | Purpose |
|---------|-------------------|---------|
| Enable email confirmations | ON | Prevent email enumeration |
| Secure email change | ON | Require confirmation on both emails |
| Rate limit per second | 1 | Prevent spam/enumeration |
| Mailer OTP expiry | 3600 (1 hour) | Email magic-link / confirm TTL. Not Phone OTP. 5 minutes is too short for delayed .mil mail. |

### Authentication > Security Settings

| Setting | Recommended Value | Purpose |
|---------|-------------------|---------|
| Minimum password length | 8+ (12 recommended) | Password strength |
| Rate limit token refresh | ON | Prevent token abuse |
| Refresh token reuse interval | 10 seconds | Grace period for race conditions |
| JWT expiry | 3600 (1 hour) | Limit token lifetime |

### Authentication > Rate Limits (if available)

| Setting | Recommended Value | Purpose |
|---------|-------------------|---------|
| Max login attempts | 5 per 15 minutes | Brute force protection |
| Max OTP attempts | 3 per code | OTP brute force protection |
| Password reset rate | 1 per 60 seconds | Reset abuse prevention |

### API Settings

| Setting | Recommended Value | Purpose |
|---------|-------------------|---------|
| Expose API version info | OFF | Fingerprinting prevention |
| Max rows | 1000 | DoS prevention |

### Storage Settings

| Setting | Recommended Value | Purpose |
|---------|-------------------|---------|
| File size limit | 50MB or less | Resource exhaustion prevention |
| Allowed MIME types | Whitelist only | Malicious file prevention |

---

## SQL Security Patterns

### RLS Policy Patterns

```sql
-- GOOD: User can only see their own data
CREATE POLICY "Users can view own data"
  ON my_table FOR SELECT
  USING (user_id = auth.uid());

-- GOOD: Check both ownership and allowed values
CREATE POLICY "Users can update own data with valid status"
  ON my_table FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND status IN ('active', 'inactive'));

-- BAD: Allows anyone to see everything
CREATE POLICY "Anyone can view"
  ON my_table FOR SELECT
  USING (true);  -- Only use for truly public data!

-- GOOD: Nested resource access (user must own parent)
CREATE POLICY "Users can view their items"
  ON items FOR SELECT
  USING (
    folder_id IN (
      SELECT id FROM folders WHERE user_id = auth.uid()
    )
  );
```

### SECURITY DEFINER Function Pattern

```sql
-- ALWAYS set search_path to empty string for SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.my_secure_function(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''  -- CRITICAL: Prevents search path injection
AS $function$
BEGIN
  -- Always use fully qualified table names
  UPDATE public.my_table 
  SET updated_at = now()
  WHERE user_id = p_user_id;
END;
$function$;
```

### Recursive Function with Depth Limit

```sql
-- GOOD: Prevents memory exhaustion with max_depth
CREATE OR REPLACE FUNCTION public.get_tree(root_id uuid, max_depth integer DEFAULT 10)
RETURNS TABLE(id uuid, parent_id uuid, depth integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH RECURSIVE tree AS (
    SELECT t.id, t.parent_id, 1 as depth
    FROM public.nodes t
    WHERE t.id = root_id
    
    UNION ALL
    
    SELECT t.id, t.parent_id, tr.depth + 1
    FROM public.nodes t
    JOIN tree tr ON t.parent_id = tr.id
    WHERE tr.depth < max_depth  -- CRITICAL: Depth limit
  )
  SELECT * FROM tree;
END;
$function$;
```

### Sanitized Error Messages

```sql
-- BAD: Leaks internal information
RAISE EXCEPTION 'Only SSgt and above can supervise others. Current rank: %', supervisor_rank;
RAISE EXCEPTION 'User % not found in table users', user_id;

-- GOOD: Generic, non-revealing messages
RAISE EXCEPTION 'Insufficient permissions for this operation';
RAISE EXCEPTION 'Resource not found';
RAISE EXCEPTION 'Not authorized to perform this action';
RAISE EXCEPTION 'Invalid status for this operation';
```

### RPC Access Control

```sql
-- Revoke anonymous access to all functions
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public;

-- Grant only to authenticated users
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Set default for future functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;

-- If a function MUST be public, grant explicitly
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon;
```

---

## Views Security

```sql
-- GOOD: Views should use security_invoker
-- This ensures RLS policies of underlying tables are respected
CREATE VIEW my_view WITH (security_invoker = true) AS
SELECT * FROM my_table;

-- BAD: SECURITY DEFINER views bypass RLS
-- Only use if you intentionally want to bypass RLS
CREATE VIEW admin_view WITH (security_definer = true) AS
SELECT * FROM my_table;  -- DANGEROUS: bypasses RLS!
```

---

## Storage Security

### Bucket Policies

```sql
-- Public read, authenticated write
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' 
    AND auth.uid() IS NOT NULL
  );

-- User can only access their own files
CREATE POLICY "Users access own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

### File Path Patterns

```
-- GOOD: User-namespaced paths
avatars/{user_id}/profile.jpg
documents/{user_id}/{folder}/{filename}

-- BAD: No user isolation
avatars/profile.jpg
documents/sensitive.pdf
```

---

## Edge Functions Security

### Validate JWT

```typescript
// Always validate auth in edge functions
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  // Get JWT from Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create client and verify user
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // User is authenticated, proceed...
});
```

### Request Validation

```typescript
// Validate request body size and content
Deno.serve(async (req) => {
  // Check content length
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 1024 * 1024) { // 1MB
    return new Response(JSON.stringify({ error: 'Request too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Parse JSON safely
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate required fields
  if (!body.requiredField || typeof body.requiredField !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing required field' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Continue processing...
});
```

---

## Realtime Security

### Enable RLS on Realtime Tables

```sql
-- Enable realtime on a table (in Dashboard or via ALTER)
ALTER PUBLICATION supabase_realtime ADD TABLE my_table;

-- RLS policies MUST be set - they apply to realtime subscriptions too!
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can subscribe to own data"
  ON my_table FOR SELECT
  USING (user_id = auth.uid());
```

### Broadcast Authorization

```typescript
// Client-side: Validate broadcast messages
const channel = supabase.channel('room:123', {
  config: {
    broadcast: { self: true }
  }
});

// Server-side (Edge Function): Validate user can access room before broadcasting
// This prevents unauthorized users from listening to sensitive broadcasts
```

---

## Config.toml Security Settings

```toml
[auth]
# Require email confirmation before sign-in
enable_confirmations = true

# Minimum password length
minimum_password_length = 8

# Short JWT expiry (1 hour)
jwt_expiry = 3600

# Enable refresh token rotation
enable_refresh_token_rotation = true

# Short reuse interval for race conditions
refresh_token_reuse_interval = 10

# Disable anonymous sign-ins unless needed
enable_anonymous_sign_ins = false

[auth.email]
# Require confirmation on both old and new email
double_confirm_changes = true

# Rate limit email sending
max_frequency = 60

[auth.sms]
# Rate limit SMS
max_frequency = 60

[api]
# Limit rows returned
max_rows = 1000
```

---

## Security Headers in Next.js

```typescript
// next.config.ts
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; ..."
  }
];

const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};
```

---

## Quick Security Audit Commands

```bash
# Check for tables without RLS
psql -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN (SELECT tablename FROM pg_tables t JOIN pg_class c ON t.tablename = c.relname WHERE c.relrowsecurity = true);"

# Check for SECURITY DEFINER functions without search_path
psql -c "SELECT proname, prosecdef, proconfig FROM pg_proc WHERE prosecdef = true AND (proconfig IS NULL OR 'search_path=' NOT IN (SELECT unnest(proconfig)));"

# Check for overly permissive policies
psql -c "SELECT schemaname, tablename, policyname, qual FROM pg_policies WHERE qual::text = 'true';"

# List all functions accessible to anon
psql -c "SELECT routine_name FROM information_schema.routine_privileges WHERE grantee = 'anon' AND privilege_type = 'EXECUTE';"
```

---

## Monthly Security Review Checklist

- [ ] Review authentication logs for anomalies
- [ ] Check for new tables without RLS
- [ ] Audit SECURITY DEFINER functions
- [ ] Review API error logs for information leakage
- [ ] Verify rate limiting is working
- [ ] Check for dependency vulnerabilities (`npm audit`)
- [ ] Review access to production environment
- [ ] Test backup restoration
- [ ] Review third-party service integrations
- [ ] Update this checklist with new findings

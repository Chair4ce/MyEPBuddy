/**
 * Auth Error Handler
 * 
 * Provides user-friendly error messages for Supabase auth errors,
 * especially for email delivery issues (SendGrid rate limits, etc.)
 */

export interface AuthErrorInfo {
  title: string;
  message: string;
  action?: string;
  isRateLimit: boolean;
  isEmailDelivery: boolean;
}

/**
 * Known error patterns from Supabase/SendGrid
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp | string;
  info: AuthErrorInfo;
}> = [
  // SendGrid rate limit errors
  {
    pattern: /rate limit/i,
    info: {
      title: "Too Many Requests",
      message: "We've sent too many emails recently. Please wait a few minutes before trying again.",
      action: "Try again in 5-10 minutes, or use Google sign-in instead.",
      isRateLimit: true,
      isEmailDelivery: true,
    },
  },
  {
    pattern: /email rate limit/i,
    info: {
      title: "Email Limit Reached",
      message: "We've hit our email sending limit temporarily.",
      action: "Please try again in a few minutes, or sign up with Google.",
      isRateLimit: true,
      isEmailDelivery: true,
    },
  },
  {
    pattern: /exceeded.*quota/i,
    info: {
      title: "Service Temporarily Limited",
      message: "Our email service is temporarily at capacity.",
      action: "Please try Google sign-in, or come back in a few hours.",
      isRateLimit: true,
      isEmailDelivery: true,
    },
  },
  // SendGrid specific errors
  {
    pattern: /sendgrid/i,
    info: {
      title: "Email Service Issue",
      message: "We're having trouble sending verification emails right now.",
      action: "Try signing up with Google instead, or try again later.",
      isRateLimit: false,
      isEmailDelivery: true,
    },
  },
  // Email delivery failures
  {
    pattern: /email.*not.*sent/i,
    info: {
      title: "Email Not Sent",
      message: "We couldn't send the verification email.",
      action: "Check your email address and try again, or use Google sign-in.",
      isRateLimit: false,
      isEmailDelivery: true,
    },
  },
  {
    pattern: /failed.*send.*email/i,
    info: {
      title: "Email Delivery Failed",
      message: "The verification email couldn't be delivered.",
      action: "Please verify your email address is correct, or try Google sign-in.",
      isRateLimit: false,
      isEmailDelivery: true,
    },
  },
  // SMTP errors
  {
    pattern: /smtp/i,
    info: {
      title: "Email Service Error",
      message: "Our email service encountered an error.",
      action: "Please try Google sign-in, or try again in a few minutes.",
      isRateLimit: false,
      isEmailDelivery: true,
    },
  },
  // Too many signup attempts
  {
    pattern: /too many.*request/i,
    info: {
      title: "Too Many Attempts",
      message: "You've made too many attempts. Please slow down.",
      action: "Wait a minute and try again.",
      isRateLimit: true,
      isEmailDelivery: false,
    },
  },
  // Email already registered
  {
    pattern: /already registered/i,
    info: {
      title: "Email Already Registered",
      message: "This email is already associated with an account.",
      action: "Try signing in instead, or use the forgot password option.",
      isRateLimit: false,
      isEmailDelivery: false,
    },
  },
  // Invalid email
  {
    pattern: /invalid.*email/i,
    info: {
      title: "Invalid Email",
      message: "Please enter a valid email address.",
      action: "Check your email format and try again.",
      isRateLimit: false,
      isEmailDelivery: false,
    },
  },
  // Password too weak
  {
    pattern: /password.*weak|password.*short|password.*requirement/i,
    info: {
      title: "Password Too Weak",
      message: "Your password doesn't meet the security requirements.",
      action: "Use at least 8 characters with a mix of letters and numbers.",
      isRateLimit: false,
      isEmailDelivery: false,
    },
  },
  // Generic auth errors
  {
    pattern: /unable to validate email/i,
    info: {
      title: "Verification Issue",
      message: "We couldn't verify your email address.",
      action: "Please check your email and click the verification link.",
      isRateLimit: false,
      isEmailDelivery: true,
    },
  },
];

/**
 * Parse an auth error and return user-friendly information
 */
export function parseAuthError(error: string | Error | { message: string }): AuthErrorInfo {
  const errorMessage = typeof error === "string" 
    ? error 
    : error.message || "Unknown error";

  // Check against known patterns
  for (const { pattern, info } of ERROR_PATTERNS) {
    const regex = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
    if (regex.test(errorMessage)) {
      return info;
    }
  }

  // Default fallback
  return {
    title: "Authentication Error",
    message: errorMessage,
    isRateLimit: false,
    isEmailDelivery: false,
  };
}

/**
 * Check if an error is likely a rate limit issue
 */
export function isRateLimitError(error: string | Error | { message: string }): boolean {
  return parseAuthError(error).isRateLimit;
}

/**
 * Check if an error is email delivery related
 */
export function isEmailDeliveryError(error: string | Error | { message: string }): boolean {
  return parseAuthError(error).isEmailDelivery;
}

/**
 * Get a simple user-friendly message for an auth error
 */
export function getAuthErrorMessage(error: string | Error | { message: string }): string {
  const info = parseAuthError(error);
  return info.action ? `${info.message} ${info.action}` : info.message;
}

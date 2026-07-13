export type UserFeedbackStatus = "open" | "replied" | "archived";

export type AdminUserFeedbackItem = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  feature: string;
  feedback: string;
  created_at: string | null;
  status: UserFeedbackStatus;
  admin_reply: string | null;
  replied_at: string | null;
  replied_by: string | null;
  email_sent_at: string | null;
  user_name: string | null;
};

export const USER_FEEDBACK_STATUSES: UserFeedbackStatus[] = [
  "open",
  "replied",
  "archived",
];

export function isUserFeedbackStatus(value: string): value is UserFeedbackStatus {
  return USER_FEEDBACK_STATUSES.includes(value as UserFeedbackStatus);
}

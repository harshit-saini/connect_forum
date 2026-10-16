export const REPORT_REASONS = [
  { value: "inappropriate_behavior", label: "Inappropriate behaviour" },
  { value: "harassment", label: "Harassment or pressure" },
  { value: "spam_or_solicitation", label: "Spam or selling something" },
  { value: "fake_profile", label: "Fake or misleading profile" },
  { value: "shared_contact_info", label: "Tried to take the conversation elsewhere early" },
  { value: "other", label: "Something else" },
] as const;

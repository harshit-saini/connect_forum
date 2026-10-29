import { Card } from "@/components/ui/card";
import { CATEGORIES, labelOf } from "@/config/taxonomy";
import type { GuideProfileData, Role, SeekerProfileData } from "@/schemas";

function Item({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/** The member's own answers, read-only. The member ID and phone are private and only shown to the member (a phone number is also emailed to Seekers who connect with the Guide). */
export function ProfileView({ role, data, memberId, phone }: { role: Role; data: Record<string, unknown>; memberId: string | null; phone: { has: boolean; last4: string | null } }) {
  const d = data as Partial<SeekerProfileData & GuideProfileData>;
  return (
    <Card className="space-y-3">
      <dl className="space-y-2">
        <Item label="Member ID (private)" value={memberId} />
        {role === "seeker" ? (
          <>
            <Item label="Category" value={d.category && labelOf(CATEGORIES, d.category)} />
            <Item label="Your question" value={d.query} />
          </>
        ) : (
          <>
            <Item label="Categories" value={d.categories?.map((c) => labelOf(CATEGORIES, c)).join(", ")} />
            <Item label="Role" value={d.jobTitle} />
            <Item label="About" value={d.about} />
            <Item label="Email address" value={d.shareEmail === true ? "Shared with Seekers who connect with you. You can change this when you edit your profile." : "Not shared. Seekers who connect with you don't get your email address."} />
            <Item label="Phone number" value={phone.has ? `Saved securely (ends ${phone.last4}). Emailed to Seekers who connect with you.` : "Not provided. Seekers who connect with you get only your profile details."} />
          </>
        )}
        <Item label="Experience" value={d.totalYears !== undefined ? `${d.totalYears} years` : undefined} />
      </dl>
    </Card>
  );
}

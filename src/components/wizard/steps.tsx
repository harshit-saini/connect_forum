"use client";
import {
  CAREER_STAGES, COMPANY_TYPES, CONTACT_PREFERENCES, EDUCATION, EMPLOYMENT_STATUS, ENGAGEMENT_STYLES, FUNCTIONS,
  HELP_LEVELS, HELP_TYPES, HIRING_EXPERIENCE, INDUSTRIES, JOB_SEARCH_STATUS, LANGUAGES, MIN_GUIDE_EXPERIENCE, MODES,
  PRIMARY_GOALS, SESSION_LENGTHS, SENIORITY, SKILLS, TIMELINES, TRANSITIONS, WEEKLY_COMMITMENT,
} from "@/config/taxonomy";
import {
  AvailabilityGrid, CheckboxField, ListField, MultiCheckField, NumberField, RadioField, RankedHelpField, SelectField,
  TagField, TextAreaField, TextField,
} from "@/components/form/controls";
import { AliasField, ConsentsField, CountryField, TimezoneField, TimelineEditor } from "@/components/form/special";
import type { Role } from "@/schemas";

export function BasicsStep() {
  return (
    <div className="space-y-5">
      <AliasField />
      <div className="grid gap-5 sm:grid-cols-2">
        <CountryField />
        <TextField name="city" label="City" optional max={60} hint="Private. Never shown to anyone." placeholder="e.g. Pune" />
      </div>
      <TimezoneField />
      <TagField name="languages" label="Languages" hint="Languages you can hold a conversation in (1–6)." options={LANGUAGES} allowCustom={false} max={6} placeholder="Type a language, e.g. English" />
      <ConsentsField />
    </div>
  );
}

export function BackgroundStep({ role }: { role: Role }) {
  return (
    <div className="space-y-5">
      <SelectField name="status" label="Current status" options={EMPLOYMENT_STATUS} />
      <TextField name="jobTitle" label="Current job title" max={80} placeholder="e.g. Senior data analyst (students: Student)" />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField name="industry" label="Current industry" options={INDUSTRIES} />
        <SelectField name="function" label="Current job function" options={FUNCTIONS} />
      </div>
      <SelectField name="companyType" label="Company type" optional options={COMPANY_TYPES} />
      <div className="grid gap-5 sm:grid-cols-2">
        <NumberField name="totalYears" label="Total years of experience" min={0} max={50} hint="Whole years, 0–50." />
        <NumberField name="yearsInFunction" label="Years in current function" optional min={0} max={50} hint="Can't exceed total experience." />
      </div>
      <SelectField name="seniority" label="Seniority level" options={SENIORITY} />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField name="education" label="Highest education" optional options={EDUCATION} />
        <TextField name="fieldOfStudy" label="Field of study" optional max={80} placeholder="e.g. Computer science" />
      </div>
      <TagField name="skills" label="Skills" hint="3–15. Pick from the list or type your own and press Enter." options={SKILLS} max={15} placeholder="e.g. SQL" />
      <TimelineEditor required={role === "guide"} />
      <TagField name="excludedCompanies" label="Companies to exclude from matching" optional max={10} maxLen={60} hint="Private, never shown or sent to AI. Add your current and past employers, competitors, or anyone you'd rather not be matched with." placeholder="e.g. Acme" />
      <TextField name="linkedinUrl" label="LinkedIn URL" optional type="url" hint="Private. Only used by you." placeholder="https://www.linkedin.com/in/your-name" />
    </div>
  );
}

export function GoalsStep() {
  return (
    <div className="space-y-5">
      <RadioField name="careerStage" label="Career stage" options={CAREER_STAGES} />
      <RadioField name="primaryGoal" label="Primary goal" options={PRIMARY_GOALS} />
      <ListField name="targetRoles" label="Target role(s)" hint="Up to 3." max={3} maxLen={80} placeholder="e.g. Product manager" addLabel="Add a role" />
      <MultiCheckField name="targetIndustries" label="Target industries" hint="Pick up to 3." options={INDUSTRIES} max={3} />
      <SelectField name="targetFunction" label="Target function" options={FUNCTIONS} />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField name="timeline" label="Timeline" options={TIMELINES} />
        <SelectField name="jobSearchStatus" label="Job search status" options={JOB_SEARCH_STATUS} />
      </div>
      <RankedHelpField name="helpNeeded" label="Help needed" hint="Tick everything you need, then order it. Your top 3 matter most." options={HELP_TYPES} max={6} />
      <TextAreaField name="challenge" label="Biggest challenge right now" min={50} max={800} placeholder="e.g. I'm an engineer who wants to move into product management, but I don't know how to show relevant experience…" />
      <TextAreaField name="triedSoFar" label="What you've tried so far" optional max={500} rows={3} placeholder="e.g. Took a short PM course and applied to 20 roles" />
      <TextAreaField name="desiredOutcome" label="What a great outcome looks like" optional max={500} rows={3} placeholder="e.g. An interview-ready plan and a few referrals" />
      <ListField name="questions" label="Questions you'd like to ask a Guide" optional hint="Up to 3." max={3} maxLen={150} placeholder="e.g. How did you break into product?" addLabel="Add a question" />
    </div>
  );
}

export function PreferencesStep() {
  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-accent p-3 text-sm">These preferences are private. Other users never see them.</p>
      <TagField name="preferredGuideIndustries" label="Preferred Guide industries" optional options={INDUSTRIES} allowCustom={false} placeholder="Type an industry" />
      <TagField name="preferredGuideFunctions" label="Preferred Guide functions" optional options={FUNCTIONS} allowCustom={false} placeholder="Type a function" />
      <SelectField name="minGuideExperience" label="Minimum Guide experience" options={MIN_GUIDE_EXPERIENCE} />
      <CheckboxField name="mustShareLanguage" label="Only match me with Guides who share a language with me" />
      <CheckboxField name="similarTransition" label="Prefer a Guide who has made a similar transition" />
      <RadioField name="engagementStyle" label="Engagement style" options={ENGAGEMENT_STYLES} />
      <RadioField name="mode" label="Preferred mode" options={MODES} />
      <AvailabilityGrid name="availability" label="Weekly availability" hint="Pick at least 2 slots, in your own timezone." />
      <SelectField name="weeklyCommitment" label="Time you can commit per week" optional options={WEEKLY_COMMITMENT} />
    </div>
  );
}

export function ExpertiseStep() {
  return (
    <div className="space-y-5">
      <TagField name="primaryFunctions" label="Primary functions" hint="1–3." options={FUNCTIONS} allowCustom={false} max={3} placeholder="Type a function" />
      <TagField name="primaryIndustries" label="Primary industries" hint="1–3." options={INDUSTRIES} allowCustom={false} max={3} placeholder="Type an industry" />
      <RankedHelpField name="help" label="Can help with" hint="Pick at least 2 areas, rate yourself on each, then order them. Your top 3 count most." options={HELP_TYPES} levels={HELP_LEVELS} max={8} />
      <MultiCheckField name="stagesBestAt" label="Career stages I'm best at helping" options={CAREER_STAGES} />
      <MultiCheckField name="transitions" label="Transitions I've personally made" optional options={TRANSITIONS} />
      <RadioField name="hiringExperience" label="Hiring experience" options={HIRING_EXPERIENCE} />
      <TextAreaField name="experienceSummary" label="Experience summary" min={100} max={1000} placeholder="e.g. I moved from engineering into product management ten years ago, have led product teams since, and regularly interview candidates…" hint="Seekers see this. Don't include names or contact details." />
      <TextAreaField name="helpStyle" label="How I like to help" optional max={500} rows={3} />
      <MultiCheckField name="wontHelpWith.types" label="Topics I won't help with" optional options={HELP_TYPES} />
      <TextAreaField name="wontHelpWith.note" label="Anything else I won't help with" optional max={200} rows={2} />
      <TextAreaField name="whyHelp" label="Why I want to help" optional max={300} rows={3} />
    </div>
  );
}

export function AvailabilityStep({ phoneField }: { phoneField: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <NumberField name="maxNewSeekersPerMonth" label="Max new Seekers per month" min={1} max={10} hint="1–10. We stop matching you once you reach this." />
      <AvailabilityGrid name="availability" label="Weekly availability" hint="Pick at least 2 slots, in your own timezone." />
      <SelectField name="sessionLength" label="Session length I'm comfortable with" options={SESSION_LENGTHS} />
      <RadioField name="mode" label="Preferred mode" options={MODES} />
      {phoneField}
      <RadioField name="contactPreference" label="How should Seekers reach you?" options={CONTACT_PREFERENCES} />
      <TextField name="bestTime" label="Best time to contact" max={100} placeholder="e.g. Weekdays after 7pm IST" hint="Shown with your number, only to Seekers you approve." />
      <CheckboxField name="pauseMatching" label="Pause matching (no new Seekers will be matched with me)" />
      <CheckboxField name="acknowledgement" label="My number is shown only to Seekers I approve." />
    </div>
  );
}

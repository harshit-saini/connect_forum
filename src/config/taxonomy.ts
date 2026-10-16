/**
 * All option lists for the profile forms and matching. Edit values here without touching logic.
 * `value` is stored in the database, so renaming a value needs a data migration; labels are free to change.
 */
export type Option<V extends string = string> = { value: V; label: string; description?: string };

/** Defines a const option list and derives its value union. */
function options<const T extends readonly Option[]>(list: T) {
  return list;
}
export type ValueOf<T extends readonly Option[]> = T[number]["value"];

export const HELP_TYPES = options([
  { value: "resume_review", label: "Resume / CV review" },
  { value: "career_switch", label: "Career switch planning" },
  { value: "interview_prep", label: "Interview preparation" },
  { value: "mock_interviews", label: "Mock interviews" },
  { value: "skill_roadmap", label: "Skill roadmap" },
  { value: "job_search_strategy", label: "Job search strategy" },
  { value: "networking_referrals", label: "Networking and referrals" },
  { value: "linkedin_branding", label: "LinkedIn and personal branding" },
  { value: "salary_negotiation", label: "Salary negotiation" },
  { value: "promotion_growth", label: "Promotion and growth" },
  { value: "leadership_management", label: "Leadership and management" },
  { value: "higher_studies", label: "Higher studies" },
  { value: "freelancing_entrepreneurship", label: "Freelancing and entrepreneurship" },
  { value: "industry_insights", label: "Industry insights" },
  { value: "work_abroad", label: "Work abroad and relocation" },
  { value: "career_break_return", label: "Returning after a career break" },
] as const);

export const INDUSTRIES = options([
  { value: "it_software", label: "IT / software" },
  { value: "data_ai", label: "Data / AI" },
  { value: "banking_financial", label: "Banking and financial services" },
  { value: "fintech", label: "Fintech" },
  { value: "healthcare_pharma", label: "Healthcare / pharma / life sciences" },
  { value: "consulting", label: "Consulting" },
  { value: "ecommerce_retail", label: "E-commerce / retail" },
  { value: "fmcg", label: "FMCG" },
  { value: "manufacturing_engineering", label: "Manufacturing / engineering" },
  { value: "automotive", label: "Automotive" },
  { value: "energy_utilities", label: "Energy / utilities" },
  { value: "telecom", label: "Telecom" },
  { value: "media_entertainment", label: "Media / entertainment" },
  { value: "education_edtech", label: "Education / edtech" },
  { value: "government", label: "Government / public sector" },
  { value: "non_profit", label: "Non-profit" },
  { value: "real_estate_construction", label: "Real estate / construction" },
  { value: "logistics_supply_chain", label: "Logistics / supply chain" },
  { value: "hospitality_travel", label: "Hospitality / travel" },
  { value: "legal", label: "Legal" },
  { value: "marketing_advertising", label: "Marketing / advertising" },
  { value: "hr_recruitment", label: "HR / recruitment" },
  { value: "agriculture", label: "Agriculture" },
  { value: "other", label: "Other" },
] as const);

export const FUNCTIONS = options([
  { value: "software_engineering", label: "Software engineering" },
  { value: "data_analytics", label: "Data / analytics" },
  { value: "ml_ai", label: "ML / AI" },
  { value: "product_management", label: "Product management" },
  { value: "design", label: "Design (UX/UI)" },
  { value: "qa_testing", label: "QA / testing" },
  { value: "devops_cloud_sre", label: "DevOps / cloud / SRE" },
  { value: "cybersecurity", label: "Cybersecurity" },
  { value: "it_support", label: "IT support" },
  { value: "project_program_management", label: "Project / program management" },
  { value: "business_analysis", label: "Business analysis" },
  { value: "strategy_consulting", label: "Strategy / consulting" },
  { value: "sales", label: "Sales" },
  { value: "marketing", label: "Marketing" },
  { value: "customer_success", label: "Customer success" },
  { value: "operations", label: "Operations" },
  { value: "finance_accounting", label: "Finance / accounting" },
  { value: "hr_people", label: "HR / people" },
  { value: "legal_compliance", label: "Legal / compliance" },
  { value: "content_writing", label: "Content / writing" },
  { value: "research_academia", label: "Research / academia" },
  { value: "non_software_engineering", label: "Non-software engineering" },
  { value: "clinical_healthcare", label: "Clinical / healthcare" },
  { value: "teaching", label: "Teaching" },
  { value: "founder_entrepreneur", label: "Founder / entrepreneur" },
  { value: "other", label: "Other" },
] as const);

export const EMPLOYMENT_STATUS = options([
  { value: "employed_full_time", label: "Employed full-time" },
  { value: "employed_part_time", label: "Employed part-time" },
  { value: "self_employed", label: "Self-employed / freelance" },
  { value: "student", label: "Student" },
  { value: "between_jobs", label: "Between jobs" },
  { value: "career_break", label: "On a career break" },
  { value: "other", label: "Other" },
] as const);

export const COMPANY_TYPES = options([
  { value: "startup", label: "Startup" },
  { value: "mid_size", label: "Mid-size company" },
  { value: "large_enterprise", label: "Large enterprise" },
  { value: "mnc", label: "MNC" },
  { value: "government", label: "Government" },
  { value: "non_profit", label: "Non-profit" },
  { value: "agency_consulting", label: "Agency / consulting" },
  { value: "self", label: "Self" },
] as const);

/** Ordered low to high: the matcher uses the index to compare levels. */
export const SENIORITY = options([
  { value: "student", label: "Student" },
  { value: "intern", label: "Intern / trainee" },
  { value: "entry", label: "Entry level" },
  { value: "mid", label: "Mid level" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead / staff" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "executive", label: "VP / executive / founder" },
] as const);

export const EDUCATION = options([
  { value: "school", label: "School" },
  { value: "diploma", label: "Diploma" },
  { value: "bachelors", label: "Bachelor's" },
  { value: "masters", label: "Master's" },
  { value: "doctorate", label: "Doctorate" },
  { value: "other", label: "Other" },
] as const);

export const CAREER_STAGES = options([
  { value: "student", label: "Student" },
  { value: "recent_graduate", label: "Recent graduate", description: "Less than 1 year since graduating" },
  { value: "early_career", label: "Early career", description: "1–3 years of experience" },
  { value: "mid_career", label: "Mid-career", description: "3–10 years" },
  { value: "senior", label: "Senior", description: "10+ years" },
  { value: "career_switcher", label: "Career switcher" },
  { value: "returning", label: "Returning after a break" },
  { value: "between_jobs", label: "Between jobs" },
] as const);

export const PRIMARY_GOALS = options([
  { value: "first_job", label: "Land my first job" },
  { value: "better_job", label: "Get a better job" },
  { value: "switch_career", label: "Switch career" },
  { value: "grow_promotion", label: "Grow or get promoted" },
  { value: "move_to_management", label: "Move into management" },
  { value: "start_business", label: "Start a business or freelance" },
  { value: "return_after_break", label: "Return after a break" },
  { value: "explore_options", label: "Explore my options" },
  { value: "study_work_abroad", label: "Study or work abroad" },
] as const);

export const TIMELINES = options([
  { value: "3_months", label: "Within 3 months" },
  { value: "6_months", label: "Within 6 months" },
  { value: "1_year", label: "Within 1 year" },
  { value: "exploring", label: "Just exploring" },
] as const);

export const JOB_SEARCH_STATUS = options([
  { value: "not_started", label: "Not started" },
  { value: "preparing", label: "Preparing" },
  { value: "actively_applying", label: "Actively applying" },
  { value: "interviewing", label: "Interviewing" },
  { value: "have_offer", label: "Have an offer" },
  { value: "not_looking", label: "Not looking" },
] as const);

export const MIN_GUIDE_EXPERIENCE = options([
  { value: "0", label: "Any" },
  { value: "3", label: "3+ years" },
  { value: "5", label: "5+ years" },
  { value: "10", label: "10+ years" },
  { value: "15", label: "15+ years" },
] as const);

export const ENGAGEMENT_STYLES = options([
  { value: "one_off", label: "A one-off chat" },
  { value: "few_sessions", label: "A few sessions" },
  { value: "ongoing", label: "Ongoing for 1–3 months" },
] as const);

export const MODES = options([
  { value: "voice", label: "Voice call" },
  { value: "video", label: "Video call" },
  { value: "text", label: "Text chat" },
  { value: "any", label: "Any" },
] as const);

export const WEEKLY_COMMITMENT = options([
  { value: "lt_1h", label: "Less than 1 hour" },
  { value: "1_2h", label: "1–2 hours" },
  { value: "3h_plus", label: "3+ hours" },
] as const);

export const HELP_LEVELS = options([
  { value: "some", label: "Some experience" },
  { value: "solid", label: "Solid" },
  { value: "expert", label: "Expert" },
] as const);

export const TRANSITIONS = options([
  { value: "changed_industry", label: "Changed industry" },
  { value: "changed_function", label: "Changed function" },
  { value: "non_tech_to_tech", label: "Non-tech to tech" },
  { value: "ic_to_manager", label: "Individual contributor to manager" },
  { value: "service_to_product", label: "Service to product company" },
  { value: "moved_abroad", label: "Moved abroad" },
  { value: "started_business", label: "Started a business" },
  { value: "returned_after_break", label: "Returned after a break" },
  { value: "rapid_promotions", label: "Rapid promotions" },
  { value: "studied_then_switched", label: "Studied further, then switched" },
] as const);

export const HIRING_EXPERIENCE = options([
  { value: "none", label: "None" },
  { value: "occasional", label: "Occasionally interviewed" },
  { value: "regular", label: "Regularly interviewed" },
  { value: "hired_managed", label: "Hired or managed teams" },
] as const);

export const SESSION_LENGTHS = options([
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
] as const);

export const CONTACT_PREFERENCES = options([
  { value: "call", label: "Call" },
  { value: "text", label: "Text message" },
  { value: "either", label: "Either" },
] as const);

export const DAYS = options([
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const);

export const DAY_PARTS = options([
  { value: "morning", label: "Morning", description: "6am–12pm" },
  { value: "afternoon", label: "Afternoon", description: "12pm–5pm" },
  { value: "evening", label: "Evening", description: "5pm–9pm" },
  { value: "night", label: "Night", description: "9pm–12am" },
] as const);

export const LANGUAGES = options(
  [
    "English", "Hindi", "Bengali", "Telugu", "Marathi", "Tamil", "Urdu", "Gujarati", "Kannada", "Malayalam",
    "Odia", "Punjabi", "Assamese", "Spanish", "French", "German", "Portuguese", "Arabic", "Mandarin", "Japanese",
    "Korean", "Russian", "Italian", "Dutch", "Indonesian", "Turkish", "Vietnamese", "Thai", "Swahili",
  ].map((l) => ({ value: l.toLowerCase(), label: l })) as Option[] as readonly Option[],
);

export const SKILLS = options(
  [
    "Python", "JavaScript", "TypeScript", "Java", "C++", "Go", "SQL", "React", "Node.js", "Cloud computing",
    "AWS", "Azure", "Kubernetes", "Machine learning", "Data analysis", "Excel", "Power BI", "Tableau", "Statistics",
    "Product strategy", "Roadmapping", "User research", "UI design", "Figma", "Agile", "Scrum", "Project planning",
    "Stakeholder management", "Communication", "Public speaking", "Leadership", "Team management", "Coaching",
    "Negotiation", "Sales", "Marketing", "SEO", "Content writing", "Copywriting", "Financial modelling", "Accounting",
    "Auditing", "Risk management", "Compliance", "Operations management", "Supply chain", "Customer support",
    "Recruiting", "People management", "Teaching", "Research", "Cybersecurity", "Testing and QA", "DevOps", "Automation",
  ].map((s) => ({ value: s.toLowerCase(), label: s })) as Option[] as readonly Option[],
);

/** Convenience maps for rendering labels from stored values. */
export function labelOf(list: readonly Option[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}
export function valuesOf<T extends readonly Option[]>(list: T) {
  return list.map((o) => o.value) as [ValueOf<T>, ...ValueOf<T>[]];
}

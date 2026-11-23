// Fork: the profile.yml fields the Profile page shows, grouped into cards.
// Every field is a `section.key` value, so it can be saved with the
// comment-preserving line edit (profile-yaml-edit.mjs).

export type FieldKind = "text" | "long" | "bool" | "list";
export type ProfileField = { path: string; label: string; kind: FieldKind; hint?: string; placeholder?: string; addLabel?: string };
export type ProfileTab = "about" | "search" | "letters";
export type ProfileCard = { id: string; tab: ProfileTab; title: string; description: string; fields: ProfileField[] };

export const PROFILE_CARDS: ProfileCard[] = [
  {
    id: "about",
    tab: "about",
    title: "About you",
    description: "Shown at the top of every CV and cover letter.",
    fields: [
      { path: "candidate.full_name", label: "Full name", kind: "text" },
      { path: "candidate.email", label: "Email", kind: "text" },
      { path: "candidate.phone", label: "Phone", kind: "text" },
      { path: "candidate.location", label: "Location", kind: "text", placeholder: "City, Country" },
      { path: "candidate.linkedin", label: "LinkedIn", kind: "text", placeholder: "linkedin.com/in/…" },
    ],
  },
  {
    id: "story",
    tab: "about",
    title: "Your story",
    description: "How Miao introduces you in summaries and cover letters.",
    fields: [
      { path: "narrative.headline", label: "Headline", kind: "long", hint: "One line that sums you up." },
      { path: "narrative.exit_story", label: "Why you're looking", kind: "long", hint: "What you're finishing and what you want next." },
      { path: "narrative.superpowers", label: "Strengths", kind: "list", addLabel: "strength" },
    ],
  },
  {
    id: "looking",
    tab: "search",
    title: "The internship you want",
    description: "Miao checks every job against this.",
    fields: [
      { path: "target_roles.primary", label: "Job titles to search for", kind: "list", addLabel: "job title", hint: "Used to find new jobs on job boards." },
      { path: "internship.start", label: "Start date", kind: "text", placeholder: "January 2027" },
      { path: "internship.full_time", label: "Full-time", kind: "bool" },
      { path: "internship.curricular_allowed", label: "Curricular / compulsory internships allowed", kind: "bool" },
      { path: "internship.thesis_semester", label: "Thesis semester", kind: "text" },
    ],
  },
  {
    id: "where",
    tab: "search",
    title: "Where",
    description: "Which locations are a match.",
    fields: [
      { path: "compensation.location_flexibility", label: "Where you'd work", kind: "long", placeholder: "anywhere" },
      { path: "location.city", label: "Current city", kind: "text" },
      { path: "location.willing_to_relocate", label: "Willing to relocate", kind: "bool" },
      { path: "location.visa_status", label: "Work authorisation", kind: "long" },
    ],
  },
  {
    id: "pay",
    tab: "search",
    title: "Pay",
    description: "Used to flag offers below what you want.",
    fields: [
      { path: "compensation.target_range", label: "Target", kind: "text" },
      { path: "compensation.minimum", label: "Minimum", kind: "text" },
      { path: "compensation.currency", label: "Currency", kind: "text" },
    ],
  },
  {
    id: "cover",
    tab: "letters",
    title: "Cover letters",
    description: "Defaults for every letter Miao writes.",
    fields: [{ path: "cover_letter.primary_domain", label: "Main domain", kind: "text" }],
  },
];

export const PROFILE_FIELD_PATHS = new Set(PROFILE_CARDS.flatMap((c) => c.fields.map((f) => f.path)));
export const fieldByPath = (path: string) => PROFILE_CARDS.flatMap((c) => c.fields).find((f) => f.path === path);

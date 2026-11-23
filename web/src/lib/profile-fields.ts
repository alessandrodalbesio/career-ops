// Fork: the profile.yml fields the Profile page shows, grouped into cards.
// Every field is a `section.key` value, so it can be saved with the
// comment-preserving line edit (profile-yaml-edit.mjs).

export type FieldKind = "text" | "long" | "bool" | "list" | "places";
export type ProfileField = { path: string; label: string; kind: FieldKind; hint?: string; placeholder?: string; addLabel?: string };
export type ProfileTab = "about" | "want";
export type ProfileCard = { id: string; tab: ProfileTab; title: string; description: string; usedFor: string[]; fields: ProfileField[] };

export const PROFILE_CARDS: ProfileCard[] = [
  {
    id: "about",
    tab: "about",
    title: "Contact details",
    description: "Shown at the top of every CV and cover letter.",
    usedFor: ["CV", "Cover letters"],
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
    description: "How Miao introduces you.",
    usedFor: ["CV summary", "Cover letters"],
    fields: [
      { path: "narrative.headline", label: "Headline", kind: "long", hint: "One line that sums you up." },
      { path: "narrative.exit_story", label: "Why you're looking", kind: "long", hint: "What you're finishing and what you want next." },
      { path: "narrative.superpowers", label: "Strengths", kind: "list", addLabel: "strength" },
      { path: "cover_letter.primary_domain", label: "Your field", kind: "text", hint: "The area you present yourself in.", placeholder: "e.g. marketing (consumer brands)" },
    ],
  },
  {
    id: "internship",
    tab: "want",
    title: "The internship",
    description: "Jobs that don't fit these get a low score.",
    usedFor: ["Scoring"],
    fields: [
      { path: "internship.start", label: "Start date", kind: "text", placeholder: "January 2027" },
      { path: "internship.full_time", label: "Full-time", kind: "bool" },
      { path: "internship.curricular_allowed", label: "Curricular / compulsory internships", kind: "bool", hint: "Turn off if you can't do internships that need a university agreement." },
      { path: "internship.thesis_semester", label: "Thesis semester", kind: "text" },
    ],
  },
  {
    id: "where",
    tab: "want",
    title: "Where",
    description: "Which locations are a match.",
    usedFor: ["Scoring", "Job search"],
    fields: [
      { path: "compensation.location_flexibility", label: "Where you'd work", kind: "places" },
      { path: "location.willing_to_relocate", label: "Willing to relocate", kind: "bool" },
      { path: "location.visa_status", label: "Work authorisation", kind: "long" },
    ],
  },
  {
    id: "pay",
    tab: "want",
    title: "Pay",
    description: "Offers below this get flagged.",
    usedFor: ["Scoring"],
    fields: [
      { path: "compensation.target_range", label: "Target", kind: "text", placeholder: "e.g. 1,500 per month, or market rate" },
      { path: "compensation.minimum", label: "Minimum", kind: "text", placeholder: "Not set" },
      { path: "compensation.currency", label: "Currency", kind: "text", placeholder: "e.g. EUR" },
    ],
  },
];

/** Fields shown inside the Roles card instead of a card of their own. */
export const ROLE_TITLES_FIELD: ProfileField = {
  path: "target_roles.primary",
  label: "Job titles to search for",
  kind: "list",
  addLabel: "job title",
  hint: "The words Miao types into job boards when it looks for new jobs.",
};

const ALL_FIELDS = [...PROFILE_CARDS.flatMap((c) => c.fields), ROLE_TITLES_FIELD];
export const PROFILE_FIELD_PATHS = new Set(ALL_FIELDS.map((f) => f.path));
export const fieldByPath = (path: string) => ALL_FIELDS.find((f) => f.path === path);

// Notes like "(user-stated 2026-11-20)" stay in the file but are not shown.
const NOTE = /\s*\((?:user-stated|user stated)[^)]*\)\s*$/i;
export function splitNote(value: string): { text: string; note: string } {
  const m = value.match(NOTE);
  return m ? { text: value.slice(0, m.index).trimEnd(), note: m[0].trim() } : { text: value, note: "" };
}
export const joinNote = (text: string, note: string) => (note && text ? `${text} ${note}` : text);

/** Values the profile uses to mean "empty". */
export const isEmptyValue = (v: string) => /^(not set|none|n\/a|-)?$/i.test(v.trim());

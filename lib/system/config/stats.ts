/* The core stats, as DATA. Adding a stat = adding an entry here; a profile
   created earlier simply starts the new stat at INITIAL_STAT_VALUE. Removing
   or renaming = mark it inactive / change its label — stored gains are never
   deleted. */
export interface StatDef {
  id: string;
  label: string;
  hint: string;
}

export const STAT_DEFS: readonly StatDef[] = [
  { id: "strength", label: "Strength", hint: "Training and physical effort" },
  { id: "intelligence", label: "Intelligence", hint: "Study and learning" },
  { id: "focus", label: "Focus", hint: "Deep, undistracted work" },
  { id: "discipline", label: "Discipline", hint: "Doing what you planned" },
  { id: "health", label: "Health", hint: "Body and recovery" },
  { id: "finance", label: "Finance", hint: "Tracking and managing money" },
];

export const STAT_IDS: readonly string[] = STAT_DEFS.map((s) => s.id);

/** Every stat starts here. Stats never decrease. */
export const INITIAL_STAT_VALUE = 1;

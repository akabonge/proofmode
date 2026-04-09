const ASSIGNMENT_MODE_LABELS: Record<string, string> = {
  general_writing: "General writing",
  argumentative_essay: "Argumentative essay",
  research_paper: "Research paper",
  case_analysis: "Case analysis",
  lab_report: "Lab report",
  discussion_post: "Discussion post",
  reflection: "Reflection",
  memo: "Memo",
  proposal: "Proposal",
};

const EVENT_LABELS: Record<string, string> = {
  login_completed: "Signed in",
  signup_completed: "Created an account",
  new_proof_started: "Started creating a proof",
  submission_created: "Created a proof",
  checkpoint_captured: "Captured a checkpoint",
  proof_opened: "Opened a proof workspace",
  proof_shared: "Updated proof sharing",
};

const STAGE_LABELS: Record<string, string> = {
  starting: "Starting",
  building: "Building",
  developing: "Developing",
  revising: "Revising",
  finalizing: "Finalizing",
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  first_capture: "First capture",
  evidence_added: "Evidence added",
  major_revision: "Major revision",
  expansion: "Expanded draft",
  reframing: "Reframed direction",
  polishing: "Polishing",
  development: "Developing ideas",
};

const SOURCE_TOOL_LABELS: Record<string, string> = {
  google_docs: "Google Docs",
  word: "Microsoft Word",
  proofmode: "ProofMode",
  other: "Other",
};

const VISIBILITY_LABELS: Record<string, string> = {
  private: "Private",
  share_pdf: "Shared PDF only",
  share_full: "Shared full proof",
};

function titleCaseWords(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanizeAssignmentMode(mode?: string | null) {
  if (!mode) return "General writing";
  return ASSIGNMENT_MODE_LABELS[mode] || titleCaseWords(mode);
}

export function humanizeEventName(eventName: string) {
  if (eventName.startsWith("page_view:")) {
    return `Viewed ${humanizePath(eventName.replace("page_view:", ""))}`;
  }
  return EVENT_LABELS[eventName] || titleCaseWords(eventName);
}

export function humanizePath(path?: string | null) {
  if (!path) return "This page";
  if (path === "/") return "Landing page";
  if (path === "/login") return "Login page";
  if (path === "/signup") return "Sign-up page";
  if (path === "/dashboard") return "Dashboard";
  if (path === "/new") return "New proof page";
  if (path.startsWith("/p/")) return "Proof workspace";
  if (path.startsWith("/s/")) return "Shared proof";
  return path;
}

export function humanizeStage(stage?: string | null) {
  if (!stage) return "Starting";
  return STAGE_LABELS[stage] || titleCaseWords(stage);
}

export function humanizeChangeType(changeType?: string | null) {
  if (!changeType) return "First capture";
  return CHANGE_TYPE_LABELS[changeType] || titleCaseWords(changeType);
}

export function humanizeSourceTool(sourceTool?: string | null) {
  if (!sourceTool) return "Unknown source";
  return SOURCE_TOOL_LABELS[sourceTool] || titleCaseWords(sourceTool);
}

export function humanizeVisibility(visibility?: string | null) {
  if (!visibility) return "Private";
  return VISIBILITY_LABELS[visibility] || titleCaseWords(visibility);
}

export function humanizeEvidenceStrength(value?: string | null) {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatPercent(value: number, digits = 0) {
  return `${value.toFixed(digits)}%`;
}

from datetime import datetime
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    consent_version: str = "v1"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    role: str
    consent_version: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SubmissionCreate(BaseModel):
    assignment_type: str = "writing"
    title: str = "Untitled"
    course: Optional[str] = None
    assignment_prompt: Optional[str] = None
    due_at: Optional[datetime] = None
    student_name: Optional[str] = None
    include_name_on_pdf: bool = False


class SubmissionUpdate(BaseModel):
    title: Optional[str] = None
    course: Optional[str] = None
    assignment_prompt: Optional[str] = None
    due_at: Optional[datetime] = None
    essay_text: Optional[str] = None
    student_name: Optional[str] = None
    include_name_on_pdf: Optional[bool] = None


class AnswersUpdate(BaseModel):
    answers: Dict[str, Any] = Field(default_factory=dict)


class ShareUpdate(BaseModel):
    visibility: Literal["private", "share_pdf", "share_full"]


class GuidanceRequest(BaseModel):
    current_draft: Optional[str] = None


class GuidanceOut(BaseModel):
    assignment_mode: str
    stage: str
    detected_change: str
    dynamic_prompt: str
    suggested_checkpoint_note: str
    alignment_status: Literal["on_track", "developing", "needs_attention"]
    alignment_summary: str
    missing_requirements: list[str] = Field(default_factory=list)
    recommended_next_step: str
    prompt_keyword_hits: list[str] = Field(default_factory=list)


class CheckpointCreate(BaseModel):
    source_tool: Literal["proofmode", "google_docs", "word", "other"] = "google_docs"
    draft_text: str
    note: Optional[str] = None
    moment_answer: Optional[str] = None


class CheckpointOut(BaseModel):
    id: str
    submission_id: str
    source_tool: str
    note: Optional[str]
    moment_prompt: Optional[str]
    moment_answer: Optional[str]
    added_chars: int
    removed_chars: int
    change_ratio: float
    diff_excerpt: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EvidenceSummaryOut(BaseModel):
    checkpoint_count: int
    active_days: int
    timespan_days: int
    total_added_chars: int
    total_removed_chars: int
    major_revision_count: int
    evidence_strength: Literal["low", "medium", "high"]
    latest_source_tool: Optional[str] = None
    last_checkpoint_at: Optional[datetime] = None


class SubmissionOut(BaseModel):
    id: str
    owner_id: str
    assignment_type: str
    assignment_mode: str
    title: str
    course: Optional[str]
    assignment_prompt: Optional[str]
    due_at: Optional[datetime]
    student_name: Optional[str]
    include_name_on_pdf: bool
    visibility: str
    share_enabled: bool
    share_token: Optional[str]
    essay_text: Optional[str]
    answers: Dict[str, Any]
    integrity_hash: Optional[str]
    checkpoint_count: int = 0
    active_days: int = 0
    evidence_strength: str = "low"
    last_checkpoint_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HealthOut(BaseModel):
    status: str = "ok"


class AnalyticsEventCreate(BaseModel):
    event_name: str = Field(min_length=1, max_length=80)
    path: Optional[str] = Field(default=None, max_length=255)
    session_id: Optional[str] = Field(default=None, max_length=80)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnalyticsKpiOut(BaseModel):
    total_users: int
    new_users_7d: int
    active_users_7d: int
    total_submissions: int
    total_checkpoints: int
    shared_proofs: int
    total_events: int
    unique_visitors_30d: int
    active_writers_30d: int


class AnalyticsFunnelStepOut(BaseModel):
    label: str
    value: int


class AnalyticsDailyActivityOut(BaseModel):
    date: str
    page_views: int
    signups: int
    proofs_created: int
    checkpoints_captured: int


class AnalyticsPageViewOut(BaseModel):
    path: str
    views: int


class AnalyticsAssignmentModeOut(BaseModel):
    mode: str
    count: int


class AnalyticsRecentEventOut(BaseModel):
    id: str
    event_name: str
    path: Optional[str]
    created_at: datetime
    user_email: Optional[EmailStr] = None
    session_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class AnalyticsUserOverviewOut(BaseModel):
    email: EmailStr
    role: str
    created_at: datetime
    last_seen_at: Optional[datetime] = None
    submissions_created: int = 0
    checkpoints_captured: int = 0
    is_recently_active: bool = False


class AnalyticsDashboardOut(BaseModel):
    generated_at: datetime
    kpis: AnalyticsKpiOut
    funnel: list[AnalyticsFunnelStepOut]
    daily_activity: list[AnalyticsDailyActivityOut]
    top_pages: list[AnalyticsPageViewOut]
    assignment_modes: list[AnalyticsAssignmentModeOut]
    recent_events: list[AnalyticsRecentEventOut]
    recent_users: list[AnalyticsUserOverviewOut]

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="student")
    consent_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    submissions: Mapped[list["Submission"]] = relationship(
        back_populates="owner",
        cascade="all, delete-orphan",
    )


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    assignment_type: Mapped[str] = mapped_column(String(50), default="writing")
    assignment_mode: Mapped[str] = mapped_column(String(50), default="general_writing")

    title: Mapped[str] = mapped_column(String(200), default="Untitled")
    course: Mapped[str | None] = mapped_column(String(200), nullable=True)
    assignment_prompt_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    student_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    include_name_on_pdf: Mapped[bool] = mapped_column(Boolean, default=False)

    visibility: Mapped[str] = mapped_column(String(20), default="private")
    share_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    share_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)

    essay_text_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    answers_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    integrity_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_checkpoint_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    owner: Mapped["User"] = relationship(back_populates="submissions")
    checkpoints: Mapped[list["SubmissionCheckpoint"]] = relationship(
        back_populates="submission",
        cascade="all, delete-orphan",
        order_by="SubmissionCheckpoint.created_at.asc()",
    )


class SubmissionCheckpoint(Base):
    __tablename__ = "submission_checkpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    submission_id: Mapped[str] = mapped_column(ForeignKey("submissions.id"), nullable=False, index=True)

    source_tool: Mapped[str] = mapped_column(String(30), default="google_docs")

    draft_text_enc: Mapped[str] = mapped_column(Text, nullable=False)
    note_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    moment_prompt_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    moment_answer_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    diff_excerpt_enc: Mapped[str | None] = mapped_column(Text, nullable=True)

    added_chars: Mapped[int] = mapped_column(Integer, default=0)
    removed_chars: Mapped[int] = mapped_column(Integer, default=0)
    change_ratio: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    submission: Mapped["Submission"] = relationship(back_populates="checkpoints")
import json
from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_optional_user, require_admin, require_csrf
from ..models import AnalyticsEvent, Submission, SubmissionCheckpoint, User
from ..schemas import (
    AnalyticsAssignmentModeOut,
    AnalyticsDailyActivityOut,
    AnalyticsDashboardOut,
    AnalyticsEventCreate,
    AnalyticsFunnelStepOut,
    AnalyticsKpiOut,
    AnalyticsPageViewOut,
    AnalyticsRecentEventOut,
)

router = APIRouter(prefix="/v1", tags=["analytics"])
admin_router = APIRouter(prefix="/v1/admin", tags=["admin"])


@router.post("/analytics/events", dependencies=[Depends(require_csrf)])
def create_analytics_event(
    payload: AnalyticsEventCreate,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    row = AnalyticsEvent(
        user_id=user.id if user else None,
        session_id=payload.session_id,
        event_name=payload.event_name.strip(),
        path=payload.path,
        metadata_json=json.dumps(payload.metadata or {}, sort_keys=True),
    )
    db.add(row)
    db.commit()
    return {"ok": True}


@admin_router.get("/analytics", response_model=AnalyticsDashboardOut)
def get_admin_analytics(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    now = datetime.now(timezone.utc)
    seven_days_ago = now - timedelta(days=7)
    fourteen_days_ago = now - timedelta(days=13)
    thirty_days_ago = now - timedelta(days=30)

    total_users = db.query(func.count(User.id)).scalar() or 0
    new_users_7d = db.query(func.count(User.id)).filter(User.created_at >= seven_days_ago).scalar() or 0
    total_submissions = db.query(func.count(Submission.id)).scalar() or 0
    total_checkpoints = db.query(func.count(SubmissionCheckpoint.id)).scalar() or 0
    shared_proofs = db.query(func.count(Submission.id)).filter(Submission.share_enabled == True).scalar() or 0
    total_events = db.query(func.count(AnalyticsEvent.id)).scalar() or 0

    recent_visitor_ids = {
        session_id
        for (session_id,) in (
            db.query(AnalyticsEvent.session_id)
            .filter(AnalyticsEvent.created_at >= thirty_days_ago, AnalyticsEvent.session_id.isnot(None))
            .distinct()
            .all()
        )
        if session_id
    }

    event_active_users = {
        user_id
        for (user_id,) in (
            db.query(AnalyticsEvent.user_id)
            .filter(AnalyticsEvent.created_at >= thirty_days_ago, AnalyticsEvent.user_id.isnot(None))
            .distinct()
            .all()
        )
        if user_id
    }
    submission_active_users = {
        owner_id
        for (owner_id,) in (
            db.query(Submission.owner_id)
            .filter(Submission.updated_at >= thirty_days_ago)
            .distinct()
            .all()
        )
        if owner_id
    }

    event_counts = {
        name: count
        for name, count in (
            db.query(AnalyticsEvent.event_name, func.count(AnalyticsEvent.id))
            .group_by(AnalyticsEvent.event_name)
            .all()
        )
    }

    funnel = [
        AnalyticsFunnelStepOut(label="Landing page views", value=event_counts.get("page_view:/", 0)),
        AnalyticsFunnelStepOut(label="Signup page views", value=event_counts.get("page_view:/signup", 0)),
        AnalyticsFunnelStepOut(label="Accounts created", value=event_counts.get("signup_completed", 0)),
        AnalyticsFunnelStepOut(label="Dashboard visits", value=event_counts.get("page_view:/dashboard", 0)),
        AnalyticsFunnelStepOut(label="Proofs created", value=event_counts.get("submission_created", 0)),
        AnalyticsFunnelStepOut(label="Checkpoints captured", value=event_counts.get("checkpoint_captured", 0)),
        AnalyticsFunnelStepOut(label="Proofs shared", value=event_counts.get("proof_shared", 0)),
    ]

    daily_buckets: dict[str, dict[str, int]] = {}
    for offset in range(14):
        day = (fourteen_days_ago + timedelta(days=offset)).date().isoformat()
        daily_buckets[day] = {
            "page_views": 0,
            "signups": 0,
            "proofs_created": 0,
            "checkpoints_captured": 0,
        }

    recent_events = (
        db.query(AnalyticsEvent, User.email)
        .outerjoin(User, AnalyticsEvent.user_id == User.id)
        .filter(AnalyticsEvent.created_at >= fourteen_days_ago)
        .order_by(AnalyticsEvent.created_at.desc())
        .all()
    )

    page_counter: Counter[str] = Counter()
    recent_event_cards: list[AnalyticsRecentEventOut] = []

    for row, email in recent_events:
        day_key = row.created_at.astimezone(timezone.utc).date().isoformat()
        bucket = daily_buckets.get(day_key)
        if bucket:
            if row.event_name.startswith("page_view:"):
                bucket["page_views"] += 1
            elif row.event_name == "signup_completed":
                bucket["signups"] += 1
            elif row.event_name == "submission_created":
                bucket["proofs_created"] += 1
            elif row.event_name == "checkpoint_captured":
                bucket["checkpoints_captured"] += 1

        if row.path:
            page_counter[row.path] += 1

        if len(recent_event_cards) < 12:
            try:
                metadata = json.loads(row.metadata_json) if row.metadata_json else {}
            except json.JSONDecodeError:
                metadata = {}
            recent_event_cards.append(
                AnalyticsRecentEventOut(
                    id=row.id,
                    event_name=row.event_name,
                    path=row.path,
                    created_at=row.created_at,
                    user_email=email,
                    session_id=row.session_id,
                    metadata=metadata,
                )
            )

    assignment_modes = [
        AnalyticsAssignmentModeOut(mode=mode or "unknown", count=count)
        for mode, count in (
            db.query(Submission.assignment_mode, func.count(Submission.id))
            .group_by(Submission.assignment_mode)
            .order_by(func.count(Submission.id).desc())
            .limit(6)
            .all()
        )
    ]

    top_pages = [
        AnalyticsPageViewOut(path=path, views=views)
        for path, views in page_counter.most_common(8)
    ]

    return AnalyticsDashboardOut(
        generated_at=now,
        kpis=AnalyticsKpiOut(
            total_users=total_users,
            new_users_7d=new_users_7d,
            total_submissions=total_submissions,
            total_checkpoints=total_checkpoints,
            shared_proofs=shared_proofs,
            total_events=total_events,
            unique_visitors_30d=len(recent_visitor_ids),
            active_writers_30d=len(event_active_users | submission_active_users),
        ),
        funnel=funnel,
        daily_activity=[
            AnalyticsDailyActivityOut(date=day, **metrics)
            for day, metrics in daily_buckets.items()
        ],
        top_pages=top_pages,
        assignment_modes=assignment_modes,
        recent_events=recent_event_cards,
    )

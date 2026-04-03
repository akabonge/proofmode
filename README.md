# ProofMode Secure Starter (Next.js + FastAPI)

A secure MVP starter for **ProofMode** focused on **humanities essays** and **business administration written deliverables**.

## What this starter includes
- Email/password auth with **Argon2** hashing
- Signed **JWT session cookies** (HttpOnly, SameSite=Lax)
- **CSRF** protection for unsafe requests
- Ownership-based authorization
- **Field-level encryption** of essay text and process answers using **Fernet**
- Prompt templates for:
  - `essay`
  - `business_case`
- Server-side **Proof PDF** generation
- Optional controlled sharing (`private`, `share_pdf`, `share_full`)
- Docker + Render blueprint

## Architecture
- **Web:** Next.js App Router
- **API:** FastAPI + SQLAlchemy
- **DB:** PostgreSQL
- **PDF:** ReportLab

## Security design
### Authentication
- Users register/login with email/password.
- Passwords are never stored in plain text.
- Session uses signed JWT in HttpOnly cookies.
- CSRF token is set separately and must be sent on all POST/PUT/DELETE requests.

### Authorization
- Every submission belongs to exactly one user.
- Only the owner can read/update/delete private submissions.
- Public access is opt-in and limited by visibility scope.

### Data protection
- Essay text and process answers are encrypted before writing to the database.
- Integrity hash is generated from canonical plaintext content at save time.
- Share links are random 32-byte tokens and can be revoked.

### Deployment
For the pilot, **Render** is enough.
Kubernetes is not needed for the first month. Add it only after:
1. 3+ active classes,
2. repeatable onboarding,
3. measured performance bottlenecks.

## Local development
```bash
docker compose up --build
```

- Web: http://localhost:3000
- API docs: http://localhost:8000/docs

## Required environment variables
### API
- `DATABASE_URL`
- `APP_SECRET`
- `FERNET_KEY`
- `CORS_ORIGINS`
- `COOKIE_SECURE` (`true` in production)

### WEB
- `NEXT_PUBLIC_API_BASE`

Generate a Fernet key:
```python
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

## Onboarding (pilot-ready)
### Student onboarding
1. Open ProofMode
2. Create account
3. Choose assignment type (`Essay` or `Business case`)
4. Paste/upload work and answer 5 prompts
5. Download Proof PDF and submit it with the assignment

### Instructor onboarding
1. Pick one assignment where process matters
2. Offer ProofMode as an optional attachment
3. Review 3-5 sample proofs
4. Rate usefulness and trust impact
5. Decide whether to keep or revise prompt template

## Pilot success metrics
- Median student completion time: **< 90 seconds**
- Instructor trust lift: **+2 points** on a 10-point scale
- Optional adoption rate: **25%+**
- PDF generation failure rate: **< 1%**

## Suggested next steps after the MVP
- Google Docs integration
- Revision snapshots
- Instructor-managed prompt sets
- Business administration templates for decks and models
- Event instrumentation and scale/load testing

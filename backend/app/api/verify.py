"""Public Zero-Knowledge Verification Gateway API."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.verification_service import issue_verification_token, verify_token

router = APIRouter(prefix="/api/verify", tags=["verification"])


class IssueTokenRequest(BaseModel):
    student_id: uuid.UUID
    requester_org: str = "Authorized Background Screener"
    purpose: str = "Employment Verification"
    ttl_hours: int = 72


@router.get("/{token}")
def get_verification_assertion(
    token: str,
    db: Session = Depends(get_db),
) -> dict:
    """Zero-knowledge student record verification endpoint.

    Never discloses APAAR IDs, raw internal IDs, dates of birth, or home addresses.
    Serves only minimal verified assertions and cryptographic HMAC proof.
    """
    result = verify_token(session=db, plaintext_token=token)
    return result


@router.post("/issue-token", status_code=status.HTTP_201_CREATED)
def issue_token_endpoint(
    req: IssueTokenRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Issues an ephemeral 72-hour cryptographic token for external verifiers."""
    try:
        raw_token, token_obj = issue_verification_token(
            session=db,
            student_id=req.student_id,
            requester_org=req.requester_org,
            purpose=req.purpose,
            ttl_hours=req.ttl_hours,
        )
        db.commit()
        return {
            "token": raw_token,
            "token_hash": token_obj.token_hash,
            "expires_at": token_obj.expires_at.isoformat(),
            "verification_url": f"/verify/{raw_token}",
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

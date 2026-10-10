"""Natural Language Assistant API router."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import get_current_user
from app.schemas.assistant import AssistantQueryRequest, AssistantQueryResponse
from app.services.assistant_service import AssistantService

router = APIRouter(prefix="/assistant", tags=["Assistant"])


@router.post(
    "/query",
    response_model=AssistantQueryResponse,
    status_code=status.HTTP_200_OK,
    summary="Process natural language attendance or compliance query",
)
async def query_assistant(
    body: AssistantQueryRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
) -> AssistantQueryResponse:
    """
    Parses a user's natural language question and returns an actionable response,
    including metrics, navigation targets, and suggested questions.
    """
    service = AssistantService(db)
    return await service.process_query(body.query, current_user)

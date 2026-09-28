import os

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.core.file_utils import MAX_DOCUMENT_BYTES, get_content_type_for_file, sanitize_filename
from app.core.storage import get_storage

router = APIRouter()


@router.get("/storage/file", tags=["storage"])
def get_stored_file(key: str) -> Response:
    """Download or stream stored file by key with automatic content-type detection."""
    if ".." in key or key.startswith(("/", "\\")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid storage key")

    storage = get_storage()
    raw = storage.get_bytes(key=key)
    if raw is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stored object with key '{key}' not found",
        )

    base_name = os.path.basename(key.split("?")[0])
    safe_name = sanitize_filename(base_name)
    content_type = get_content_type_for_file(safe_name)

    return Response(
        content=raw,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@router.put("/storage/file", tags=["storage"])
async def put_stored_file(key: str, request: Request) -> dict[str, str | bool]:
    """Direct upload endpoint for local and fallback environments."""
    if ".." in key or key.startswith(("/", "\\")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid storage key")

    body = await request.body()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File upload payload cannot be empty",
        )
    if len(body) > MAX_DOCUMENT_BYTES:
        max_mb = MAX_DOCUMENT_BYTES // (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {max_mb}MB.",
        )

    content_type = request.headers.get("content-type") or get_content_type_for_file(key)
    storage = get_storage()
    storage.upload_bytes(key=key, data=body, content_type=content_type)

    return {"success": True, "key": key, "message": "File stored successfully"}

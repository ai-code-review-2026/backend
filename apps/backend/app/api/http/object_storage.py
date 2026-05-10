"""
Object Storage API endpoints for MinIO/S3 operations.

Provides health check, file upload/download, and management APIs.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

from app.integrations.object_storage.s3_minio_client import get_minio_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/storage", tags=["object-storage"])


# ─── Response Models ──────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    enabled: bool
    status: str
    endpoint: str
    bucket: str
    details: str | None


class UploadResponse(BaseModel):
    success: bool
    object_path: str | None
    message: str


class ObjectInfo(BaseModel):
    name: str
    size: int | None
    last_modified: str | None
    etag: str | None


class ListObjectsResponse(BaseModel):
    success: bool
    objects: list[ObjectInfo]
    count: int


class PresignedUrlResponse(BaseModel):
    success: bool
    url: str | None
    expires_in: int


class DeleteResponse(BaseModel):
    success: bool
    message: str


# ─── Health Check ─────────────────────────────────────────────────────────────

@router.get("/health", response_model=HealthResponse)
async def storage_health():
    """Check object storage health and connectivity."""
    client = get_minio_client()
    health = client.health_check()
    return HealthResponse(**health)


# ─── File Operations ──────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    path: str | None = Query(default=None, description="Custom path/name for the object"),

):
    """Upload a file to object storage.

    Args:
        file: The file to upload
        path: Optional custom path/name for the object (defaults to original filename)
    """
    client = get_minio_client()

    if not client._enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is not enabled",
        )

    try:
        content = await file.read()
        object_name = path or file.filename or "unnamed_file"
        content_type = file.content_type or "application/octet-stream"

        result = client.put_object(object_name, content, content_type)

        if result:
            return UploadResponse(
                success=True,
                object_path=result,
                message=f"File uploaded successfully as {object_name}",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to upload file to object storage",
            )
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}",
        )


@router.get("/download/{object_name:path}")
async def download_file(
    object_name: str,

):
    """Download a file from object storage.

    Returns the file content with appropriate content-type header.
    """
    from fastapi.responses import Response

    client = get_minio_client()

    if not client._enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is not enabled",
        )

    content = client.get_object(object_name)

    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object '{object_name}' not found",
        )

    # Determine content type from extension
    import mimetypes
    content_type, _ = mimetypes.guess_type(object_name)
    if content_type is None:
        content_type = "application/octet-stream"

    return Response(
        content=content,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{object_name.split("/")[-1]}"'
        },
    )


@router.get("/presigned-url/{object_name:path}", response_model=PresignedUrlResponse)
async def get_presigned_url(
    object_name: str,
    expires_in: int = Query(default=3600, ge=60, le=86400, description="URL expiry in seconds"),

):
    """Generate a presigned URL for downloading an object.

    Args:
        object_name: The object path/name
        expires_in: URL expiry time in seconds (60-86400, default 3600)
    """
    client = get_minio_client()

    if not client._enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is not enabled",
        )

    url = client.get_presigned_url(object_name, expires_in)

    if url is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Could not generate URL for '{object_name}'",
        )

    return PresignedUrlResponse(success=True, url=url, expires_in=expires_in)


@router.get("/list", response_model=ListObjectsResponse)
async def list_objects(
    prefix: str = Query(default="", description="Filter objects by prefix"),
    max_keys: int = Query(default=100, ge=1, le=1000, description="Maximum objects to return"),

):
    """List objects in the storage bucket.

    Args:
        prefix: Filter objects by prefix (e.g., "uploads/", "analyses/")
        max_keys: Maximum number of objects to return (1-1000, default 100)
    """
    client = get_minio_client()

    if not client._enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is not enabled",
        )

    objects = client.list_objects(prefix, max_keys)

    if objects is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list objects",
        )

    return ListObjectsResponse(
        success=True,
        objects=[ObjectInfo(**obj) for obj in objects],
        count=len(objects),
    )


@router.delete("/delete/{object_name:path}", response_model=DeleteResponse)
async def delete_file(
    object_name: str,

):
    """Delete an object from storage.

    Args:
        object_name: The object path/name to delete
    """
    client = get_minio_client()

    if not client._enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage is not enabled",
        )

    success = client.delete_object(object_name)

    if success:
        return DeleteResponse(success=True, message=f"Object '{object_name}' deleted successfully")
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Failed to delete object '{object_name}'",
        )

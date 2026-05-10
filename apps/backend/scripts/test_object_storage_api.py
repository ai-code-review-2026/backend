#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Object Storage API Endpoints

This script tests all MinIO Object Storage API endpoints created in PART 1.
"""

import sys
import os
from pathlib import Path

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx
import io
from app.settings import settings

BASE_URL = "http://localhost:8000"
API_PREFIX = "/api/v1"


def print_section(title: str):
    """Print a section header."""
    print(f"\n{'=' * 70}")
    print(f"  {title}")
    print('=' * 70)


def print_test(name: str, passed: bool, details: str = ""):
    """Print test result."""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status} - {name}")
    if details:
        print(f"    {details}")


def test_health_check():
    """Test the storage health check endpoint."""
    print_section("Testing Storage Health Check")
    
    try:
        response = httpx.get(f"{BASE_URL}{API_PREFIX}/storage/health", timeout=10.0)
        data = response.json()
        
        passed = (
            response.status_code == 200
            and data.get("status") == "healthy"
            and data.get("bucket") == settings.MINIO_BUCKET
        )
        
        print_test(
            "GET /storage/health",
            passed,
            f"Status: {data.get('status')}, Bucket: {data.get('bucket')}"
        )
        return passed
    except Exception as e:
        print_test("GET /storage/health", False, f"Error: {e}")
        return False


def test_file_upload():
    """Test file upload endpoint."""
    print_section("Testing File Upload")
    
    try:
        # Create a test file
        test_content = b"This is a test file for MinIO storage."
        files = {"file": ("test_file.txt", io.BytesIO(test_content), "text/plain")}
        
        response = httpx.post(
            f"{BASE_URL}{API_PREFIX}/storage/upload",
            files=files,
            timeout=30.0
        )
        data = response.json()
        
        passed = (
            response.status_code == 200
            and "object_name" in data
            and "url" in data
        )
        
        print_test(
            "POST /storage/upload",
            passed,
            f"Object: {data.get('object_name', 'N/A')}"
        )
        
        if passed:
            return data["object_name"]
        return None
    except Exception as e:
        print_test("POST /storage/upload", False, f"Error: {e}")
        return None


def test_list_objects():
    """Test list objects endpoint."""
    print_section("Testing List Objects")
    
    try:
        response = httpx.get(f"{BASE_URL}{API_PREFIX}/storage/list", timeout=10.0)
        data = response.json()
        
        passed = (
            response.status_code == 200
            and "objects" in data
            and isinstance(data["objects"], list)
        )
        
        print_test(
            "GET /storage/list",
            passed,
            f"Found {len(data.get('objects', []))} objects"
        )
        return passed
    except Exception as e:
        print_test("GET /storage/list", False, f"Error: {e}")
        return False


def test_presigned_url(object_name: str):
    """Test presigned URL generation."""
    print_section("Testing Presigned URL Generation")
    
    if not object_name:
        print_test("GET /storage/presigned-url/{name}", False, "No object to test with")
        return False
    
    try:
        response = httpx.get(
            f"{BASE_URL}{API_PREFIX}/storage/presigned-url/{object_name}",
            params={"expiry": 3600},
            timeout=10.0
        )
        data = response.json()
        
        passed = (
            response.status_code == 200
            and "url" in data
            and "expires_in" in data
        )
        
        print_test(
            "GET /storage/presigned-url/{name}",
            passed,
            f"Expires in: {data.get('expires_in', 'N/A')} seconds"
        )
        return passed
    except Exception as e:
        print_test("GET /storage/presigned-url/{name}", False, f"Error: {e}")
        return False


def test_file_download(object_name: str):
    """Test file download endpoint."""
    print_section("Testing File Download")
    
    if not object_name:
        print_test("GET /storage/download/{name}", False, "No object to test with")
        return False
    
    try:
        response = httpx.get(
            f"{BASE_URL}{API_PREFIX}/storage/download/{object_name}",
            timeout=30.0
        )
        
        passed = (
            response.status_code == 200
            and len(response.content) > 0
        )
        
        print_test(
            "GET /storage/download/{name}",
            passed,
            f"Downloaded {len(response.content)} bytes"
        )
        return passed
    except Exception as e:
        print_test("GET /storage/download/{name}", False, f"Error: {e}")
        return False


def test_file_delete(object_name: str):
    """Test file deletion endpoint."""
    print_section("Testing File Deletion")
    
    if not object_name:
        print_test("DELETE /storage/delete/{name}", False, "No object to test with")
        return False
    
    try:
        response = httpx.delete(
            f"{BASE_URL}{API_PREFIX}/storage/delete/{object_name}",
            timeout=10.0
        )
        data = response.json()
        
        passed = (
            response.status_code == 200
            and data.get("message") == "Object deleted successfully"
        )
        
        print_test(
            "DELETE /storage/delete/{name}",
            passed,
            f"Object: {data.get('object_name', 'N/A')}"
        )
        return passed
    except Exception as e:
        print_test("DELETE /storage/delete/{name}", False, f"Error: {e}")
        return False


def main():
    """Run all tests."""
    print_section("Object Storage API E2E Tests")
    print(f"Backend URL: {BASE_URL}")
    print(f"MinIO Endpoint: {settings.MINIO_ENDPOINT}")
    print(f"Bucket: {settings.MINIO_BUCKET}")
    
    results = {}
    
    # Test 1: Health Check
    results["health"] = test_health_check()
    
    # Test 2: Upload File
    uploaded_object = test_file_upload()
    results["upload"] = uploaded_object is not None
    
    # Test 3: List Objects
    results["list"] = test_list_objects()
    
    # Test 4: Presigned URL
    results["presigned"] = test_presigned_url(uploaded_object)
    
    # Test 5: Download File
    results["download"] = test_file_download(uploaded_object)
    
    # Test 6: Delete File
    results["delete"] = test_file_delete(uploaded_object)
    
    # Summary
    print_section("Test Summary")
    total = len(results)
    passed = sum(1 for v in results.values() if v)
    failed = total - passed
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    
    if failed == 0:
        print("\n✅ All Object Storage API tests passed!")
        return 0
    else:
        print(f"\n❌ {failed} test(s) failed.")
        return 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nTests interrupted by user.")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

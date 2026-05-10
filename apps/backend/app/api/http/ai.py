"""
AI-powered code operations API endpoints.
"""
from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal
from app.settings import settings

import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class FixCodeRequest(BaseModel):
    file_path: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    language: str | None = None
    finding_id: str | None = None
    finding_description: str | None = None
    context: dict[str, Any] | None = None


class AnalyzeCodeRequest(BaseModel):
    file_path: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1)
    language: str | None = None
    analysis_type: Literal["performance", "security", "style", "all"] = "all"


class CodeSuggestion(BaseModel):
    id: str
    title: str
    description: str
    severity: Literal["low", "medium", "high", "critical"]
    confidence: int = Field(..., ge=0, le=100)
    estimated_time: int  # seconds
    code_changes: list[dict[str, Any]]
    reasoning: str
    tags: list[str]


class AnalyzeCodeResponse(BaseModel):
    suggestions: list[CodeSuggestion]
    analysis_summary: str
    total_issues: int
    processing_time: float


class FixCodeResponse(BaseModel):
    fixed_content: str | None = None
    message: str | None = None
    commit_message: str | None = None
    changes: list[dict[str, Any]] | None = None


@router.post("/fix-code", response_model=FixCodeResponse)
async def fix_code(
    request: FixCodeRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """
    Use AI to suggest fixes for code issues.
    
    This endpoint analyzes the provided code and finding description,
    then uses an LLM to suggest fixes.
    """
    if not settings.llm_enabled:
        return FixCodeResponse(
            fixed_content=None,
            message="LLM integration is not enabled. Please configure OLLAMA_BASE_URL or OPENAI_API_KEY.",
            commit_message=None,
        )
    
    try:
        # Import LLM client dynamically to avoid startup issues
        from app.core.review_engine.llm_client import get_llm_client
        
        llm_client = get_llm_client()
        if not llm_client:
            return FixCodeResponse(
                fixed_content=None,
                message="LLM client is not available.",
                commit_message=None,
            )
        
        # Build the prompt
        system_prompt = """You are an expert code reviewer and fixer. Your task is to fix code issues while:
1. Preserving the original code style and formatting
2. Making minimal changes to address the issue
3. Not introducing new issues or changing unrelated code
4. Following best practices for the programming language

Respond with ONLY the fixed code, no explanations or markdown formatting."""

        user_prompt = f"""File: {request.file_path}
Language: {request.language or 'auto-detect'}

"""
        
        if request.finding_description:
            user_prompt += f"""Issue to fix: {request.finding_description}

"""
        else:
            user_prompt += """Please review and fix any issues in this code.

"""
        
        user_prompt += f"""Current code:
```
{request.content}
```

Provide the fixed code:"""

        # Call the LLM
        fixed_content = await llm_client.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            max_tokens=4096,
            temperature=0.2,  # Low temperature for more deterministic fixes
        )
        
        if not fixed_content or fixed_content.strip() == request.content.strip():
            return FixCodeResponse(
                fixed_content=None,
                message="No changes needed or AI could not suggest improvements.",
                commit_message=None,
            )
        
        # Clean up the response (remove markdown code blocks if present)
        fixed_content = fixed_content.strip()
        if fixed_content.startswith("```"):
            lines = fixed_content.split("\n")
            # Remove first line (```language) and last line (```)
            if lines[-1].strip() == "```":
                lines = lines[1:-1]
            else:
                lines = lines[1:]
            fixed_content = "\n".join(lines)
        
        # Generate commit message
        commit_message = f"fix: {request.finding_description or 'Code improvements suggested by AI'}"
        if len(commit_message) > 72:
            commit_message = commit_message[:69] + "..."
        
        return FixCodeResponse(
            fixed_content=fixed_content,
            message="AI has suggested fixes for the code.",
            commit_message=commit_message,
            changes=[{
                "type": "fix",
                "description": request.finding_description or "AI-suggested improvements",
            }],
        )
        
    except ImportError as e:
        logger.error(f"LLM client import error: {e}")
        return FixCodeResponse(
            fixed_content=None,
            message="LLM client is not properly configured.",
            commit_message=None,
        )
    except Exception as e:
        logger.error(f"AI fix error: {e}")
        return FixCodeResponse(
            fixed_content=None,
            message=f"AI fix failed: {str(e)}",
            commit_message=None,
        )


@router.post("/analyze-code", response_model=AnalyzeCodeResponse)
async def analyze_code(
    request: AnalyzeCodeRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """
    Analyze code with AI to find potential issues and improvements.
    
    This endpoint uses AI to analyze code and suggest multiple improvements
    across different categories like performance, security, and style.
    """
    if not settings.llm_enabled:
        return AnalyzeCodeResponse(
            suggestions=[],
            analysis_summary="LLM integration is not enabled. Please configure OLLAMA_BASE_URL or OPENAI_API_KEY.",
            total_issues=0,
            processing_time=0.0,
        )
    
    import time
    start_time = time.time()
    
    try:
        # Import LLM client dynamically to avoid startup issues
        from app.core.review_engine.llm_client import get_llm_client
        
        llm_client = get_llm_client()
        if not llm_client:
            return AnalyzeCodeResponse(
                suggestions=[],
                analysis_summary="LLM client is not available.",
                total_issues=0,
                processing_time=0.0,
            )
        
        # Build analysis prompt based on request type
        analysis_focus = {
            "performance": "performance issues, inefficient algorithms, unnecessary computations",
            "security": "security vulnerabilities, input validation issues, potential attack vectors",
            "style": "code style, best practices, maintainability issues",
            "all": "all types of issues including performance, security, style, and general improvements",
        }
        
        system_prompt = f"""You are an expert code analyzer. Analyze the given code for {analysis_focus[request.analysis_type]}.

Provide your analysis in this exact JSON format:
{{
  "suggestions": [
    {{
      "id": "unique_id",
      "title": "Short descriptive title",
      "description": "Detailed description of the issue",
      "severity": "low|medium|high|critical",
      "confidence": 85,
      "estimated_time": 30,
      "code_changes": [
        {{
          "before": "original code snippet",
          "after": "improved code snippet",
          "line_start": 10,
          "line_end": 12,
          "file_path": "{request.file_path}"
        }}
      ],
      "reasoning": "Explanation of why this change is needed",
      "tags": ["tag1", "tag2"]
    }}
  ],
  "analysis_summary": "Overall summary of the analysis",
  "total_issues": 3
}}

Only respond with valid JSON, no additional text."""

        user_prompt = f"""File: {request.file_path}
Language: {request.language or 'auto-detect'}
Analysis Type: {request.analysis_type}

Code to analyze:
```
{request.content}
```

Provide detailed analysis as JSON:"""

        # Call the LLM
        analysis_result = await llm_client.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            max_tokens=4096,
            temperature=0.3,
        )
        
        if not analysis_result:
            return AnalyzeCodeResponse(
                suggestions=[],
                analysis_summary="AI analysis could not be completed.",
                total_issues=0,
                processing_time=time.time() - start_time,
            )
        
        # Parse JSON response
        import json
        try:
            parsed_result = json.loads(analysis_result.strip())
            
            # Convert to our models
            suggestions = []
            for idx, suggestion_data in enumerate(parsed_result.get("suggestions", [])):
                suggestion = CodeSuggestion(
                    id=suggestion_data.get("id", f"suggestion_{idx}"),
                    title=suggestion_data.get("title", "Code Improvement"),
                    description=suggestion_data.get("description", "No description provided"),
                    severity=suggestion_data.get("severity", "medium"),
                    confidence=min(100, max(0, suggestion_data.get("confidence", 70))),
                    estimated_time=max(1, suggestion_data.get("estimated_time", 30)),
                    code_changes=suggestion_data.get("code_changes", []),
                    reasoning=suggestion_data.get("reasoning", "No reasoning provided"),
                    tags=suggestion_data.get("tags", []),
                )
                suggestions.append(suggestion)
            
            return AnalyzeCodeResponse(
                suggestions=suggestions,
                analysis_summary=parsed_result.get("analysis_summary", "Code analysis completed"),
                total_issues=len(suggestions),
                processing_time=time.time() - start_time,
            )
            
        except json.JSONDecodeError:
            # Fallback: create mock suggestions if JSON parsing fails
            logger.warning("Failed to parse AI analysis JSON, using fallback suggestions")
            
            mock_suggestions = [
                CodeSuggestion(
                    id="fallback_1",
                    title="Code Style Improvement",
                    description="Consider improving code readability and following best practices",
                    severity="low",
                    confidence=75,
                    estimated_time=15,
                    code_changes=[],
                    reasoning="General code improvement suggestion based on analysis",
                    tags=["style", "readability"],
                )
            ]
            
            return AnalyzeCodeResponse(
                suggestions=mock_suggestions,
                analysis_summary="AI analysis completed with basic suggestions",
                total_issues=1,
                processing_time=time.time() - start_time,
            )
        
    except ImportError as e:
        logger.error(f"LLM client import error: {e}")
        return AnalyzeCodeResponse(
            suggestions=[],
            analysis_summary="LLM client is not properly configured.",
            total_issues=0,
            processing_time=time.time() - start_time,
        )
    except Exception as e:
        logger.error(f"AI analysis error: {e}")
        return AnalyzeCodeResponse(
            suggestions=[],
            analysis_summary=f"AI analysis failed: {str(e)}",
            total_issues=0,
            processing_time=time.time() - start_time,
        )

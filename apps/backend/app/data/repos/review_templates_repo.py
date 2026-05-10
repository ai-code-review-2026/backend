from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine


@dataclass
class CreateReviewTemplateInput:
    """Input for creating a review template"""
    created_by: str
    name: str
    category: str  # 'security', 'performance', 'general', 'critical_change', 'frontend', 'backend'
    description: str | None = None
    organization_id: str | None = None
    is_default: bool = False
    is_public: bool = False
    checklist_items: list[dict[str, Any]] = field(default_factory=list)
    guidelines: str | None = None
    auto_apply_rules: dict[str, Any] = field(default_factory=dict)


@dataclass
class UpdateReviewTemplateInput:
    """Input for updating a review template"""
    name: str | None = None
    description: str | None = None
    is_default: bool | None = None
    is_public: bool | None = None
    checklist_items: list[dict[str, Any]] | None = None
    guidelines: str | None = None
    auto_apply_rules: dict[str, Any] | None = None


class ReviewTemplatesRepo:
    """Repository for review templates"""

    def __init__(self, engine: Engine | None = None):
        self._engine = engine or get_engine()

    def create_template(self, input_data: CreateReviewTemplateInput) -> str:
        """Create a new review template"""
        template_id = f"tpl_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        query = text("""
            INSERT INTO review_templates (
                id, created_by, organization_id, name, description, category,
                is_default, is_public, checklist_items, guidelines, auto_apply_rules,
                usage_count, created_at, updated_at
            )
            VALUES (
                :id, :created_by, :organization_id, :name, :description, :category,
                :is_default, :is_public, :checklist_items, :guidelines, :auto_apply_rules,
                :usage_count, :created_at, :updated_at
            )
            RETURNING id
        """)

        import json

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": template_id,
                    "created_by": input_data.created_by,
                    "organization_id": input_data.organization_id,
                    "name": input_data.name,
                    "description": input_data.description,
                    "category": input_data.category,
                    "is_default": input_data.is_default,
                    "is_public": input_data.is_public,
                    "checklist_items": json.dumps(input_data.checklist_items),
                    "guidelines": input_data.guidelines,
                    "auto_apply_rules": json.dumps(input_data.auto_apply_rules),
                    "usage_count": 0,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            return result.scalar_one()

    def get_template_by_id(self, template_id: str) -> RowMapping | None:
        """Get template by ID"""
        query = text("""
            SELECT * FROM review_templates WHERE id = :id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"id": template_id})
            row = result.mappings().first()
            return row

    def get_templates_by_category(
        self,
        category: str,
        user_id: str | None = None,
        organization_id: str | None = None,
    ) -> list[RowMapping]:
        """Get templates by category (considering visibility)"""
        conditions = ["category = :category"]
        params: dict[str, Any] = {"category": category}

        if user_id:
            # User can see: public templates, their own templates
            conditions.append("(is_public = true OR created_by = :user_id)")
            params["user_id"] = user_id
        else:
            # Only public templates
            conditions.append("is_public = true")

        if organization_id:
            conditions.append("(organization_id IS NULL OR organization_id = :organization_id)")
            params["organization_id"] = organization_id

        query = text(f"""
            SELECT * FROM review_templates
            WHERE {" AND ".join(conditions)}
            ORDER BY is_default DESC, usage_count DESC, name ASC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def get_templates_by_user(self, user_id: str) -> list[RowMapping]:
        """Get all templates created by a user"""
        query = text("""
            SELECT * FROM review_templates
            WHERE created_by = :user_id
            ORDER BY created_at DESC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"user_id": user_id})
            return list(result.mappings().all())

    def get_public_templates(
        self,
        organization_id: str | None = None,
    ) -> list[RowMapping]:
        """Get all public templates"""
        if organization_id:
            query = text("""
                SELECT * FROM review_templates
                WHERE is_public = true
                AND (organization_id IS NULL OR organization_id = :organization_id)
                ORDER BY category, usage_count DESC, name ASC
            """)
            params = {"organization_id": organization_id}
        else:
            query = text("""
                SELECT * FROM review_templates
                WHERE is_public = true AND organization_id IS NULL
                ORDER BY category, usage_count DESC, name ASC
            """)
            params = {}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def get_default_template(
        self,
        category: str,
        organization_id: str | None = None,
    ) -> RowMapping | None:
        """Get default template for a category"""
        if organization_id:
            query = text("""
                SELECT * FROM review_templates
                WHERE category = :category AND is_default = true
                AND (organization_id IS NULL OR organization_id = :organization_id)
                ORDER BY organization_id DESC NULLS LAST
                LIMIT 1
            """)
            params = {"category": category, "organization_id": organization_id}
        else:
            query = text("""
                SELECT * FROM review_templates
                WHERE category = :category AND is_default = true
                AND organization_id IS NULL
                LIMIT 1
            """)
            params = {"category": category}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            row = result.mappings().first()
            return row

    def update_template(
        self,
        template_id: str,
        update_data: UpdateReviewTemplateInput,
    ) -> bool:
        """Update a template"""
        now = datetime.now(timezone.utc).isoformat()
        updates = []
        params: dict[str, Any] = {"id": template_id, "updated_at": now}

        if update_data.name is not None:
            updates.append("name = :name")
            params["name"] = update_data.name

        if update_data.description is not None:
            updates.append("description = :description")
            params["description"] = update_data.description

        if update_data.is_default is not None:
            updates.append("is_default = :is_default")
            params["is_default"] = update_data.is_default

        if update_data.is_public is not None:
            updates.append("is_public = :is_public")
            params["is_public"] = update_data.is_public

        if update_data.checklist_items is not None:
            import json
            updates.append("checklist_items = :checklist_items")
            params["checklist_items"] = json.dumps(update_data.checklist_items)

        if update_data.guidelines is not None:
            updates.append("guidelines = :guidelines")
            params["guidelines"] = update_data.guidelines

        if update_data.auto_apply_rules is not None:
            import json
            updates.append("auto_apply_rules = :auto_apply_rules")
            params["auto_apply_rules"] = json.dumps(update_data.auto_apply_rules)

        if not updates:
            return False

        updates.append("updated_at = :updated_at")
        query = text(f"""
            UPDATE review_templates
            SET {", ".join(updates)}
            WHERE id = :id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(query, params)
            return result.rowcount > 0

    def increment_usage_count(self, template_id: str) -> bool:
        """Increment usage count when template is applied"""
        query = text("""
            UPDATE review_templates
            SET usage_count = usage_count + 1,
                updated_at = :updated_at
            WHERE id = :id
        """)

        now = datetime.now(timezone.utc).isoformat()

        with self._engine.begin() as conn:
            result = conn.execute(query, {"id": template_id, "updated_at": now})
            return result.rowcount > 0

    def delete_template(self, template_id: str) -> bool:
        """Delete a template"""
        query = text("DELETE FROM review_templates WHERE id = :id")

        with self._engine.begin() as conn:
            result = conn.execute(query, {"id": template_id})
            return result.rowcount > 0

    def get_templates_stats(self, organization_id: str | None = None) -> dict[str, Any]:
        """Get template usage statistics"""
        if organization_id:
            query = text("""
                SELECT
                    COUNT(*) as total_templates,
                    COUNT(*) FILTER (WHERE is_public = true) as public_templates,
                    COUNT(*) FILTER (WHERE is_default = true) as default_templates,
                    SUM(usage_count) as total_usage,
                    AVG(usage_count) as avg_usage_per_template
                FROM review_templates
                WHERE organization_id IS NULL OR organization_id = :organization_id
            """)
            params = {"organization_id": organization_id}
        else:
            query = text("""
                SELECT
                    COUNT(*) as total_templates,
                    COUNT(*) FILTER (WHERE is_public = true) as public_templates,
                    COUNT(*) FILTER (WHERE is_default = true) as default_templates,
                    SUM(usage_count) as total_usage,
                    AVG(usage_count) as avg_usage_per_template
                FROM review_templates
                WHERE organization_id IS NULL
            """)
            params = {}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            row = result.mappings().first()
            return dict(row) if row else {}
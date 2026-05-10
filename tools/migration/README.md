# Migration Tools

Database and data migration scripts.

## Purpose

This directory is reserved for:
- Database schema migration helpers
- Data transformation scripts
- Migration between environments
- Bulk data operations

## Usage

Migration scripts should:
1. Be idempotent (safe to run multiple times)
2. Include rollback procedures
3. Log all operations
4. Validate data before/after migration

## Examples

```bash
# Example migration script structure:
python tools/migration/migrate_user_data.py \
  --source-db <source> \
  --target-db <target> \
  --dry-run

# Always test with --dry-run first!
```

## Alembic Migrations

For database schema migrations, use Alembic in `apps/backend/alembic/`:
```bash
make migrate              # Apply migrations
make migrate-create m="migration description"  # Create new migration
make migrate-history      # View migration history
```

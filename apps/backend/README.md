# KaramStay Backend

FastAPI backend for KaramStay.

## Local Commands

```powershell
cd apps/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
alembic upgrade head
uvicorn app.main:app --reload
```

Required environment variables are listed in `.env.example`.

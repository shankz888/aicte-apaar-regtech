# Backend

FastAPI service backed by PostgreSQL, SQLAlchemy 2.x, and Alembic.

## Local setup

From this directory, create and activate a virtual environment, then install the
package and development dependencies:

```sh
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
```

Copy `.env.example` to `.env` and set `DATABASE_URL` for a running PostgreSQL
instance. Apply migrations and load the sample institutions with:

```sh
alembic upgrade head
python -m scripts.seed
```

Run the API with `uvicorn app.main:app --reload` and the schema checks with
`pytest`.

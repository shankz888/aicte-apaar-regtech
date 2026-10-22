from fastapi import FastAPI

from app.api.admin import router as admin_router
from app.api.batches import router as batches_router
from app.api.benchmark import router as benchmark_router
from app.api.verify import router as verify_router

app = FastAPI(title="AICTE Student Data Verification API")

app.include_router(batches_router)
app.include_router(verify_router)
app.include_router(benchmark_router)
app.include_router(admin_router)


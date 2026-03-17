import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

load_dotenv()

from src.database import init_db
from src.scheduler import setup_scheduler
from src.routers import draw, analysis, purchase

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    setup_scheduler()
    yield

app = FastAPI(title="Lotto Oracle", lifespan=lifespan)

app.include_router(draw.router)
app.include_router(analysis.router)
app.include_router(purchase.router)

app.mount("/static", StaticFiles(directory="public"), name="static")

@app.get("/")
def index():
    return FileResponse("public/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "src.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=False,
    )

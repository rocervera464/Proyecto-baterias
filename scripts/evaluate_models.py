"""Repository-root entry point for reproducible v4 evaluation reports."""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).resolve().parents[1] / "backend/scripts/evaluate_models.py"), run_name="__main__")

"""
Download and extract the shared MovieLens dataset from Google Drive.

Google Drive folder: https://drive.google.com/drive/folders/1PtwDEUqqSup22Auam0fT7G2Jvils1N2a
Dataset file: movies-database.zip

Usage:
    python scripts/download_data.py

Requires:
    pip install gdown
"""

import zipfile
from pathlib import Path

import gdown

FILE_ID = "1hlo1s_uP15gpF4j1fz1_WcQamLVQeRsT"
ZIP_NAME = "movies-database.zip"

# Paths relative to the repo root
REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "movies-database"
ZIP_PATH = DATA_DIR / ZIP_NAME
# Sentinel file to detect already-extracted data
SENTINEL = DATA_DIR / "ratings.csv"


def download():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if SENTINEL.exists():
        print(f"Data already present at {DATA_DIR} — skipping download.")
        return

    print("Downloading dataset from Google Drive...")
    url = f"https://drive.google.com/uc?id={FILE_ID}"
    gdown.download(url=url, output=str(ZIP_PATH), quiet=False)

    print(f"Extracting {ZIP_NAME}...")
    with zipfile.ZipFile(ZIP_PATH, "r") as zf:
        for member in zf.infolist():
            # Strip the top-level directory (e.g. "ml-25m/") from each path
            parts = Path(member.filename).parts
            relative = Path(*parts[1:]) if len(parts) > 1 else None
            if relative is None or str(relative) == ".":
                continue
            dest = DATA_DIR / relative
            if member.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(zf.read(member.filename))

    ZIP_PATH.unlink()
    print("Extraction complete. Zip file removed.")


if __name__ == "__main__":
    download()

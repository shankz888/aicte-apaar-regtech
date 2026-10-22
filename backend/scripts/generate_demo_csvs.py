"""Generate PRD Section 10 synthetic demonstration datasets with valid Verhoeff checksums."""

import csv
from pathlib import Path
import sys

# Ensure backend root is on python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.apaar_adapter import MockApaarServiceAdapter

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
PUBLIC_DEMO_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "demo_data"
PUBLIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "public"

DATA_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DEMO_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = [
    "apaar_id",
    "full_name",
    "gender",
    "programme_code",
    "academic_year",
    "admission_category",
    "start_date",
    "end_date",
]

# Standard template
with open(DATA_DIR / "template_v2026.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(HEADERS)

with open(PUBLIC_DIR / "template_v2026.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(HEADERS)

# 1. synthetic_batch_overintake_135.csv (135 rows, capacity 120 -> 15 CAP-001 rejections)
overintake_rows = []
for i in range(1, 136):
    apaar = MockApaarServiceAdapter.generate_valid_apaar_id(90000000000 + i)
    name = f"Student {i:03d} Demo"
    gender = "male" if i % 2 == 0 else "female"
    prog = "BTECH-CSE"
    year = "2026-2027"
    category = "general"
    start = "2026-08-01"
    end = ""
    overintake_rows.append([apaar, name, gender, prog, year, category, start, end])

for target_dir in [DATA_DIR, PUBLIC_DEMO_DIR]:
    with open(target_dir / "synthetic_batch_overintake_135.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADERS)
        writer.writerows(overintake_rows)

# 2. synthetic_batch_concurrent_transfer.csv (Contains active APAAR clash with another college)
# APAAR for Rahul Verma will clash with student enrolled at Institution B
clash_apaar = MockApaarServiceAdapter.generate_valid_apaar_id(99998888777)
c1_apaar = MockApaarServiceAdapter.generate_valid_apaar_id(80000000001)
c2_apaar = MockApaarServiceAdapter.generate_valid_apaar_id(80000000002)
c4_apaar = MockApaarServiceAdapter.generate_valid_apaar_id(80000000004)

clash_rows = [
    [c1_apaar, "Aakash Mehta", "male", "BTECH-CSE", "2026-2027", "general", "2026-08-01", ""],
    [c2_apaar, "Pooja Hegde", "female", "BTECH-CSE", "2026-2027", "general", "2026-08-01", ""],
    [clash_apaar, "Rahul Verma", "male", "BTECH-CSE", "2026-2027", "general", "2026-08-01", ""], # DUP-002
    [c4_apaar, "Ananya Rao", "female", "BTECH-CSE", "2026-2027", "general", "2026-08-01", ""],
]

for target_dir in [DATA_DIR, PUBLIC_DEMO_DIR]:
    with open(target_dir / "synthetic_batch_concurrent_transfer.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(HEADERS)
        writer.writerows(clash_rows)

print("Generated demonstration datasets with valid Verhoeff checksums!")

# OR/CR OCR Scanner — VNS Trucking

Scans paper OR/CR documents, OCRs them, matches each file to a plate number
from the Central Dispatch API, extracts registration fields, and writes a
review-ready Excel file. **No data is written back to Google Sheets or the API.**

---

## Prerequisites

### 1. Python 3.10+
Download from https://www.python.org/downloads/

### 2. Tesseract OCR
Download the Windows installer from https://github.com/UB-Mannheim/tesseract/wiki
Install to the default path: `C:\Program Files\Tesseract-OCR\`

### 3. Python dependencies
Open a terminal in this folder and run:
```
pip install -r requirements.txt
```

---

## Folder structure expected
```
C:\Users\User\Documents\AllTrucksORCR\ORCR NEW UPDATED\
  ├── ABC123.pdf
  ├── DEF456.jpg
  └── subfolder\
        └── GHI789.pdf
```
Subfolders are scanned recursively. Supported formats: PDF, JPG, JPEG, PNG, TIFF, BMP.

---

## How to run

Open a terminal (PowerShell or CMD) in this folder:
```
cd "C:\Users\User\Desktop\vns website\tools\orcr_scanner"
python orcr_scanner.py
```

The script will:
1. Fetch current plate numbers from the Central Dispatch API
2. Scan all files under the ORCR folder
3. OCR each file using Tesseract
4. Match files to plate numbers (filename → OCR text → fuzzy)
5. Extract registration fields from OCR text
6. Write `output\truck_master_extracted.xlsx`
7. Write a log to `output\orcr_scan.log`

---

## Output: `output\truck_master_extracted.xlsx`

| Sheet | Contents |
|---|---|
| **Truck_Master_Extracted** | All matched files with extracted fields. Rows flagged amber = Needs Review. |
| **Missing_ORCR** | Plate numbers from the API that had no matching file found. Rows flagged salmon. |
| **Unmatched_Files** | Files that could not be matched to any plate number. |
| **Raw_Debug** | Every file processed: match result, score, confidence, raw OCR preview. |

---

## Fields extracted per truck

| Column | Source |
|---|---|
| Plate Number | Matched from API roster |
| Matched File Name / Path | The scanned file |
| Match Method | `filename_exact`, `ocr_exact`, `fuzzy_filename`, or `fuzzy_ocr` |
| Match Score | 0–100 (100 = exact) |
| Registered Owner | OCR regex |
| Make / Brand | OCR regex |
| Series / Model | OCR regex |
| Year Model | OCR regex |
| Body Type | OCR regex |
| Fuel Type | OCR regex |
| Color | OCR regex |
| Engine No. | OCR regex |
| Chassis No. | OCR regex |
| MV File No. | OCR regex |
| CR No. | OCR regex |
| OR No. | OCR regex |
| Gross Weight | OCR regex |
| Net Capacity | OCR regex |
| Registration Date | OCR regex |
| Registration Expiry | OCR regex |
| Raw Text Preview | First 300 chars of OCR output |
| Confidence | Average Tesseract word confidence (0–100) |
| Needs Review | "Yes" if low confidence, low match score, or no fields extracted |
| Notes | Reason for Needs Review flag |
| groupCategory, driverName, helperName, imei, status | From Central Dispatch API |

---

## Needs Review triggers

A row is flagged **Needs Review = Yes** when any of:
- OCR confidence < 60
- Match score < 85
- No registration fields could be extracted from OCR text

Review these rows manually in the Excel before using the data.

---

## Matching logic (priority order)

1. **filename_exact** — plate token found verbatim in the filename (fastest, most reliable)
2. **ocr_exact** — plate found verbatim in OCR text
3. **fuzzy_filename** — rapidfuzz `partial_ratio` ≥ 70 on filename
4. **fuzzy_ocr** — plate-like tokens in OCR text matched fuzzily (score ≥ 85)

Files that pass none of these go to the **Unmatched_Files** sheet.

---

## Tips for best results

- **Name your files with the plate number** (e.g. `ABC123.pdf`) — this gives the most reliable match.
- Scan documents at **200–300 dpi** minimum. Blurry or skewed scans reduce OCR accuracy.
- If many fields are blank after the run, check `output\orcr_scan.log` for per-file errors.
- The `Raw_Debug` sheet shows the raw OCR output — use it to diagnose missed field extraction.

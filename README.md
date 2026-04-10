# LIGHT Team Data Management System
## ALAN "W" Study - Baseline Year 2026 - Impact Site

**Weber State University - Dr. John F. Cavitt - Data & QA: Data Team**

---

## Overview

This repository contains the complete data management infrastructure for the LIGHT Team's ALAN "W" Study at Weber State University. The system was built to satisfy the Data and Quality Assurance Coordinator deliverables from the pre-season work plan (March 30 - April 12, 2026) and covers Tasks 1, 2, and 4 assigned to Data Team.

The study measures how switching the campus "W" emblem between OFF, ON-white, and ON-purple illumination modes affects nocturnal bird migration, local stopover, flight behavior, and building-collision risk. Four sensor teams collect data each collection night beginning April 12, 2026.

---

## What Is In This System

| File | Purpose |
|------|---------|
| `alan_nightly_form_automation.gs` | Google Apps Script - builds the Google Form and all automation |
| `LIGHT_DriveTemplate.gs` | Google Apps Script - creates the nightly Google Drive folder tree |
| `Light_Team_ALAN_Naming_Reference.html` | Printable one-page SOP 13 file naming reference sheet |
| `Light_Team_Data_Naming_Form.html` | Mobile-friendly interactive ingest checklist for field use |

---

## Deliverable Mapping

### Task 1 - Google Drive directory structure (due March 31)

**Spec:** Build the master Google Drive hierarchy following SOPs 12 and 13, with dated nightly folders, sensor subfolders, and a template that can be duplicated each collection night.

**Satisfied by:** `LIGHT_DriveTemplate.gs`

Run `createNightlyTemplate(rootFolderId, nightToken)` once per collection night. It creates the full folder tree for that night and ensures permanent project folders exist.

### Task 2 - File naming reference sheet (due March 31)

**Spec:** One-page quick reference for the SOP 13 convention, examples for each sensor type, emphasis that raw files are never renamed, posted in Drive root and distributed to all teams.

**Satisfied by:** `Light_Team_ALAN_Naming_Reference.html`

### Task 3 - SHA-256 checksum script (due April 2)

**Spec:** Script that accepts a folder path, generates SHA-256 hashes, and outputs `manifest.csv` with filename, path, hash, device ID, start time, stop time, GPS coordinates, and W treatment status.

**Status: NOT YET BUILT.** The submission checklist enforces that the manifest is generated each night, but the script itself must be written before April 12. Python is recommended per the work plan. See the Manifest section below for the required output format.

### Task 4 - Data submission checklist (due April 2)

**Spec:** Checklist for each team lead confirming uploads, manifest, spot-checks, admin photos, Field Log, and media retention. Format as fillable Google Form or spreadsheet row.

**Satisfied by:** `alan_nightly_form_automation.gs`

---

## Setup - Run This Once Before April 12

### Step 1 - Drive template

1. Open [script.google.com](https://script.google.com) and create a new standalone project.
2. Paste `LIGHT_DriveTemplate.gs` into the editor.
3. Find the ID of your project root folder in Google Drive (from the URL when viewing the folder).
4. Run `createNightlyTemplate(rootFolderId, '20260412_I')` to validate access and create the nightly folder structure.
5. Share the root folder with Dr. Cavitt and all team leads in Google Drive.

### Step 2 - Form and automation

1. Open [script.google.com](https://script.google.com) and create a second standalone project.
2. Paste `alan_nightly_form_automation.gs` into the editor.
3. Update `CONFIG.ALERT_EMAIL` to your actual email address.
4. Confirm `CONFIG.DEMO_MODE` is set to `true` for testing.
5. Run `buildNightlyFormAndSheet()` - authorize when prompted (~30-60 seconds).
6. Run `getDeploymentInfo()` - copy the Form URL and Sheet URL from the execution log.
7. Submit test responses as each team to verify the form and checklist items.
8. Run `testOnFormSubmit()` to verify all email and sheet logic fires correctly.
9. Set `CONFIG.DEMO_MODE` to `false`.
10. Run `installTriggers()` - this goes live; do not run until steps 5-8 pass.

### Step 3 - Naming reference sheet

Post `Light_Team_ALAN_Naming_Reference.html` in the Drive `_admin/` folder and distribute to all team leads. Print a copy for each field binder.

### Step 4 - Populate the Roster sheet

After running `buildNightlyFormAndSheet()`, open the linked spreadsheet and find the `Roster` tab. Add team member names in column A (one per row, starting row 2). The submitter name dropdown in the form reads from this sheet. Aavash must populate it before the first collection night.

---

## Nightly Procedure

### Before each collection night (Data Return Lead)

Use one of these methods:

1. **Preferred (scripted):** Run `createNightlyTemplate(rootFolderId, 'YYYYMMDD_I')`.
2. **Manual:** Copy a prior nightly folder and rename it to the new `YYYYMMDD_I` token.

For either method:

1. Use local Utah date in the folder token (example: `20260412_I`).
2. Confirm all sensor subfolders are present before teams begin uploading.

### During the night

Each team uploads raw files to their assigned subfolders as they complete ingest. Files are never renamed - they go in exactly as the device produced them.

### After ingest (each team lead)

Open the Google Form URL and complete the submission checklist for your team. The form routes you to your team's specific sensor checklist. All items must be confirmed before the submit button activates.

### After all four teams submit

The Apps Script sends a completion alert to `CONFIG.ALERT_EMAIL`. Aavash reviews the `Nightly_Summary` sheet and the admin email for any warnings, issues, or amber-flagged pending items.

---

## File Naming Convention (SOP 13)

**Applies to derivative files only. Raw device files are NEVER renamed at ingest.**

```text
YYYYMMDD_Site_SensorType_DeviceID_StartTimeUTC.ext
```

| Token | Values | Notes |
|-------|--------|-------|
| `YYYYMMDD` | e.g. `20260413` | UTC calendar date - evening sessions roll to next day |
| `Site` | `I` = Impact, `C` = Control | 2026 baseline: Impact only |
| `SensorType` | See table below | Standard codes from SOP 13 |
| `DeviceID` | Unit number, no sensor prefix | e.g. `03`, `01`, `N`, `S` |
| `StartTimeUTC` | `HHMM` in UTC | 8pm MDT = `0200`, 9pm = `0300`, 10pm = `0400` |
| `.ext` | Lowercase | `.csv`, `.wav`, `.fit`, `.mp4` |

**Time zone rule:** MDT = UTC-6. Data collected at 8pm April 12 -> filename date is `20260413`.

### Sensor codes and device IDs

| Code | Sensor | Device IDs |
|------|--------|------------|
| `SM4` | Wildlife Acoustics SongMeter 4 | `01` |
| `AM` | AudioMoth x2 | `N`, `S` (pole tag IDs - confirm with Aavash) |
| `SQM` | Sky Quality Meter SD card | `01-SD` |
| `HOBO` | HOBO MX2202 lux/temp logger x6 | `01`-`06` |
| `SPEC` | Sekonic C-800-U Spectrometer | `01` |
| `THERMAL` | Merger LRF XT50 Thermal Binoculars | `01` |
| `LUX` | Sper Scientific handheld lux meter | `01` |
| `ALLSKY` | Fisheye 150 all-sky camera | `01` |
| `LLV` | Sony ZV-1 low-light video | `01` |
| `WEATHER` | Davis Vantage Pro2 weather station | `01` (confirm with Aavash) |

### Derivative filename examples

```text
20260413_I_SM4_01_0230_nfc-detections.csv
20260413_I_AM_N_0200.wav
20260413_I_SQM_01-SD_0200.csv
20260413_I_HOBO_03_0200.csv
20260413_I_SPEC_01_0200_session1.csv
20260413_I_THERMAL_01_0200.mp4
20260413_I_LUX_01_0200.csv
20260413_I_ALLSKY_01_0200.fit
20260413_I_LLV_01_0200.mp4
20260413_I_WEATHER_01_0200.csv
```

### Raw files - keep exactly as produced by the device

```text
SM4_20260412_023012.wav
20260412_023012.WAV
IMG1.FIT
DS000001.mp4
```

---

## Google Drive Folder Structure

```text
LIGHT_ALAN-W_2026/
  _admin/
  _calibration/
    HOBO/           <- weekly Friday HOBO exports
    SQM/
    baseline_readings/
  _scripts/
  YYYYMMDD_I/       <- one per collection night (local Utah date)
    YYYYMMDD_I_SM4/
    YYYYMMDD_I_AM/
      N/            <- AudioMoth north pole
      S/            <- AudioMoth south pole
    YYYYMMDD_I_SQM/
    YYYYMMDD_I_HOBO/
      01/ 02/ 03/ 04/ 05/ 06/
    YYYYMMDD_I_SPEC/
    YYYYMMDD_I_THERMAL/
    YYYYMMDD_I_LUX/
    YYYYMMDD_I_ALLSKY/
      dark/         <- all-sky dark frames
    YYYYMMDD_I_LLV/
    YYYYMMDD_I_WEATHER/
    YYYYMMDD_I_ADMIN/   <- manifest.csv, Field Log, Time Sync, treatment photos
```

---

## Manifest File (SHA-256 - Task 3, not yet built)

The Data Return Lead runs the checksum script on the complete nightly folder at end of shift. The output `manifest.csv` goes into `YYYYMMDD_I_ADMIN/`.

**Required columns (SOP 12 - exact order pending confirmation):**

| Column | Content |
|--------|---------|
| `filename` | Original device-generated filename |
| `file_path` | Assigned project file path in Drive |
| `sha256` | SHA-256 hash of the file |
| `device_id` | Project device ID (e.g. `SM4-01`, `HOBO-03`) |
| `start_time` | Recording start time (UTC) |
| `stop_time` | Recording stop time (UTC) if known |
| `gps` | Station GPS coordinates (WGS84) |
| `w_treatment` | W status that night: `OFF`, `ON-white`, `ON-purple` |

### Confirmed spectrometer file types (from device sample, April 10 2026)

Each spectrometer session produces three files:

| File | Format | Subfolder | Notes |
|------|--------|-----------|-------|
| Measurement data | CSV | `SPEC/raw/` | Device-generated, never renamed |
| Spectral distribution image | PNG | `SPEC/raw/` | Device exports JPG — must re-export as PNG |
| Screen capture | PNG | `SPEC/screencap/` | Manual export, named per SOP 13 |
| Dark frame | PNG | `SPEC/dark/` | One per session, captured before measurement |

**Recommended Python implementation (to build before April 12):**

```python
import hashlib, csv, os, sys
from pathlib import Path

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()

folder = Path(sys.argv[1])
with open(folder / 'manifest.csv', 'w', newline='') as out:
    w = csv.writer(out)
    w.writerow(['filename','file_path','sha256','device_id',
                'start_time','stop_time','gps','w_treatment'])
    for f in sorted(folder.rglob('*')):
        if f.is_file() and f.name != 'manifest.csv':
            w.writerow([f.name, str(f.relative_to(folder)),
                        sha256(f), '', '', '', '', ''])
```

Run as: `python3 manifest.py /path/to/20260412_I/`

Placeholder columns (`device_id`, `start_time`, `stop_time`, `gps`, `w_treatment`) must be filled in manually or by a future version of the script that parses filenames.

---

## Automation - What Happens When a Team Submits

1. Team submits their section of the Google Form.
2. `onFormSubmit` fires immediately:
   - Parses all fields and validates HOBO Friday logic
   - Detects duplicate submissions - orange row highlight if duplicate
   - Highlights pending SOP items in amber
   - Highlights issue reports in red
   - Updates `Nightly_Summary` sheet (LockService protected)
   - Sends admin summary email to `CONFIG.ALERT_EMAIL`
   - Sends receipt email to submitter
3. If all four teams have submitted: sends night-complete alert (fires once per night).
4. At 11:30 PM: if at least one team has submitted but others are missing, sends outstanding teams reminder.

### Response sheet color key

| Color | Meaning |
|-------|---------|
| Red `#ffcdd2` | Team reported an issue or deviation |
| Amber `#ffecb3` | Pending SOP item checked, or Friday HOBO export missing |
| Orange `#ffe0b2` | Duplicate submission for a team that already submitted tonight |

---

## Manual Admin Tools

These functions run from the Apps Script editor dropdown. Never install as triggers.

### `testOnFormSubmit()`

Replays `onFormSubmit` logic against the last response row in the sheet. Use to verify email and sheet logic during testing. Requires at least one real form submission first.

### `listNightSubmissions()`

Interactive date picker (dropdown from `Nightly_Summary`). Writes all submissions for the selected night to the execution log. Read-only - no data changed.

### `resetTeamSubmission()`

Resets a team's Y back to N in `Nightly_Summary` for tonight only. Pops a confirmation dialog, then a team picker. Use when someone submitted under the wrong team. Always record use in the Master Field Log.

### `getDeploymentInfo()`

Logs the Form URL, edit URL, and Sheet URL to the execution log.

---

## Pending SOP Confirmations

These items are flagged in the form and naming reference but require confirmation from Aavash or Dr. Cavitt before being finalized:

| Item | Waiting on |
|------|-----------|
| HOBO logging interval - work plan says 60s, device inventory says 5min | Neisha Erickson |
| Weather station export procedure | FM installation + WeatherLink access |
| Manifest field order (exact column sequence) | SOP 12 |
| Formal QA pass/fail criteria | SOP 12 |
| SQM Ethernet model (02-ETH) installation | FM roof approval |

---

## Ingest Rules (SOP 12)

- Follow the **3-2-1 backup rule**: primary Drive, encrypted external drive in a separate campus building, device media retained until next-day verification.
- Raw filenames are **never altered at ingest** - copy as-is into the correct subfolder.
- The naming convention applies to **derivative files only** (detection outputs, summaries, exports).
- SHA-256 manifest generated for every nightly folder.
- Processing scripts maintained under version control with documented parameters.

---

## Known Limitations

- The Apps Script system is a pilot-grade prototype suited for a small trusted team with low submission concurrency. It is not appropriate for high-volume or audit-grade production environments.
- String-based field parsing (`header.indexOf(...)`) means form question text must not be changed after go-live without updating the corresponding `CONFIG` constant.
- Email delivery has no retry mechanism. Check the Apps Script execution log if an expected email does not arrive.
- The SHA-256 manifest script (Task 3) has not been built and must be completed before April 12.

---

## Contacts

| Role | Person |
|------|--------|
| Principal Investigator | Dr. John F. Cavitt |
| Operations Coordinator | Anna Barry |
| Data & QA Coordinator | Aavash Ghising |
| Acoustics Team Lead | Davis Swanson |
| ALAN Sensors Team Lead | Neisha Erickson |
| First collection night | April 12, 2026 |

---

*Version 1.0 - April 2026 - LIGHT Team, Weber State University*

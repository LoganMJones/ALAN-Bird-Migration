# LIGHT Team Data Management System
## ALAN "W" Study: Baseline Year 2026 (Impact Site)

**Weber State University, Dr. John F. Cavitt; Data & QA: Data Team**

---

## Overview

This repository contains the complete data management infrastructure for the LIGHT Team's ALAN "W" Study at Weber State University. The system was built to satisfy the Data and Quality Assurance Coordinator deliverables from the pre-season work plan (March 30 to April 12, 2026) and covers Tasks 1, 2, and 4 assigned to Data Team.

The study measures how switching the campus "W" emblem between OFF, ON-white, and ON-purple illumination modes affects nocturnal bird migration, local stopover, flight behavior, and building-collision risk. Four sensor teams collect data each collection night beginning April 12, 2026.

---

## What Is In This System

| File | Purpose |
|------|---------|
| `alan_nightly_form_automation.gs` | Google Apps Script: builds the Google Form and all automation |
| `LIGHT_DriveTemplate.gs` | Google Apps Script: creates the nightly Google Drive folder tree |
| `Light_Team_ALAN_Naming_Reference.html` | Printable one-page SOP 13 file naming reference sheet |
| `Light_Team_Data_Naming_Form.html` | Mobile-friendly interactive ingest checklist for field use |

---

## Deliverable Mapping

### Task 1: Google Drive directory structure (due March 31)

**Spec:** Build the master Google Drive hierarchy following SOPs 12 and 13, with dated nightly folders, sensor subfolders, and a template that can be duplicated each collection night.

**Satisfied by:** `LIGHT_DriveTemplate.gs`

Run `createNightlyTemplate(rootFolderId, nightToken)` once per collection night. It creates the full folder tree for that night and ensures permanent project folders exist.

### Task 2: File naming reference sheet (due March 31)

**Spec:** One-page quick reference for the SOP 13 convention, examples for each sensor type, emphasis that raw files are never renamed, posted in Drive root and distributed to all teams.

**Satisfied by:** `Light_Team_ALAN_Naming_Reference.html`

### Task 3: SHA-256 checksum script (due April 2)

**Spec:** Script that accepts a folder path, generates SHA-256 hashes, and outputs `manifest.csv` with filename, path, hash, device ID, start time, stop time, GPS coordinates, and W treatment status.

**Status: NOT YET BUILT.** The submission checklist enforces that the manifest is generated each night, but the script itself must be written before April 12. Python is recommended per the work plan. See the Manifest section below for the required output format.

### Task 4: Data submission checklist (due April 2)

**Spec:** Checklist for each team lead confirming uploads, manifest, spot-checks, admin photos, Field Log, and media retention. Format as fillable Google Form or spreadsheet row.

**Satisfied by:** `alan_nightly_form_automation.gs`

---

## Setup: Run This Once Before April 12

### Step 1: Drive template

1. Open [script.google.com](https://script.google.com) and create a new standalone project.
2. Paste `LIGHT_DriveTemplate.gs` into the editor.
3. Find the ID of your project root folder in Google Drive (from the URL when viewing the folder).
4. Run `createNightlyTemplate(rootFolderId, '20260412_I')` to validate access and create the nightly folder structure.
5. Share the root folder with Dr. Cavitt and all team leads in Google Drive.

### Step 2: Form and automation

1. Open [script.google.com](https://script.google.com) and create a second standalone project.
2. Paste `alan_nightly_form_automation.gs` into the editor.
3. Update `CONFIG.ALERT_EMAIL` to your actual email address.
4. Confirm `CONFIG.DEMO_MODE` is set to `true` for testing.
5. Run `buildNightlyFormAndSheet()`, authorize when prompted (~30-60 seconds).
6. Run `getDeploymentInfo()`, copy the Form URL and Sheet URL from the execution log.
7. Submit test responses as each team to verify the form and checklist items.
8. Run `testOnFormSubmit()` to verify all email and sheet logic fires correctly.
9. Set `CONFIG.DEMO_MODE` to `false`.
10. Run `installTriggers()`: this goes live; do not run until steps 5-8 pass.

### Step 3: Naming reference sheet

Post `Light_Team_ALAN_Naming_Reference.html` in the Drive `_admin/` folder and distribute to all team leads. Print a copy for each field binder.

### Step 4: Populate the Roster sheet

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

Each team uploads raw files to their assigned subfolders as they complete ingest. Files are never renamed; they go in exactly as the device produced them.

### After ingest (each team lead)

Open the Google Form URL and complete the submission checklist for your team. The form routes you to your team's specific sensor checklist. All items must be confirmed before the submit button activates.
- The Nightly Field Lead reviews ingest status and signs off before departure,
  confirms primary copy complete, manifest generated, secondary backup complete,
  spot-check verified, media retained, and Field Log filed (SOP 12 step 10)

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
| `YYYYMMDD` | e.g. `20260413` | UTC calendar date; evening sessions roll to next day |
| `Site` | `I` = Impact, `C` = Control | 2026 baseline: Impact only |
| `SensorType` | See table below | Standard codes from SOP 13 |
| `DeviceID` | Unit number, no sensor prefix | e.g. `03`, `01`, `N`, `S` |
| `StartTimeUTC` | `HHMM` in UTC | 8pm MDT = `0200`, 9pm = `0300`, 10pm = `0400` |
| `.ext` | Lowercase | `.csv`, `.wav`, `.fit`, `.mp4` |

**Time zone rule:** MDT = UTC-6. Data collected at 8pm April 12 -> filename date is `20260413`.

### Pre-season device prefix configuration

Wildlife Acoustics devices (SM4, SM5) support a configurable filename prefix that
is set once in the SongMeter app before the first deployment. Setting this correctly
makes every raw audio file self-describing for the entire season.

| Device | Prefix to set | Output filename |
|--------|--------------|-----------------|
| SM4 | `I-SM4-01` | `I-SM4-01_20260412_023012.wav` |
| SM5 | `I-SM5-01` | `I-SM5-01_20260412_023012.wav` |
| AudioMoth N | `I_AM_N` (if supported) | `I_AM_N_20260412_023012.WAV` |
| AudioMoth S | `I_AM_S` (if supported) | `I_AM_S_20260412_023012.WAV` |

> **Hyphen delimiter:** Wildlife Acoustics firmware does not support underscores
> in the configurable prefix field. Hyphens are used within the prefix only.
> The device appends the date and time with underscores as normal.

> **Note on filename order:** SOP 13 requires date first (`YYYYMMDD_Site_SensorType_DeviceID`),
> but Wildlife Acoustics devices append the date after the prefix. Raw SM4 and SM5 files
> will therefore read `I-SM4-01_20260413_023012.wav` rather than `20260413_I_SM4_01_023012.wav`.
> This is a device constraint, not a naming error. Derivative files (NFC detection output)
> follow SOP 13 date-first order as normal: `20260413_I_SM4_01_0230_nfc-detections.csv`.

Configure in the SongMeter app under device settings before first deployment.
AudioMoth prefix support is pending confirmation from the Acoustics team lead
(Davis Swanson). If not supported, AudioMoth attribution remains by subfolder only.

Raw files are never renamed after configuration, the prefix is set in the device
and generates automatically for every recording.

### Sensor codes and device IDs

| Code | Sensor | Device IDs |
|------|--------|------------|
| `SM4` | Wildlife Acoustics SongMeter 4 | `01` |
| `SM5` | Wildlife Acoustics SongMeter 5 | `01` |
| `AM` | AudioMoth x2 | `N`, `S` (pole tag IDs, confirm with Aavash) |
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
20260413_I_SM5_01_0230_nfc-detections.csv
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

### Naming corrections (SOP 13)

If a file is named incorrectly after ingest:
1. Do not delete or overwrite the incorrectly named file
2. Move it to `_to_rename/` in the project root
3. Create the correctly named version in the correct nightly subfolder
4. Document both the error and the correction in the Master Field Log
5. Note the issue in the ingest manifest

If a device-generated raw file has a garbled or duplicate name, preserve it exactly
as-is, document in the Field Log and manifest, and flag to the Data and QA Coordinator.

### Raw files: keep exactly as produced by the device

```text
I-SM4-01_20260412_023012.wav
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
  _to_rename/       <- SOP 13 correction folder for naming errors
  YYYYMMDD_I/       <- one per collection night (local Utah date)
    YYYYMMDD_I_SM4/
    YYYYMMDD_I_SM5/
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

## Manifest File (SHA-256: Task 3, not yet built)

The Data Return Lead runs the checksum script on the complete nightly folder at end of shift. The output `manifest.csv` goes into `YYYYMMDD_I_ADMIN/`.

**Required columns (SOP 12 confirmed order):**

| Column | Content |
|--------|---------|
| `filename` | Original device-generated filename |
| `file_path` | Assigned project file path in Drive |
| `sha256` | SHA-256 hash of the file |
| `device_id` | Project device ID (e.g. HOBO-03, SM4-01) |
| `start_time` | Recording start time (UTC) |
| `stop_time` | Recording stop time (UTC) if known |
| `gps` | Station GPS coordinates (WGS84) |
| `w_treatment` | W status that night: `OFF`, `ON-white`, `ON-purple` |

### Confirmed spectrometer file types (from device sample, April 10 2026)

Each spectrometer session produces three files:

| File | Format | Subfolder | Notes |
|------|--------|-----------|-------|
| Measurement data | CSV | `SPEC/raw/` | Device-generated, never renamed |
| Spectral distribution image | PNG | `SPEC/raw/` | Device exports JPG must re-export as PNG |
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

## Automation: What Happens When a Team Submits

1. Team submits their section of the Google Form.
2. `onFormSubmit` fires immediately:
   - Parses all fields and validates HOBO Friday logic
   - Detects duplicate submissions, orange row highlight if duplicate
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

Interactive date picker (dropdown from `Nightly_Summary`). Writes all submissions for the selected night to the execution log. Read-only; no data changed.

### `resetTeamSubmission()`

Resets a team's Y back to N in `Nightly_Summary` for tonight only. Pops a confirmation dialog, then a team picker. Use when someone submitted under the wrong team. Always record use in the Master Field Log.

### `getDeploymentInfo()`

Logs the Form URL, edit URL, and Sheet URL to the execution log.

---

## Audio Export: NFC Detection Workflow

All audio files from every collection night are accessible through the
`_audio_export/` folder in Google Drive. This folder is rebuilt automatically
each time the export tool runs and contains shortcuts organized by night and
sensor, and no files are moved or duplicated from the primary archive.

### One-time setup (technical: Aavash or Logan)

1. In the Apps Script editor, set `CONFIG.ROOT_FOLDER_ID` to the Drive folder
   ID of `LIGHT_ALAN-W_2026/` (found in the Drive URL when viewing the folder)
2. Click **Deploy > New deployment > Web app**
3. Set **Execute as: Me** and **Who has access: Anyone with the link**
4. Click Deploy and copy the web app URL
5. Share the URL with Dr. Cavitt and anyone running NFC detection

This setup is done once. The URL works for the entire season without
needing to redeploy.

---

### Option A: Drive for Desktop (recommended for repeated use)

Best for running BirdNET, Kaleidoscope, or other detection software
directly against the audio files without downloading anything.

**Step 1: Install Google Drive for Desktop (one time)**
Download from [drive.google.com/drive/downloads](https://drive.google.com/drive/downloads)
and sign in with your Weber State Google account. The project folder will
appear as a local drive on your computer.

**Step 2: Run the export**
Open the web app URL in any browser. Click **Export all audio files**.
Wait 60 to 90 seconds. A link to the `_audio_export/` folder appears
when complete.

**Step 3: Process with detection software**
Open BirdNET, Kaleidoscope, or your detection software. Set the input
folder to the `_audio_export/` folder inside your mounted Drive. Enable
recursive processing. Run.

The software walks the full mirror structure and processes every audio
file across every collection night in one pass. Results reference the
source file path so each detection can be traced back to its night,
sensor, and unit.

**Re-running:** click the web app button again any time new collection
nights have been added. The mirror rebuilds fresh in 60 to 90 seconds.

---

### Option B: Zip download (no install required)

Best for one-time exports or if Drive for Desktop is not available.

**Step 1: Run the export**
Open the web app URL in any browser. Click **Export all audio files**.
Wait 60 to 90 seconds. Click the link to open `_audio_export/` in Drive.

**Step 2: Download**
In Google Drive, right-click the `_audio_export/` folder and select
**Download**. Google zips the folder and downloads it with the full
folder structure intact. File size depends on the number of collection
nights; allow time for large downloads.

**Step 3: Process with detection software**
Unzip the downloaded file. Point your detection software at the unzipped
`_audio_export/` folder and enable recursive processing.

**Note:** this option requires repeating steps 1 to 3 after each new
collection night is added. Option A is recommended for ongoing use
during the field season.

---

### Export folder structure

The `_audio_export/` folder mirrors the primary archive structure,
containing only audio files:

```text
_audio_export/
  20260412_I_SM4/    ← SM4 audio shortcuts, night 1
  20260412_I_SM5/    ← SM5 audio shortcuts, night 1
  20260412_I_AM/
    N/               ← AudioMoth north shortcuts
    S/               ← AudioMoth south shortcuts
  20260413_I_SM4/    ← SM4 audio shortcuts, night 2
  20260413_I_SM5/
  20260413_I_AM/
    N/
    S/
  ...
```

Non-audio sensor folders (THERMAL, LUX, ALLSKY, etc.) are not included.
Original files remain in the primary archive; shortcuts only.

---

## SOP 12 Troubleshooting Reference

| Problem | Action |
|---------|--------|
| SD card will not mount | Try a second card reader or USB port. Try a different computer. Do not force the card. Set aside for the Data and QA Coordinator if still unresponsive. |
| Files copy incompletely or with errors | Stop copying. Consult the Data and QA Coordinator before reformatting anything. The original media may be the only intact copy. |
| Checksum mismatch | Re-copy the affected file from original media. If mismatch persists, source file may be corrupt. Flag for Data and QA Coordinator. |
| Manifest fields missing | Re-run the checksum script with correct parameters. Consult Data and QA Coordinator if template is unclear. |
| Institutional server unavailable | Copy to encrypted external drive as primary backup. Create a second external copy if another drive is available. Note the deviation and complete the server copy the next day. |

---

## Pending SOP Confirmations

These items are flagged in the form and naming reference but require confirmation from Aavash or Dr. Cavitt before being finalized:

| Item | Waiting on |
|------|-----------|
| HOBO logging interval: work plan says 60s, device inventory says 5min | Neisha Erickson |
| Weather station export procedure | FM installation + WeatherLink access |
| SQM Ethernet model (02-ETH) installation | FM roof approval |
| AudioMoth custom filename prefix support | Davis Swanson / Acoustics team |

---

## Ingest Rules (SOP 12)

- Follow the **3-2-1 backup rule**: primary Drive, encrypted external drive in a separate campus building, device media retained until next-day verification.
- Raw filenames are **never altered at ingest**: copy as-is into the correct subfolder.
- The naming convention applies to **derivative files only** (detection outputs, summaries, exports).
- SHA-256 manifest generated for every nightly folder.
- Processing scripts maintained under version control with documented parameters.

---

## Known Limitations

- The Apps Script system is a pilot-grade prototype suited for a small trusted team with low submission concurrency. It is not appropriate for high-volume or audit-grade production environments.
- String-based field parsing (`header.indexOf(...)`) means form question text must not be changed after go-live without updating the corresponding `CONFIG` constant.
- Email delivery has no retry mechanism. Check the Apps Script execution log if an expected email does not arrive.
- The SHA-256 manifest script (Task 3) has not been built and must be completed before April 12.
- SOP 12 defines QA as qualitative spot-check verification only. No formal
  pass/fail criteria exist: verify readability, correct attribution, and
  plausible timestamps and values.

---

## LIGHT Team, Setup, Testing, and Manual Verification Guide

Complete guide for one-time system setup, automated unit tests, and
manual verification steps before first collection night.

---

## Part 1, One-time setup

Complete these steps in order. Do not run installTriggers() until
all prior steps pass.

### Step 1, Apps Script project

1. Go to script.google.com
2. Click New project
3. Delete the default empty function
4. Paste the full .gs file into the editor
5. Name the project: `LIGHT Team Nightly Submission System`
6. Save (Ctrl+S or Cmd+S)

### Step 2, Update CONFIG before doing anything else

Open the .gs file and update these values:

| Field | Action |
|-------|--------|
| `ALERT_EMAIL` | Replace `YourEmailHere` with the project admin email address |
| `DEMO_MODE` | Confirm it is `true`, leave it until testing is complete |
| `ROOT_FOLDER_ID` | Paste the Drive folder ID of `LIGHT_ALAN-W_2026/` |

To find ROOT_FOLDER_ID: open the project root folder in Google Drive,
copy the ID from the URL, it is the string after `/folders/`.

### Step 3, Build the form and spreadsheet

1. In the function dropdown, select `buildNightlyFormAndSheet`
2. Click Run
3. Authorize all permissions when prompted, click through all dialogs
4. Wait 30 to 60 seconds for it to complete
5. Open the Execution log at the bottom of the screen
6. Confirm you see three URLs logged: Form URL, Edit URL, Sheet URL
7. Copy and save all three URLs somewhere accessible

If you see an error, check CONFIG values and re-run.

### Step 4, Populate the Roster sheet

1. Open the Sheet URL from step 3
2. Click the Roster tab at the bottom
3. Add team member names in column A starting at row 2, one per row:
   - Acoustics team lead
   - ALAN Sensors team lead
   - Data and QA Coordinator
   - (add all team members by role or name)
4. Save

The form submitter name dropdown reads from this sheet. It must be
populated before anyone submits the form.

### Step 5, Create the Drive folder structure

1. In the function dropdown, select `createNightlyTemplate`
2. This requires parameters, open the Apps Script editor console and run:
   ```javascript
   createNightlyTemplate('YOUR_ROOT_FOLDER_ID', 'TEMPLATE_NIGHTLY_I')
   ```
   Replace YOUR_ROOT_FOLDER_ID with the actual ID from Step 2.
3. Verify in Drive that the following folders exist under the project root:
   - `_admin/`
   - `_calibration/` with `HOBO/`, `SQM/`, `baseline_readings/` inside
   - `_scripts/`
   - `_to_rename/` with a README.txt inside
   - `_audio_export/`
   - `TEMPLATE_NIGHTLY_I/` with all sensor subfolders inside

### Step 6, Deploy the audio export web app

1. In the Apps Script editor, click Deploy > New deployment
2. Click the gear icon next to Select type and choose Web app
3. Set Description: `LIGHT Team Audio Export`
4. Set Execute as: `Me`
5. Set Who has access: `Anyone with the link` (or Anyone in your organization)
6. Click Deploy
7. Copy the web app URL
8. Share with Dr. Cavitt and team leads

### Step 7, Run automated unit tests

1. In the function dropdown, select `runAllTests`
2. Click Run
3. Open the Execution log
4. Review results, all tests should show PASS
5. Note any FAIL or SKIP results and resolve before continuing

Expected SKIP results at this stage:
- getNightDatesFromSummary_ tests will skip if no submissions exist yet, this is normal

Expected warnings in the log:
- DEMO_MODE is true, this is correct at this stage
- ROOT_FOLDER_ID set, should pass if Step 2 was completed

### Step 8, Test the form with DEMO_MODE true

1. Open the Form URL from Step 3
2. Submit a test response as each team:
   - Acoustics Team
   - Imaging Team
   - ALAN Sensors Team
   - Data & QA
3. After each submission, check the linked spreadsheet:
   - Form Responses sheet: new row should appear
   - Nightly_Summary sheet: Y should appear for the submitting team
   - Submission_Log sheet: row should be duplicated here
4. Open Executions in the Apps Script editor and confirm onFormSubmit
   fired for each submission
5. Confirm DEMO_MODE log lines appear: `DEMO_MODE: email suppressed...`

### Step 9, Run testOnFormSubmit()

1. In the function dropdown, select `testOnFormSubmit`
2. Click Run
3. Check the Execution log for completion without errors
4. Confirm the log shows email suppressed lines for all three email types:
   - sendAdminSummaryEmail_
   - sendSubmitterReceipt_
   - maybeSendNightCompleteAlert_ (fires after all 4 teams submit)

### Step 10, Install triggers

Only run this after Steps 7, 8, and 9 all pass without errors.

1. In the function dropdown, select `installTriggers`
2. Click Run
3. Open the Triggers panel (alarm clock icon, left sidebar)
4. Confirm two triggers exist:
   - `onFormSubmit`, from spreadsheet, on form submit
   - `sendOutstandingReminders`, time driven, daily near midnight

### Step 11, Go live

1. Set `CONFIG.DEMO_MODE` to `false`
2. Save the file
3. Submit one final test response through the form
4. Confirm a real email arrives at ALERT_EMAIL
5. Confirm a receipt email arrives at the submitter email address

The system is now live.

---

## Part 2, Automated unit tests

Run `runAllTests()` any time to verify system integrity.
Select it from the function dropdown and click Run.

### What the tests cover

| Group | What is tested | Requires setup |
|-------|---------------|----------------|
| 1. CONFIG integrity | All required fields present, email not placeholder, DEMO_MODE is boolean | No |
| 2. Date utilities | toDateKey_, normalizeDate_, formatDateKey_ with valid/null/invalid inputs | No |
| 3. parseSubmissionFields_ | Field extraction, issue detection, override, HOBO weekly using CONFIG constants | No |
| 4. HOBO Friday logic | Friday detection from date, missing HOBO flag, override behavior, sheet highlight | No |
| 5. TEAM_CONFIG integrity | All teams present, unique cols, allComplete logic | No |
| 6. Duplicate detection | Duplicate flag logic, allComplete only fires at 4 submissions | No |
| 7. DEMO_MODE behavior | sendEmail_ suppresses correctly, does not throw | No |
| 8. getRosterNames_ | Roster sheet exists, returns array, no placeholders | Linked spreadsheet |
| 9. getNightDatesFromSummary_ | Returns array, YYYY-MM-DD format, sorted descending | Linked spreadsheet |
| 10. Audio export infrastructure | Root folder accessible, permanent folders exist, folderHasAudio_ correct | Drive + ROOT_FOLDER_ID |

### Interpreting results

**PASS**: function behaves as expected for this input.

**FAIL**: something is wrong. Read the message in the log for details.
Common causes: CONFIG not updated, form not built yet, trigger not installed.

**SKIP**: test was not run because a prerequisite is missing (e.g. no
linked spreadsheet yet). Resolve the prerequisite and re-run.

### When to run tests

- After any Cursor change to the .gs file
- Before the first collection night
- After any form question text change
- If a submission behaves unexpectedly
- After any manual correction using resetTeamSubmission()

---

## Part 3, Manual verification checklist

These things cannot be verified by automated tests and must be checked
by a human before the first collection night.

### Form structure and routing

- [ ] Open the Form URL and step through each team section
- [ ] Confirm Acoustics Team routes to Section 2A only
- [ ] Confirm Imaging Team routes to Section 2B only
- [ ] Confirm ALAN Sensors Team routes to Section 2C only
- [ ] Confirm Data & QA routes to Section 2D only
- [ ] Confirm all required items cannot be skipped
- [ ] Confirm the HOBO weekly export item is visible but optional
- [ ] Confirm the final confirmation checkbox is required
- [ ] Confirm submitter name shows a dropdown (not free text) after Roster is populated
- [ ] Confirm the form date field accepts today's date

### Email content and formatting

- [ ] Set DEMO_MODE to false temporarily and submit a test response
- [ ] Confirm admin summary email arrives at ALERT_EMAIL
- [ ] Confirm email subject includes the night date and team name
- [ ] Confirm email body includes field notes
- [ ] Confirm receipt email arrives at the submitter email address
- [ ] Confirm receipt email includes team, night date, and submitter name
- [ ] After all 4 teams submit: confirm night complete alert arrives
- [ ] Set DEMO_MODE back to true after email testing

### Sheet structure and highlighting

- [ ] Open the linked spreadsheet and check all tabs exist:
  Form Responses, Nightly_Summary, Submission_Log, Roster
- [ ] Confirm Nightly_Summary has correct headers in row 1
- [ ] Submit a response with an issue flagged, confirm row turns red
- [ ] Submit a response with a pending SOP item checked, confirm cell turns amber
- [ ] Submit a duplicate response for the same team, confirm row turns orange
- [ ] Confirm Nightly_Summary shows Y for the submitting team

### Correction tools

- [ ] Run listNightSubmissions(), confirm it shows a date picker
- [ ] Select tonight's date and confirm submissions are listed in the log
- [ ] Run resetTeamSubmission(), confirm the confirmation dialog appears
- [ ] Confirm it only shows tonight's date, no historical dates available
- [ ] After reset, confirm Nightly_Summary shows N for the reset team

### 11:30 PM reminder trigger

- [ ] Temporarily change the trigger to fire in 2 minutes (for testing only)
- [ ] Submit a response for one team only
- [ ] Wait for the trigger to fire
- [ ] Confirm a reminder email lists only the three missing teams
- [ ] Restore the trigger to 11:30 PM
- [ ] Confirm: if no submissions exist for today, no reminder is sent

### Drive folder structure

- [ ] Open LIGHT_ALAN-W_2026/ in Google Drive
- [ ] Confirm all permanent folders exist: _admin, _calibration, _scripts,
  _to_rename, _audio_export
- [ ] Run createNightlyTemplate() for tonight's date
- [ ] Confirm the nightly folder contains all 13 sensor subfolders
- [ ] Confirm SPEC/ contains raw/, dark/, screencap/ subfolders
- [ ] Confirm ALLSKY/ contains dark/ subfolder
- [ ] Confirm AM/ contains N/ and S/ subfolders
- [ ] Confirm HOBO/ contains 01/ through 06/ subfolders

### Audio export web app

- [ ] Open the web app URL in a browser
- [ ] Confirm the page loads with a single Export button
- [ ] Click Export and confirm it completes without error
- [ ] Confirm the _audio_export/ folder appears (or updates) in Drive
- [ ] Open _audio_export/ and confirm nightly subfolders are present
- [ ] Confirm shortcuts inside point to real audio files
- [ ] Download _audio_export/ as a zip and confirm files are intact

### Naming reference sheet

- [ ] Open the HTML file in a browser
- [ ] Confirm all three banners are visible below the header
- [ ] Confirm the token convention row displays all six tokens
- [ ] Confirm the Print button works and output fits on one page
- [ ] Open on a mobile device and confirm the token row stacks vertically
- [ ] Confirm the examples table scrolls horizontally on mobile
- [ ] Confirm the Print floating button appears on mobile

---

## Part 4, Pre-season device configuration checklist

Complete before the first collection night with the Acoustics team lead
and the ALAN Sensors team lead.

- [ ] SM4: prefix set to `I-SM4-01` in SongMeter app
- [ ] SM5: prefix set to `I-SM5-01` in SongMeter app
- [ ] AudioMoth: confirm whether custom prefix is supported
  - If yes: set AM-N unit to `I-AM-N`, AM-S unit to `I-AM-S`
  - If no: document in naming reference that attribution is by subfolder only
- [ ] Spectrometer: memory title set to `2026_I_SPEC_01`
- [ ] HOBO loggers: logging interval confirmed with the ALAN Sensors team lead and PI
  (recommendation: 60 seconds)
- [ ] HOBO loggers: all 6 units synchronized before first deployment
- [ ] SQM SD-card model: ALAN Sensors team lead confirms export procedure
- [ ] All devices: clocks synchronized to UTC before first deployment

---

*Version 1.0 · April 2026 · LIGHT Team, Weber State University*
*Architected with Claude (Anthropic) + Cursor AI · Logan Jones*

---

## Contacts

| Role | Person |
|------|--------|
| Principal Investigator | Dr. John F. Cavitt |
| Operations Coordinator | Anna Barry |
| Data and Equipment Return Lead | Assigned nightly per shift schedule |
| Data & QA Coordinator | Aavash Ghising |
| Acoustics Team Lead | Davis Swanson |
| ALAN Sensors Team Lead | Neisha Erickson |
| First collection night | April 12, 2026 |

---

*Version 1.0, April 2026, LIGHT Team, Weber State University*

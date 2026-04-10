/**
 * LIGHT Team Nightly Data Submission Form + Automation
 * ----------------------------------------------------
 * SETUP STEPS
 * 1. Open script.google.com and create a standalone Apps Script project.
 * 2. Paste this file into the project.
 * 3. Update CONFIG.ALERT_EMAIL and CONFIG.ORG_NAME.
 * 4. Run `buildNightlyFormAndSheet()` once (authorize when prompted).
 *    - This creates the Google Form and links a response spreadsheet.
 * 5. In Apps Script, run `installTriggers()` once.
 *    - Installs:
 *      a. onFormSubmit(e) trigger (from linked spreadsheet on form submit)
 *      b. sendOutstandingReminders() daily trigger near 11:30 PM local time
 * 6. In Form settings, verify "Collect email addresses" is enabled
 *    (the script also attempts to enforce this).
 * 7. Optional: run `getDeploymentInfo()` to log created Form/Sheet URLs.
 *
 * NOTES
 * - Raw ingest filenames are preserved and never renamed. This form checklist
 *   reflects that SOP rule while still enforcing derivative naming checks.
 * - [AWAITING SOP CONFIRMATION] and [PENDING ALAN SENSORS TEAM CONFIRMATION]
 *   items are optional in the form and are highlighted amber in
 *   the response row if checked.
 * - HOBO weekly export is conditionally required by date/override logic.
 */

/**
 * AUTHORSHIP
 * ----------
 * System architecture, requirements analysis, and all technical decisions were
 * produced by Logan Jones in collaboration with Claude (Anthropic) and Cursor AI.
 * Source documents driving all decisions:
 *   - LIGHT Team Pre-Season Work Plan (March 30 – April 12, 2026)
 *   - The "W" Study Methods Manual, LIGHT Team, Weber State University
 *   - Device inventory spreadsheets (ALAN Sensors team, Imaging team)
 *   - SOP 13 naming convention (as described in work plan Task 2)
 * All naming conventions, checklist items, folder structures, and protocol
 * references trace directly to those documents. AI tools were used to
 * accelerate implementation; all decisions were reviewed and confirmed by Logan.
 * Principal Investigator: Dr. John F. Cavitt, Weber State University.
 */

const CONFIG = {
  // ⚠ REQUIRED: Replace 'YourEmailHere' with your actual email before running buildNightlyFormAndSheet().
  // All admin alerts, submission summaries, and reminder emails go to this address.
  // During testing use your own email. During production set to a data admin.
  ALERT_EMAIL: 'YourEmailHere',
  // Demo safety switch: when true, outgoing emails are suppressed and logged.
  // Set to false before production go-live.
  DEMO_MODE: true,
  ORG_NAME: 'LIGHT Team, Weber State University',
  TIMEZONE: Session.getScriptTimeZone() || 'America/Denver',
  FORM_TITLE: 'LIGHT_ALAN-W_2026_I_nightly-submission-form',
  FORM_DESCRIPTION:
    'ALAN W-study nightly checklist. Complete one team section per submission. ' +
    'SOP 13 naming applies to derivative files only; raw ingest filenames remain unchanged.',
  FORM_PROP_KEY: 'LIGHT_FORM_ID',
  SHEET_PROP_KEY: 'LIGHT_SHEET_ID',
  COMPLETE_ALERT_PREFIX: 'COMPLETE_ALERT_SENT_',
  OUTSTANDING_ALERT_PREFIX: 'OUTSTANDING_ALERT_SENT_',
  TEAM_VALUES: ['Acoustics Team', 'Imaging Team', 'ALAN Sensors Team', 'Data & QA'],
  TEAM_CONFIG: {
    'Acoustics Team': { col: 2, issueCol: 7, summaryIdx: 1 },
    'Imaging Team': { col: 3, issueCol: 8, summaryIdx: 2 },
    'ALAN Sensors Team': { col: 4, issueCol: 9, summaryIdx: 3 },
    'Data & QA': { col: 5, issueCol: 10, summaryIdx: 4 }
  },
  FIELD_NIGHT_DATE: 'Collection night date',
  FIELD_OVERRIDE: 'Override: complete HOBO weekly export tonight (non-Friday)',
  FIELD_HOBO_WEEKLY: '[FRIDAY EXPORT] Weekly HOBO export uploaded to _calibration/HOBO/',
  ISSUE_NONE_TEXT: 'No issues - all items completed as normal'
};

/**
 * Response row highlight colors:
 * - Red    #ffcdd2: team reported an issue/deviation
 * - Amber  #ffecb3: pending confirmation item checked, or Friday HOBO export missing
 * - Orange #ffe0b2: duplicate submission for a team that already submitted that night
 */

/**
 * Run once to generate the full form and linked response sheet.
 */
function buildNightlyFormAndSheet() {
  const form = FormApp.create(CONFIG.FORM_TITLE)
    .setDescription(CONFIG.FORM_DESCRIPTION)
    .setProgressBar(true)
    .setShuffleQuestions(false)
    .setCollectEmail(true);

  const spreadsheet = SpreadsheetApp.create('LIGHT_ALAN-W_2026_I_nightly-submissions');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  initializeTrackingSheets_(spreadsheet);

  // Section 1: Night info (all teams).
  form.addSectionHeaderItem().setTitle('Section 1 - Night info (all teams)');
  form
    .addDateItem()
    .setTitle(CONFIG.FIELD_NIGHT_DATE)
    .setHelpText(
      'Use the local Utah date (MDT) for the collection night. ' +
        'Example: data collected tonight April 12 → enter April 12.'
    )
    .setRequired(true);
  form
    .addCheckboxItem()
    .setTitle(CONFIG.FIELD_OVERRIDE)
    .setChoiceValues(['Override enabled'])
    .setHelpText(
      'Check this only if completing the Friday export on a different night. Leave unchecked on all normal nights.'
    )
    .setRequired(false);
  const rosterNames = getRosterNames_(spreadsheet);
  if (rosterNames.length > 0) {
    form
      .addMultipleChoiceItem()
      .setTitle('Submitter name')
      .setChoiceValues(rosterNames)
      .setRequired(true);
  } else {
    form
      .addTextItem()
      .setTitle('Submitter name')
      .setHelpText(
        'Roster sheet is empty — type your full name.'
      )
      .setRequired(true);
  }

  const teamItem = form
    .addMultipleChoiceItem()
    .setTitle('Team')
    .setHelpText('What Team are you submitting the checklist for tonight?')
    .setRequired(true);

  form
    .addTimeItem()
    .setTitle('Submission time')
    .setHelpText('Local time of this submission. (MDT - Utah)')
    .setRequired(true);

  // W treatment status is intentionally NOT collected in this form.
  // Treatment verification is the Nightly Field Lead's responsibility,
  // documented in three authoritative places: the Master Field Log,
  // the Randomization Calendar, and the treatment-verification photos
  // uploaded to YYYYMMDD_I_ADMIN/. Collecting it here would create a
  // potential conflict with those sources if values ever disagreed.
  // Do not add it back without discussing with Data team or Dr. Cavitt.

  // Team sections (branch targets).
  const acousticsSection = form.addPageBreakItem().setTitle('Section 2A - Acoustics Team');
  addAcousticsSectionItems_(form);

  const imagingSection = form.addPageBreakItem().setTitle('Section 2B - Imaging Team');
  addImagingSectionItems_(form);

  const alanSection = form.addPageBreakItem().setTitle('Section 2C - ALAN Sensors Team');
  addAlanSensorsSectionItems_(form);

  const dataQaSection = form.addPageBreakItem().setTitle('Section 2D - Data & QA');
  addDataQaSectionItems_(form);

  const finalSection = form.addPageBreakItem().setTitle('Section 3 - Final confirmation');
  form
    .addCheckboxItem()
    .setTitle('I confirm all items above are complete and accurate to the best of my knowledge')
    .setChoiceValues(['Confirmed'])
    .setRequired(true);

  // Route each team section to final confirmation.
  acousticsSection.setGoToPage(finalSection);
  imagingSection.setGoToPage(finalSection);
  // Defensive fallback: if ALAN section routing item is bypassed for any reason, go to Final.
  alanSection.setGoToPage(finalSection);
  dataQaSection.setGoToPage(finalSection);

  // Branch by team selection.
  teamItem.setChoices([
    teamItem.createChoice('Acoustics Team', acousticsSection),
    teamItem.createChoice('Imaging Team', imagingSection),
    teamItem.createChoice('ALAN Sensors Team', alanSection),
    teamItem.createChoice('Data & QA', dataQaSection)
  ]);

  // Persist IDs and prepare helper sheets.
  const props = PropertiesService.getScriptProperties();
  props.setProperty(CONFIG.FORM_PROP_KEY, form.getId());
  props.setProperty(CONFIG.SHEET_PROP_KEY, spreadsheet.getId());

  Logger.log('Form URL: %s', form.getPublishedUrl());
  Logger.log('Edit URL: %s', form.getEditUrl());
  Logger.log('Sheet URL: %s', spreadsheet.getUrl());
}

/**
 * Install automation triggers after form/sheet are created.
 */
function installTriggers() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty(CONFIG.SHEET_PROP_KEY);
  if (!sheetId) {
    throw new Error('Linked spreadsheet ID not found. Run buildNightlyFormAndSheet() first.');
  }

  // Avoid duplicate triggers.
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(sheetId)
    .onFormSubmit()
    .create();

  // Daily reminder trigger around 11:30 PM local.
  ScriptApp.newTrigger('sendOutstandingReminders')
    .timeBased()
    .atHour(23)
    .nearMinute(30)
    .everyDays(1)
    .create();
}

/**
 * Main submit automation entry point.
 * Trigger type: installable form-submit trigger from linked spreadsheet.
 */
function onFormSubmit(e) {
  if (!e || !e.range || !e.source) {
    throw new Error('onFormSubmit(e) requires spreadsheet form-submit event object.');
  }

  const spreadsheet = e.source;
  const responseSheet = e.range.getSheet();
  const rowIndex = e.range.getRow();
  const rowValues = e.values || [];
  const headers = responseSheet.getRange(1, 1, 1, responseSheet.getLastColumn()).getValues()[0];
  const rowMap = mapHeadersToValues_(headers, rowValues);

  const parsed = parseSubmissionFields_(rowMap);
  const hoboValidation = validateAndMarkHoboFridayLogic_(responseSheet, headers, rowValues, rowIndex, parsed);
  const issueFlag = markIssueRowIfNeeded_(responseSheet, headers, rowValues, rowIndex, parsed);

  logSubmissionRow_(spreadsheet, headers, rowValues);
  highlightPendingSopSelections_(responseSheet, headers, rowValues, rowIndex);
  const summaryUpdate = updateNightlySummary_(
    spreadsheet,
    parsed.nightDate,
    parsed.team,
    parsed.hasIssues,
    responseSheet,
    rowIndex
  );
  maybeSendNightCompleteAlert_(spreadsheet, parsed.nightDate);
  sendAdminSummaryEmail_(parsed, hoboValidation, issueFlag, summaryUpdate);
  sendSubmitterReceipt_(parsed);
}

/**
 * Called daily near 11:30 PM local time.
 * Sends reminder email if any team has not submitted for today's collection night.
 */
function sendOutstandingReminders() {
  const spreadsheet = getLinkedSpreadsheet_();
  const summarySheet = getOrCreateSheet_(spreadsheet, 'Nightly_Summary');
  const data = summarySheet.getDataRange().getValues();
  if (data.length < 2) return;

  const todayKey = toDateKey_(new Date());
  const row = data.find((r, i) => i > 0 && toDateKey_(r[0]) === todayKey);
  if (!row) return; // No submissions yet today; treat as non-collection night.

  const missingTeams = Object.entries(CONFIG.TEAM_CONFIG)
    .filter(([, cfg]) => row[cfg.summaryIdx] !== 'Y')
    .map(([name]) => name);
  if (!missingTeams.length) return;

  const lockKey = CONFIG.OUTSTANDING_ALERT_PREFIX + todayKey;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(lockKey)) return;

  const subject = `LIGHT nightly outstanding teams - ${todayKey}`;
  const body =
    `Collection night: ${todayKey}\n` +
    `Outstanding teams by 11:30 PM:\n- ${missingTeams.join('\n- ')}\n\n` +
    `Please follow up with team leads.`;
  sendEmail_(CONFIG.ALERT_EMAIL, subject, body, 'sendOutstandingReminders');
  props.setProperty(lockKey, new Date().toISOString());
}

/**
 * Convenience function to log generated URLs and IDs.
 */
function getDeploymentInfo() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty(CONFIG.FORM_PROP_KEY);
  const sheetId = props.getProperty(CONFIG.SHEET_PROP_KEY);
  if (!formId || !sheetId) {
    Logger.log('Form/Sheet not initialized. Run buildNightlyFormAndSheet() first.');
    return;
  }
  const form = FormApp.openById(formId);
  const sheet = SpreadsheetApp.openById(sheetId);
  Logger.log('Form published URL: %s', form.getPublishedUrl());
  Logger.log('Form edit URL: %s', form.getEditUrl());
  Logger.log('Linked sheet URL: %s', sheet.getUrl());
}

function sendEmail_(to, subject, body, context) {
  if (CONFIG.DEMO_MODE) {
    Logger.log(
      'DEMO_MODE: email suppressed (%s). to=%s subject=%s',
      context || 'unspecified',
      to || '',
      subject || ''
    );
    return;
  }
  MailApp.sendEmail(to, subject, body);
}

/**
 * MANUAL USE ONLY — do not install as a trigger.
 * When to use: Safely test submit-side automation and emails against the latest real response.
 * How to run: Select this function in the Apps Script editor dropdown and click Run.
 * Side effects: Replays onFormSubmit logic for the last response row and sends the same emails/updates.
 * Log when used: Record any use of this function in the Master Field Log.
 */
function testOnFormSubmit() {
  const sheetId = PropertiesService.getScriptProperties().getProperty(CONFIG.SHEET_PROP_KEY);
  if (!sheetId) throw new Error('Linked spreadsheet not found. Run buildNightlyFormAndSheet() first.');

  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheets()[0];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('No form responses found. Submit a test response first.');

  const range = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn());
  const mockEvent = {
    source: ss,
    range,
    values: range.getValues()[0]
  };

  Logger.log('Running testOnFormSubmit with row %s', lastRow);
  onFormSubmit(mockEvent);
  Logger.log('testOnFormSubmit complete. Check email and Nightly_Summary.');
}

/**
 * MANUAL USE ONLY — do not install as a trigger.
 * When to use: Audit who submitted for a specific collection night before making corrections.
 * How to run: Select this function in the Apps Script editor dropdown and click Run.
 * Side effects: Writes submission details to the Execution Log only.
 * Log when used: Record any use of this function in the Master Field Log.
 */
function listNightSubmissions() {
  const dates = getNightDatesFromSummary_();
  if (!dates.length) {
    Browser.msgBox('No nights found in Nightly_Summary yet.');
    return;
  }

  const promptLines = dates.map((d, i) => `${i + 1}. ${d}`).join('\n');
  const input = Browser.inputBox(
    `Select a night to audit submissions:\n${promptLines}\n\nEnter number:`,
    Browser.Buttons.OK_CANCEL
  );
  if (input === 'cancel') return;

  const selectedIndex = Number(input);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > dates.length) {
    Browser.msgBox('Invalid selection. No changes made.');
    return;
  }

  listNightSubmissions_(dates[selectedIndex - 1]);
}

function listNightSubmissions_(nightDateKey) {
  const targetKey = toDateKey_(nightDateKey);
  if (!targetKey) throw new Error('Provide nightDateKey in YYYY-MM-DD format.');

  const ss = getLinkedSpreadsheet_();
  const sheet = ss.getSheets()[0];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    Logger.log('No form responses available.');
    return;
  }

  const headers = values[0];
  const idxTimestamp = headers.findIndex((h) => (h || '').toString().toLowerCase().indexOf('timestamp') !== -1);
  const idxNightDate = headers.findIndex((h) => (h || '').toString().toLowerCase().indexOf('collection night date') !== -1);
  const idxTeam = headers.findIndex((h) => (h || '').toString().toLowerCase().indexOf('team') !== -1);
  const idxSubmitter = headers.findIndex((h) => (h || '').toString().toLowerCase().indexOf('submitter name') !== -1);

  let count = 0;
  values.slice(1).forEach((row, i) => {
    const rowKey = idxNightDate >= 0 ? toDateKey_(row[idxNightDate]) : '';
    if (rowKey !== targetKey) return;
    count += 1;
    Logger.log(
      '[%s] row=%s timestamp=%s team=%s submitter=%s',
      targetKey,
      i + 2,
      idxTimestamp >= 0 ? row[idxTimestamp] : '',
      idxTeam >= 0 ? row[idxTeam] : '',
      idxSubmitter >= 0 ? row[idxSubmitter] : ''
    );
  });

  if (!count) Logger.log('No submissions found for %s', targetKey);
}

/**
 * MANUAL USE ONLY — do not install as a trigger.
 * When to use: Correct Nightly_Summary when a submission was filed under the wrong team.
 * How to run: Select this function in the Apps Script editor dropdown and click Run.
 * Side effects: Sets the specified team back to N in Nightly_Summary and recalculates all-four-complete.
 * Log when used: Record any use of this function in the Master Field Log.
 */
function resetTeamSubmission() {
  const targetKey = toDateKey_(new Date());

  const ss = getLinkedSpreadsheet_();
  const summary = getOrCreateSheet_(ss, 'Nightly_Summary');
  ensureSummarySchema_(summary);
  const values = summary.getDataRange().getValues();
  const hasTonightRow = values.some((row, i) => i > 0 && toDateKey_(row[0]) === targetKey);
  if (!hasTonightRow) {
    Browser.msgBox(`No submissions found for tonight (${targetKey}). Nothing to reset.`);
    return;
  }

  const confirmation = Browser.msgBox(
    `You are about to reset a submission for tonight: ${targetKey}. Continue?`,
    Browser.Buttons.OK_CANCEL
  );
  if (confirmation !== 'ok') return;

  const options = CONFIG.TEAM_VALUES.map((team, i) => `${i + 1}. ${team}`).join('\n');
  const input = Browser.inputBox(
    `Select the team to reset:\n${options}\n\nEnter number:`,
    Browser.Buttons.OK_CANCEL
  );
  if (input === 'cancel') return;

  const selectedIndex = Number(input);
  if (!Number.isInteger(selectedIndex) || selectedIndex < 1 || selectedIndex > CONFIG.TEAM_VALUES.length) {
    Browser.msgBox('Invalid team selection. No changes made.');
    return;
  }

  const teamName = CONFIG.TEAM_VALUES[selectedIndex - 1];
  resetTeamSubmission_(targetKey, teamName);
}

function resetTeamSubmission_(nightDateKey, teamName) {
  const targetKey = toDateKey_(nightDateKey);
  if (!targetKey) throw new Error('Provide nightDateKey in YYYY-MM-DD format.');

  const teamCfg = CONFIG.TEAM_CONFIG[teamName];
  if (!teamCfg) throw new Error('Unknown team: ' + teamName);
  const teamCol = teamCfg.col;
  const issueCol = teamCfg.issueCol;

  const ss = getLinkedSpreadsheet_();
  const summary = getOrCreateSheet_(ss, 'Nightly_Summary');
  ensureSummarySchema_(summary);
  const values = summary.getDataRange().getValues();

  let rowIndex = -1;
  for (let i = 1; i < values.length; i += 1) {
    if (toDateKey_(values[i][0]) === targetKey) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) throw new Error(`No Nightly_Summary row found for ${targetKey}.`);

  summary.getRange(rowIndex, teamCol).setValue('N');
  if (issueCol) summary.getRange(rowIndex, issueCol).setValue('');

  const row = summary.getRange(rowIndex, 1, 1, 6).getValues()[0];
  const allComplete = Object.values(CONFIG.TEAM_CONFIG).every((cfg) => row[cfg.summaryIdx] === 'Y') ? 'Y' : 'N';
  summary.getRange(rowIndex, 6).setValue(allComplete);
  summary.getRange(rowIndex, 11).setValue(new Date());

  Logger.log('Reset %s submission to N for %s. all four complete is now %s.', teamName, targetKey, allComplete);
}

function addAcousticsSectionItems_(form) {
  form.addSectionHeaderItem().setTitle('SM4');
  addChecklistItem_(form, 'Raw .wav files copied to YYYYMMDD_I_SM4/ - not renamed', true);
  addChecklistItem_(form, 'File count confirmed (1-2 .wav files expected per night)', true);
  addChecklistItem_(form, 'Spot-check: 1 file opened, audio plays, timestamps correct', true);
  addChecklistItem_(form, 'SD card retained until next-day verification', true);

  form.addSectionHeaderItem().setTitle('AudioMoth (AM-N, AM-S)');
  addChecklistItem_(form, 'AM-N raw .WAV files in YYYYMMDD_I_AM/N/ subfolder', true);
  addChecklistItem_(form, 'AM-S raw .WAV files in YYYYMMDD_I_AM/S/ subfolder', true);
  addChecklistItem_(form, 'Device ID confirmed via metadata for both units (N and S)', true);
  addChecklistItem_(form, 'Spot-check: 1 file per unit opened and verified', true);
  addChecklistItem_(form, 'Media retained until next-day verification', true);

  addTeamIssueFields_(form, 'Acoustics Team');
}

function addImagingSectionItems_(form) {
  form.addSectionHeaderItem().setTitle('Thermal Binoculars (THERM-01)');
  addChecklistItem_(form, '.mp4 scan recordings uploaded to YYYYMMDD_I_THERMAL/', true);
  addChecklistItem_(form, '3x10-min scan bouts per hour completed during active treatment only', true);
  addChecklistItem_(form, 'Altitude classifications logged for each track', true);
  addChecklistItem_(form, 'Scan bout documentation completed by Observation and Logging Lead', true);

  form.addSectionHeaderItem().setTitle('All-sky Camera (01)');
  addChecklistItem_(form, '.FIT files uploaded to YYYYMMDD_I_ALLSKY/ - not renamed', true);
  addChecklistItem_(form, 'Dark frames collected at end of session and uploaded', true);
  addChecklistItem_(form, 'File count plausible for session length (~120 frames/hr at 30-sec interval)', true);
  addChecklistItem_(form, 'Device internal storage cleared for next night [CRITICAL: 1 GB limit]', true);

  form.addSectionHeaderItem().setTitle('Low-light Video - Sony ZV-1 (01)');
  addChecklistItem_(form, 'DS######.mp4 files uploaded to YYYYMMDD_I_LLV/ - not renamed', true);
  addChecklistItem_(form, 'Focus lock confirmed (lens tape applied per SOP 6)', true);
  addChecklistItem_(form, 'Spot-check: file plays back, image quality acceptable', true);

  addTeamIssueFields_(form, 'Imaging Team');
}

function addAlanSensorsSectionItems_(form) {
  form.addSectionHeaderItem().setTitle('Sky Quality Meter - SD card (SQM 01-SD)');
  addChecklistItem_(form, 'SQM CSV uploaded to YYYYMMDD_I_SQM/ - not renamed', true);
  addChecklistItem_(form, 'Data values plausible (mag/arcsec^2), no unexpected gaps or spikes', true);

  form.addSectionHeaderItem().setTitle('HOBO Loggers (01-06)');
  addChecklistItem_(
    form,
    'HOBO 01 CSV exported to YYYYMMDD_I_HOBO/01/ (cross-check with SQM)',
    true,
    'Verify HOBO-01 lux readings are in the same order of magnitude as SQM sky brightness ' +
      'and show the same general trend across the night (e.g. both decrease after W shutoff). ' +
      'Formal pass/fail tolerance is pending SOP 12 confirmation — use qualitative judgement until then.'
  );
  addChecklistItem_(form, 'HOBO 02 through HOBO 06 CSVs in respective subfolders', true);
  addChecklistItem_(form, 'All 6 loggers: gap-free lux and temperature records confirmed', true);
  addChecklistItem_(
    form,
    CONFIG.FIELD_HOBO_WEEKLY,
    false,
    'Complete only on Friday nights or when override is enabled. Leave unchecked on all other nights.'
  );
  addChecklistItem_(
    form,
    '[PENDING ALAN SENSORS TEAM CONFIRMATION] Logging interval verified: 60s (work plan) or 5min (inventory)',
    false,
    'Procedure not finalized; pending ALAN Sensors team confirmation.'
  );
  addChecklistItem_(
    form,
    '[PENDING ALAN SENSORS TEAM CONFIRMATION] SQM Ethernet model (02-ETH) installation status confirmed',
    false,
    'Pending ALAN Sensors team confirmation and FM roof installation approval.'
  );

  form.addSectionHeaderItem().setTitle('Spectrometer (SPEC 01)');
  addChecklistItem_(form, 'Near-onset spectrometer session uploaded to YYYYMMDD_I_SPEC/', true);
  addChecklistItem_(form, 'Near-midpoint spectrometer session uploaded', true);
  addChecklistItem_(form, 'Near-termination spectrometer session uploaded', true);
  addChecklistItem_(form, 'Dark frame collected before each session', true);
  addChecklistItem_(
    form,
    '[AWAITING SOP CONFIRMATION] Spectrometer file format and export procedure confirmed',
    false,
    'Procedure not finalized; awaiting SOP confirmation of measurement variables/export format.'
  );

  form.addSectionHeaderItem().setTitle('Handheld Lux Meter (LUX 01)');
  addChecklistItem_(form, 'Onset session: all 6 readings recorded', true);
  addChecklistItem_(form, 'Midpoint session: all 6 readings recorded', true);
  addChecklistItem_(form, 'Termination session: all 6 readings recorded', true);
  addChecklistItem_(form, 'Display photographs uploaded for all 3 sessions', true);
  addChecklistItem_(form, 'Completed Lux Field Card uploaded to YYYYMMDD_I_LUX/', true);

  form.addSectionHeaderItem().setTitle('Weather Station (WEATHER 01)');
  addChecklistItem_(form, 'Weather data exported and uploaded to YYYYMMDD_I_WEATHER/', true);
  addChecklistItem_(
    form,
    '[AWAITING SOP CONFIRMATION] Weather station export format and procedure confirmed',
    false,
    'Procedure not finalized; WeatherLink access and FM installation are pending.'
  );
  addChecklistItem_(
    form,
    '[AWAITING SOP CONFIRMATION] WEATHER sensor code confirmation documented',
    false,
    'Code is in active use but pending formal SOP 13 confirmation.'
  );

  addTeamIssueFields_(form, 'ALAN Sensors Team');
}

function addDataQaSectionItems_(form) {
  form.addSectionHeaderItem().setTitle('Folder setup');
  addChecklistItem_(form, 'Nightly folder created from template: YYYYMMDD_I/', true);
  addChecklistItem_(form, 'All sensor subfolders present before uploads began', true);
  addChecklistItem_(form, 'All team submissions received (Acoustics, Imaging, ALAN Sensors)', true);

  form.addSectionHeaderItem().setTitle('Manifest and checksum');
  addChecklistItem_(form, 'SHA-256 checksum script run on full nightly folder', true);
  addChecklistItem_(form, 'manifest.csv generated and saved to YYYYMMDD_I_ADMIN/', true);
  addChecklistItem_(
    form,
    '[AWAITING SOP CONFIRMATION] Manifest field order confirmed (filename, path, hash, deviceID, start, stop, GPS, W treatment)',
    false,
    'Procedure not finalized; placeholder fields are known but exact order is pending.'
  );
  addChecklistItem_(form, 'File counts verified against Expected Files Table', true);

  form.addSectionHeaderItem().setTitle('Spot-check QA');
  addChecklistItem_(form, 'SM4: 1 .wav file opened and verified', true);
  addChecklistItem_(form, 'AudioMoth: 1 file per unit (N and S) opened and verified', true);
  addChecklistItem_(form, 'HOBO: all 6 CSVs opened, timestamps and values plausible', true);
  addChecklistItem_(form, 'SQM: CSV contains full overnight record, no gaps', true);
  addChecklistItem_(form, 'LUX: 3 sessions present, 6 readings each', true);
  addChecklistItem_(form, 'ALLSKY: frame count plausible, dark frames present', true);
  addChecklistItem_(form, 'THERMAL and LLV: files play back with no corruption', true);
  addChecklistItem_(
    form,
    '[AWAITING SOP CONFIRMATION] Formal pass/fail QA criteria documented',
    false,
    'Procedure not finalized; use best judgment until SOP 12 is finalized.'
  );
  addChecklistItem_(
    form,
    '[AWAITING SOP CONFIRMATION] DeviceID prefix rule confirmed (unit-only, no sensor prefix)',
    false,
    'Current project decision uses unit-only IDs (e.g., 03, N, S) pending formal SOP confirmation.'
  );
  addChecklistItem_(
    form,
    '[AWAITING SOP CONFIRMATION] AM sensor code confirmation documented',
    false,
    'Code is in active use but pending formal SOP 13 confirmation.'
  );

  form.addSectionHeaderItem().setTitle('Admin upload');
  addChecklistItem_(form, 'Field Log uploaded to YYYYMMDD_I_ADMIN/', true);
  addChecklistItem_(form, 'Time Sync Sheet uploaded to YYYYMMDD_I_ADMIN/', true);
  addChecklistItem_(form, 'Treatment-verification photos uploaded to YYYYMMDD_I_ADMIN/', true);

  form.addSectionHeaderItem().setTitle('Backup and sign-off');
  addChecklistItem_(form, 'Primary copy confirmed in Google Drive', true);
  addChecklistItem_(
    form,
    'Secondary backup copied to encrypted external drive in separate building (3-2-1)',
    true
  );
  addChecklistItem_(form, 'Device media retained until next-day verification complete', true);
  addChecklistItem_(form, 'Data submission confirmation sent to project lead', true);

  addTeamIssueFields_(form, 'Data & QA');
}

function addChecklistItem_(form, title, required, helpText) {
  const item = form.addCheckboxItem().setTitle(title).setChoiceValues(['Complete']).setRequired(required);
  if (helpText) item.setHelpText(helpText);
}

function addTeamIssueFields_(form, teamLabel) {
  form
    .addCheckboxItem()
    .setTitle(`Issues or deviations (${teamLabel})`)
    .setChoiceValues([
      CONFIG.ISSUE_NONE_TEXT,
      'Equipment malfunction or failure',
      'File missing or could not be located',
      'Protocol deviation (explain in notes below)',
      'Weather or site access issue',
      'Pending item not yet resolved',
      'Other (explain in notes below)'
    ])
    .setRequired(true);
  form
    .addParagraphTextItem()
    .setTitle(`Field notes - details, deviations, follow-up needed (${teamLabel})`)
    .setHelpText(
      "Required even if nothing went wrong. Write 'No issues' if all items completed normally. " +
        'Otherwise describe what happened, affected device/file, and action taken or still needed.'
    )
    .setRequired(true);
}

function initializeTrackingSheets_(spreadsheet) {
  const submissionLog = getOrCreateSheet_(spreadsheet, 'Submission_Log');
  if (submissionLog.getLastRow() === 0) submissionLog.appendRow(['initialized']);

  const summary = getOrCreateSheet_(spreadsheet, 'Nightly_Summary');
  if (summary.getLastRow() === 0) {
    summary.appendRow([
      'night_date',
      'Acoustics submitted (Y/N)',
      'Imaging submitted (Y/N)',
      'ALAN submitted (Y/N)',
      'Data/QA submitted (Y/N)',
      'all four complete (Y/N)',
      'Acoustics no issues (Y/N)',
      'Imaging no issues (Y/N)',
      'ALAN no issues (Y/N)',
      'Data/QA no issues (Y/N)',
      'last_updated'
    ]);
  }

  // Roster sheet — to work we will need to populate with all the team members names.
  const roster = getOrCreateSheet_(spreadsheet, 'Roster');
  if (roster.getLastRow() === 0) {
    roster.appendRow(['name', 'team', 'email']);
    roster.appendRow(['Add team members here — one per row', '', '']);
    Logger.log('Roster sheet created. Populate with team member names before first collection night.');
  }
}

function logSubmissionRow_(spreadsheet, headers, rowValues) {
  const logSheet = getOrCreateSheet_(spreadsheet, 'Submission_Log');
  // If the sheet is empty or only has the initialization placeholder, write headers first.
  if (logSheet.getLastRow() <= 1) {
    logSheet.clearContents();
    logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    logSheet.appendRow(rowValues);
    return;
  }

  // If headers exist but don't match, warn and append anyway.
  // Never clear existing data automatically.
  const existingHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
  const mismatch = existingHeaders.length !== headers.length || existingHeaders.some((h, i) => h !== headers[i]);
  if (mismatch) {
    Logger.log(
      'logSubmissionRow_: WARNING — header mismatch detected. ' +
        'Appending row anyway. Manual review of Submission_Log headers may be needed.'
    );
  }

  logSheet.appendRow(rowValues);
}

function highlightPendingSopSelections_(responseSheet, headers, rowValues, rowIndex) {
  const amber = '#ffecb3';
  headers.forEach((header, idx) => {
    if (typeof header !== 'string') return;
    const h = header.toUpperCase();
    if (h.indexOf('[AWAITING SOP CONFIRMATION]') === -1 && h.indexOf('[PENDING ALAN SENSORS TEAM CONFIRMATION]') === -1) return;
    const val = (rowValues[idx] || '').toString().trim();
    if (val) {
      responseSheet.getRange(rowIndex, idx + 1).setBackground(amber);
    }
  });
}

function updateNightlySummary_(spreadsheet, nightDate, team, hasIssues, responseSheet, responseRowIndex) {
  if (!nightDate || !team) return;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    Logger.log('updateNightlySummary_: could not acquire lock. Skipping update. Error: %s', e);
    return { isDuplicate: false, dateKey: '', team };
  }

  try {
    const summary = getOrCreateSheet_(spreadsheet, 'Nightly_Summary');
    ensureSummarySchema_(summary);
    const dateKey = toDateKey_(nightDate);
    const values = summary.getDataRange().getValues();

    let summaryRowIndex = -1;
    for (let i = 1; i < values.length; i += 1) {
      if (toDateKey_(values[i][0]) === dateKey) {
        summaryRowIndex = i + 1;
        break;
      }
    }
    if (summaryRowIndex === -1) {
      summary.appendRow([dateKey, 'N', 'N', 'N', 'N', 'N', '', '', '', '', new Date()]);
      summaryRowIndex = summary.getLastRow();
    }

    const teamCfg = CONFIG.TEAM_CONFIG[team];
    if (!teamCfg) return { isDuplicate: false, dateKey, team };
    const col = teamCfg.col;
    const issueCol = teamCfg.issueCol;

    const duplicate = summary.getRange(summaryRowIndex, col).getValue() === 'Y';
    summary.getRange(summaryRowIndex, col).setValue('Y');
    if (issueCol) summary.getRange(summaryRowIndex, issueCol).setValue(hasIssues ? 'N' : 'Y');
    const row = summary.getRange(summaryRowIndex, 1, 1, 6).getValues()[0];
    const allComplete = Object.values(CONFIG.TEAM_CONFIG).every((cfg) => row[cfg.summaryIdx] === 'Y') ? 'Y' : 'N';
    summary.getRange(summaryRowIndex, 6).setValue(allComplete);
    summary.getRange(summaryRowIndex, 11).setValue(new Date());

    if (duplicate && responseSheet && responseRowIndex) {
      responseSheet.getRange(responseRowIndex, 1, 1, responseSheet.getLastColumn()).setBackground('#ffe0b2');
    }

    return { isDuplicate: duplicate, dateKey, team };
  } finally {
    lock.releaseLock();
  }
}

function maybeSendNightCompleteAlert_(spreadsheet, nightDate) {
  if (!nightDate) return;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    Logger.log('maybeSendNightCompleteAlert_: could not acquire lock. Skipping alert. Error: %s', e);
    return;
  }

  try {
    const summary = getOrCreateSheet_(spreadsheet, 'Nightly_Summary');
    ensureSummarySchema_(summary);
    const values = summary.getDataRange().getValues();
    const dateKey = toDateKey_(nightDate);
    const row = values.find((r, i) => i > 0 && toDateKey_(r[0]) === dateKey);
    if (!row) return;

    const allComplete = Object.values(CONFIG.TEAM_CONFIG).every((cfg) => row[cfg.summaryIdx] === 'Y') ? 'Y' : 'N';
    if (allComplete !== 'Y') return;

    const propKey = CONFIG.COMPLETE_ALERT_PREFIX + dateKey;
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty(propKey)) return;

    const subject = `LIGHT nightly complete - ${dateKey}`;
    let body =
      `All four teams have submitted for collection night ${dateKey}.\n\n` +
      `Acoustics: ${row[1]}\nImaging: ${row[2]}\nALAN Sensors: ${row[3]}\nData & QA: ${row[4]}\n`;
    const noIssuesEverywhere = Object.values(CONFIG.TEAM_CONFIG).every((cfg) => row[cfg.issueCol - 1] === 'Y');
    if (noIssuesEverywhere) {
      body += '\nAll teams: no issues reported\n';
    }
    sendEmail_(CONFIG.ALERT_EMAIL, subject, body, 'maybeSendNightCompleteAlert_');
    props.setProperty(propKey, new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}

function sendAdminSummaryEmail_(parsed, hoboValidation, issueFlag, summaryUpdate) {
  const warningLines = [];
  if (hoboValidation.fridayMissingHobo) {
    warningLines.push('Friday night detected - HOBO weekly export not confirmed.');
  }
  if (hoboValidation.overrideUsedOnNonFriday) {
    warningLines.push(`HOBO export override used - non-Friday export completed by ${parsed.team || 'unknown team'}.`);
  }
  if (summaryUpdate && summaryUpdate.isDuplicate) {
    warningLines.push(
      `Duplicate submission detected: ${summaryUpdate.team} has already submitted for ${summaryUpdate.dateKey}. ` +
        'Raw response preserved. Run listNightSubmissions() to audit and resetTeamSubmission() to correct if needed.'
    );
  }
  const issueSection = issueFlag.hasIssues
    ? `\nIssues flagged:\n- Categories: ${parsed.issueCategories || 'Unspecified'}\n- Field notes: ${parsed.fieldNotes || 'None'}\n`
    : '';

  const subject = `LIGHT submission received - ${parsed.nightDate || 'unknown date'} - ${parsed.team || 'unknown team'}`;
  const body =
    `Night date: ${parsed.nightDate || ''}\n` +
    `Team: ${parsed.team || ''}\n` +
    `Submitter: ${parsed.submitter || ''}\n` +
    `Respondent email: ${parsed.respondentEmail || ''}\n` +
    `Submission timestamp: ${parsed.timestamp || ''}\n` +
    `Field notes: ${parsed.fieldNotes || 'None'}\n` +
    `Notes/issues summary: ${parsed.notes || 'None'}\n` +
    (warningLines.length ? `\nWarnings:\n- ${warningLines.join('\n- ')}\n` : '\n') +
    issueSection +
    '\n' +
    `Reminder: retain device media until next-day verification is complete.`;
  sendEmail_(CONFIG.ALERT_EMAIL, subject, body, 'sendAdminSummaryEmail_');
}

function sendSubmitterReceipt_(parsed) {
  if (!parsed.respondentEmail) return;
  const subject = `Receipt - LIGHT nightly submission (${parsed.team || 'Team'})`;
  const body =
    `Thanks for submitting the nightly checklist.\n\n` +
    `Night date: ${parsed.nightDate || ''}\n` +
    `Team: ${parsed.team || ''}\n` +
    `Submitted by: ${parsed.submitter || ''}\n` +
    `Timestamp: ${parsed.timestamp || ''}\n\n` +
    `Reminder: retain device media until next-day verification is complete.`;
  sendEmail_(parsed.respondentEmail, subject, body, 'sendSubmitterReceipt_');
}

function parseSubmissionFields_(rowMap) {
  const keys = Object.keys(rowMap);
  const pick = (needle) => {
    const key = keys.find((k) => k && k.toLowerCase().indexOf(needle) !== -1);
    return key ? rowMap[key] : '';
  };

  const notes = keys
    .filter(
      (k) =>
        k &&
        (k.toLowerCase().indexOf('field notes - details, deviations, follow-up needed') !== -1 ||
          k.toLowerCase().indexOf('notes / issues') !== -1) &&
        rowMap[k]
    )
    .map((k) => `${k}: ${rowMap[k]}`)
    .join(' | ');

  const nightDateRaw = pick('collection night date');
  const nightDate = normalizeDate_(nightDateRaw);
  const team = pick('team');
  const teamSlug = (team || '').toLowerCase();
  const issuesKey = keys.find(
    (k) => k && k.toLowerCase().indexOf('issues or deviations') !== -1 && k.toLowerCase().indexOf(teamSlug.split(' ')[0]) !== -1
  );
  const notesKey = keys.find(
    (k) =>
      k &&
      k.toLowerCase().indexOf('field notes - details, deviations, follow-up needed') !== -1 &&
      k.toLowerCase().indexOf(teamSlug.split(' ')[0]) !== -1
  );
  const issueValue = (issuesKey ? rowMap[issuesKey] : '').toString().trim();
  const issueSelections = issueValue
    ? issueValue
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const hasIssues = issueSelections.length
    ? issueSelections.some((s) => s !== CONFIG.ISSUE_NONE_TEXT)
    : false;
  const overrideChecked = (pick('override: complete hobo weekly export tonight') || '').toString().trim() !== '';
  const hoboWeeklyChecked = (pick('[friday export] weekly hobo export uploaded') || '').toString().trim() !== '';

  return {
    timestamp: pick('timestamp') || new Date().toString(),
    nightDate: nightDate ? formatDateKey_(nightDate) : '',
    team,
    submitter: pick('submitter name'),
    respondentEmail: pick('email address'),
    notes,
    hasIssues,
    issueCategories: issueSelections.join('; '),
    fieldNotes: notesKey ? (rowMap[notesKey] || '').toString().trim() : '',
    overrideChecked,
    hoboWeeklyChecked,
    nightDateRaw
  };
}

function validateAndMarkHoboFridayLogic_(responseSheet, headers, rowValues, rowIndex, parsed) {
  const amber = '#ffecb3';
  const isAlanSubmission = (parsed.team || '').trim() === 'ALAN Sensors Team';

  // HOBO weekly export confirmation is only collected in the ALAN branch.
  // For non-ALAN submissions, skip HOBO validation to avoid false warnings.
  if (!isAlanSubmission) {
    return {
      isFriday: false,
      overrideChecked: false,
      showHoboExport: false,
      fridayMissingHobo: false,
      overrideUsedOnNonFriday: false
    };
  }

  const nightDate = normalizeDate_(parsed.nightDateRaw);
  const isFriday = !!nightDate && nightDate.getDay() === 5;
  const overrideChecked = !!parsed.overrideChecked;
  const showHoboExport = isFriday || overrideChecked;
  const hoboConfirmed = !!parsed.hoboWeeklyChecked;

  if (isFriday && !hoboConfirmed) {
    responseSheet.getRange(rowIndex, 1, 1, responseSheet.getLastColumn()).setBackground(amber);
    const hoboCol = headers.findIndex((h) => (h || '').toString().toLowerCase().indexOf('[friday export] weekly hobo export uploaded') !== -1);
    if (hoboCol >= 0) responseSheet.getRange(rowIndex, hoboCol + 1).setBackground(amber);
  }

  if (!isFriday && overrideChecked) {
    responseSheet.getRange(rowIndex, 1, 1, responseSheet.getLastColumn()).setBackground(amber);
  }

  return {
    isFriday,
    overrideChecked,
    showHoboExport,
    fridayMissingHobo: isFriday && !hoboConfirmed,
    overrideUsedOnNonFriday: !isFriday && overrideChecked
  };
}

function markIssueRowIfNeeded_(responseSheet, headers, rowValues, rowIndex, parsed) {
  const red = '#ffcdd2';
  if (parsed.hasIssues) {
    responseSheet.getRange(rowIndex, 1, 1, responseSheet.getLastColumn()).setBackground(red);
  }
  return { hasIssues: parsed.hasIssues };
}

function normalizeDate_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !Number.isNaN(v.getTime())) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDateKey_(dateLike) {
  const d = normalizeDate_(dateLike);
  if (!d) return '';
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Converts mixed date-like values to stable YYYY-MM-DD keys.
 * Preserves preformatted date keys to avoid UTC-to-local day shifting.
 */
function toDateKey_(dateLike) {
  if (typeof dateLike === 'string') {
    const s = dateLike.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }
  return formatDateKey_(dateLike);
}

function getNightDatesFromSummary_() {
  const ss = getLinkedSpreadsheet_();
  const summary = getOrCreateSheet_(ss, 'Nightly_Summary');
  ensureSummarySchema_(summary);
  const values = summary.getDataRange().getValues();
  if (values.length < 2) return [];

  const unique = {};
  values.slice(1).forEach((row) => {
    const key = toDateKey_(row[0]);
    if (key) unique[key] = true;
  });

  return Object.keys(unique).sort((a, b) => b.localeCompare(a));
}

function mapHeadersToValues_(headers, values) {
  const m = {};
  headers.forEach((h, i) => {
    m[h] = i < values.length ? values[i] : '';
  });
  return m;
}

function getLinkedSpreadsheet_() {
  const sheetId = PropertiesService.getScriptProperties().getProperty(CONFIG.SHEET_PROP_KEY);
  if (!sheetId) throw new Error('Linked spreadsheet ID missing. Run buildNightlyFormAndSheet() first.');
  return SpreadsheetApp.openById(sheetId);
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function getRosterNames_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName('Roster');
  if (!sheet || sheet.getLastRow() < 2) return [];
  // getRange(row, col, numRows, numCols): column A from row 2 for (getLastRow() - 1) rows — excludes row 1 header only
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  return values
    .map((r) => (r[0] || '').toString().trim())
    .filter((n) => n && n !== 'Add team members here — one per row');
}

function ensureSummarySchema_(summarySheet) {
  const requiredHeaders = [
    'night_date',
    'Acoustics submitted (Y/N)',
    'Imaging submitted (Y/N)',
    'ALAN submitted (Y/N)',
    'Data/QA submitted (Y/N)',
    'all four complete (Y/N)',
    'Acoustics no issues (Y/N)',
    'Imaging no issues (Y/N)',
    'ALAN no issues (Y/N)',
    'Data/QA no issues (Y/N)',
    'last_updated'
  ];
  // Only write headers if the sheet is completely empty.
  if (summarySheet.getLastRow() === 0) {
    summarySheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }

  // If headers exist but don't match, warn and continue — never clear existing data.
  const current = summarySheet.getRange(1, 1, 1, summarySheet.getLastColumn()).getValues()[0];
  const mismatch =
    current.length < requiredHeaders.length ||
    requiredHeaders.some((h, i) => (current[i] || '') !== h);
  if (mismatch) {
    Logger.log(
      'ensureSummarySchema_: WARNING — schema mismatch detected. ' +
        'Proceeding without schema correction. Manual review of Nightly_Summary headers required.'
    );
  }
}
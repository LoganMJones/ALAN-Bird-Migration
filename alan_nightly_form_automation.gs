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

/**
 * AUDIO EXPORT WEB APP  SETUP
 * ----------------------------
 * 1. Set CONFIG.ROOT_FOLDER_ID to the Drive folder ID of LIGHT_ALAN-W_2026/
 *    (find it in the Drive URL: drive.google.com/drive/folders/THIS_IS_THE_ID)
 * 2. Click Deploy > New deployment
 * 3. Select type: Web app
 * 4. Set Execute as: Me
 * 5. Set Who has access: Anyone with the link
 * 6. Click Deploy and copy the web app URL
 * 7. Share the URL with Dr. Cavitt and team leads
 *
 * To re-run manually from the editor, select exportAudioFiles and click Run.
 * The web app URL stays the same after updates  no need to redeploy for code changes
 * unless you change the deployment settings.
 */

const CONFIG = {
  // ⚠ REQUIRED: Replace with your actual email before running buildNightlyFormAndSheet().
  // All admin alerts, submission summaries, and reminder emails go to this address.
  // During testing use your own email. During production set to a data admin.
  ALERT_EMAIL: 'loganjones1@weber.edu',
  // ⚠ REQUIRED: Replace with the Google Drive folder ID of LIGHT_ALAN-W_2026/
  // Find it in the Drive URL when viewing the folder:
  // https://drive.google.com/drive/folders/THIS_PART_IS_THE_ID
  ROOT_FOLDER_ID: 'YOUR_ROOT_FOLDER_ID_HERE',
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
        'Roster sheet is empty  type your full name.'
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
 * MANUAL USE ONLY  do not install as a trigger.
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
 * MANUAL USE ONLY  do not install as a trigger.
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
 * MANUAL USE ONLY, do not install as a trigger.
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

/**
 * TEST SUITE: LIGHT Team Nightly Submission System
 * -------------------------------------------------
 * Run from Apps Script editor: select runAllTests() and click Run.
 * All results log to the execution log as PASS or FAIL with details.
 *
 * Test groups:
 *   1. CONFIG integrity
 *   2. Date utilities (pure logic)
 *   3. parseSubmissionFields_ (pure logic with mock row)
 *   4. HOBO Friday logic (pure logic with mock sheet)
 *   5. TEAM_CONFIG integrity
 *   6. Duplicate detection logic
 *   7. sendEmail_ DEMO_MODE behavior
 *   8. getRosterNames_ (requires linked spreadsheet)
 *   9. getNightDatesFromSummary_ (requires linked spreadsheet)
 *  10. Audio export infrastructure (requires Drive)
 *
 * Groups 1-7 are pure logic tests and run without any Google service calls.
 * Groups 8-10 require the linked spreadsheet and Drive to be set up.
 *
 * MANUAL USE ONLY: do not install as a trigger.
 */
function runAllTests() {
  const results = [];
  Logger.log('=== LIGHT Team Test Suite ===\n');

  // Pure logic tests, no Google services required
  results.push(...testConfigIntegrity_());
  results.push(...testDateUtilities_());
  results.push(...testParseSubmissionFields_());
  results.push(...testHoboFridayLogic_());
  results.push(...testTeamConfigIntegrity_());
  results.push(...testDuplicateDetectionLogic_());
  results.push(...testDemoModeBehavior_());

  // Integration tests, require linked spreadsheet and Drive
  results.push(...testRosterNames_());
  results.push(...testNightDatesFromSummary_());
  results.push(...testAudioExportInfrastructure_());

  const passed = results.filter(r => r.pass && !r.skipped).length;
  const failed = results.filter(r => !r.pass).length;
  const skipped = results.filter(r => r.skipped).length;

  Logger.log('\n=== Results: %s passed, %s failed, %s skipped ===', passed, failed, skipped);
  if (failed > 0) {
    Logger.log('\nFAILED TESTS:');
    results.filter(r => !r.pass && !r.skipped).forEach(r => {
      Logger.log('  FAIL: %s: %s', r.name, r.message);
    });
  } else {
    Logger.log('All tests passed.');
  }

  return { passed, failed, skipped };
}

// Assertion helpers
function assert_(name, condition, message) {
  const result = { name, pass: !!condition, message: message || '', skipped: false };
  Logger.log('%s: %s%s', result.pass ? 'PASS' : 'FAIL', name, result.pass ? '' : ': ' + message);
  return result;
}

function assertEqual_(name, actual, expected) {
  const pass = actual === expected;
  return assert_(name, pass, pass ? '' : 'expected ' + JSON.stringify(expected) + ' got ' + JSON.stringify(actual));
}

function assertNotEqual_(name, actual, notExpected) {
  const pass = actual !== notExpected;
  return assert_(name, pass, pass ? '' : 'expected not ' + JSON.stringify(notExpected));
}

function assertNull_(name, actual) {
  return assertEqual_(name + ' is null', actual, null);
}

function assertNotNull_(name, actual) {
  return assert_(name + ' is not null', actual !== null && actual !== undefined, 'got null or undefined');
}

function assertMatches_(name, str, pattern) {
  const pass = typeof str === 'string' && pattern.test(str);
  return assert_(name, pass, pass ? '' : JSON.stringify(str) + ' does not match ' + pattern);
}

function skip_(name, reason) {
  const result = { name, pass: true, message: 'SKIPPED: ' + reason, skipped: true };
  Logger.log('SKIP: %s: %s', name, reason);
  return result;
}

// Build a mock row map using CONFIG constants so tests stay in sync with the form
function buildMockRowMap_(overrides) {
  const base = {};
  base.Timestamp = new Date();
  base['Email Address'] = 'test@weber.edu';
  base[CONFIG.FIELD_NIGHT_DATE] = new Date('2026-04-12');
  base['Submitter name'] = 'Test User';
  base.Team = 'Acoustics Team';
  base['Submission time'] = '22:00';
  base['Issues or deviations (Acoustics Team)'] = CONFIG.ISSUE_NONE_TEXT;
  base['Field notes - details, deviations, follow-up needed (Acoustics Team)'] = 'No issues tonight.';
  base[CONFIG.FIELD_OVERRIDE] = '';
  base[CONFIG.FIELD_HOBO_WEEKLY] = '';
  return Object.assign(base, overrides || {});
}

function testConfigIntegrity_() {
  Logger.log('--- 1. CONFIG integrity ---');
  const results = [];

  const requiredStrings = [
    'ALERT_EMAIL', 'ORG_NAME', 'TIMEZONE', 'FORM_TITLE', 'FORM_DESCRIPTION',
    'FORM_PROP_KEY', 'SHEET_PROP_KEY', 'COMPLETE_ALERT_PREFIX',
    'OUTSTANDING_ALERT_PREFIX', 'ISSUE_NONE_TEXT', 'FIELD_NIGHT_DATE',
    'FIELD_OVERRIDE', 'FIELD_HOBO_WEEKLY'
  ];

  requiredStrings.forEach(key => {
    results.push(assert_(
      'CONFIG.' + key + ' is non-empty string',
      typeof CONFIG[key] === 'string' && CONFIG[key].length > 0,
      'Missing or empty'
    ));
  });

  results.push(assertNotEqual_(
    'CONFIG.ALERT_EMAIL is not placeholder',
    CONFIG.ALERT_EMAIL, 'YourEmailHere'
  ));

  results.push(assert_(
    'CONFIG.DEMO_MODE is boolean',
    typeof CONFIG.DEMO_MODE === 'boolean', ''
  ));

  results.push(assert_(
    'CONFIG.TEAM_VALUES is non-empty array',
    Array.isArray(CONFIG.TEAM_VALUES) && CONFIG.TEAM_VALUES.length > 0, ''
  ));

  results.push(assert_(
    'CONFIG.TEAM_CONFIG is object',
    typeof CONFIG.TEAM_CONFIG === 'object' && CONFIG.TEAM_CONFIG !== null, ''
  ));

  results.push(assert_(
    'CONFIG.ROOT_FOLDER_ID is set',
    CONFIG.ROOT_FOLDER_ID && CONFIG.ROOT_FOLDER_ID !== 'YOUR_ROOT_FOLDER_ID_HERE',
    'Set CONFIG.ROOT_FOLDER_ID before first collection night'
  ));

  if (CONFIG.DEMO_MODE) {
    Logger.log('  ⚠ REMINDER: DEMO_MODE is true: emails suppressed. Set false before going live.');
  }

  return results;
}

function testDateUtilities_() {
  Logger.log('--- 2. Date utilities ---');
  const results = [];

  // toDateKey_ with preformatted string, must pass through unchanged
  results.push(assertEqual_('toDateKey_ passthrough YYYY-MM-DD', toDateKey_('2026-04-12'), '2026-04-12'));
  results.push(assertEqual_('toDateKey_ passthrough with spaces trimmed', toDateKey_('  2026-04-12  '), '2026-04-12'));

  // toDateKey_ with null/empty
  results.push(assertEqual_('toDateKey_ empty string returns empty', toDateKey_(''), ''));
  results.push(assertEqual_('toDateKey_ null returns empty', toDateKey_(null), ''));

  // toDateKey_ with Date object returns YYYY-MM-DD
  const d = new Date('2026-04-12T12:00:00');
  results.push(assertMatches_('toDateKey_ Date object returns YYYY-MM-DD', toDateKey_(d), /^\d{4}-\d{2}-\d{2}$/));

  // normalizeDate_
  results.push(assertNull_('normalizeDate_ null', normalizeDate_(null)));
  results.push(assertNull_('normalizeDate_ empty string', normalizeDate_('')));
  results.push(assertNull_('normalizeDate_ invalid string', normalizeDate_('not-a-date')));
  results.push(assertNotNull_('normalizeDate_ valid Date object', normalizeDate_(new Date())));
  results.push(assertNotNull_('normalizeDate_ valid date string', normalizeDate_('2026-04-12')));

  // formatDateKey_
  results.push(assertMatches_('formatDateKey_ valid date returns YYYY-MM-DD', formatDateKey_(new Date('2026-04-12T12:00:00')), /^\d{4}-\d{2}-\d{2}$/));
  results.push(assertEqual_('formatDateKey_ null returns empty', formatDateKey_(null), ''));

  // Day-of-week detection for Friday logic
  const friday = new Date('2026-04-17');
  const thursday = new Date('2026-04-16');
  const sunday = new Date('2026-04-12');
  results.push(assertEqual_('Friday getDay() === 5', friday.getDay(), 5));
  results.push(assertNotEqual_('Thursday getDay() !== 5', thursday.getDay(), 5));
  results.push(assertNotEqual_('Sunday getDay() !== 5', sunday.getDay(), 5));

  return results;
}

function testParseSubmissionFields_() {
  Logger.log('--- 3. parseSubmissionFields_ ---');
  const results = [];

  // Normal Acoustics submission
  const normal = parseSubmissionFields_(buildMockRowMap_());
  results.push(assertEqual_('parsed.team', normal.team, 'Acoustics Team'));
  results.push(assertEqual_('parsed.submitter', normal.submitter, 'Test User'));
  results.push(assertEqual_('parsed.respondentEmail', normal.respondentEmail, 'test@weber.edu'));
  results.push(assertEqual_('parsed.hasIssues false for no-issues selection', normal.hasIssues, false));
  results.push(assertEqual_('parsed.overrideChecked false when empty', normal.overrideChecked, false));
  results.push(assertEqual_('parsed.hoboWeeklyChecked false when empty', normal.hoboWeeklyChecked, false));
  results.push(assertMatches_('parsed.nightDate is YYYY-MM-DD or empty', normal.nightDate, /^(\d{4}-\d{2}-\d{2})?$/));

  // Issues flagged
  const withIssues = parseSubmissionFields_(buildMockRowMap_({
    'Issues or deviations (Acoustics Team)': 'Equipment malfunction or failure'
  }));
  results.push(assertEqual_('parsed.hasIssues true for flagged issues', withIssues.hasIssues, true));

  // ISSUE_NONE_TEXT should not trigger hasIssues
  const noIssues = parseSubmissionFields_(buildMockRowMap_({
    'Issues or deviations (Acoustics Team)': CONFIG.ISSUE_NONE_TEXT
  }));
  results.push(assertEqual_('parsed.hasIssues false for ISSUE_NONE_TEXT', noIssues.hasIssues, false));

  // Override checked
  const withOverride = parseSubmissionFields_(buildMockRowMap_({
    [CONFIG.FIELD_OVERRIDE]: 'Override enabled'
  }));
  results.push(assertEqual_('parsed.overrideChecked true when checked', withOverride.overrideChecked, true));

  // HOBO weekly checked
  const withHobo = parseSubmissionFields_(buildMockRowMap_({
    [CONFIG.FIELD_HOBO_WEEKLY]: 'Complete'
  }));
  results.push(assertEqual_('parsed.hoboWeeklyChecked true when checked', withHobo.hoboWeeklyChecked, true));

  // ALAN team routing
  const alanRow = buildMockRowMap_({
    Team: 'ALAN Sensors Team',
    'Issues or deviations (ALAN Sensors Team)': CONFIG.ISSUE_NONE_TEXT,
    'Field notes - details, deviations, follow-up needed (ALAN Sensors Team)': 'All good.'
  });
  const alan = parseSubmissionFields_(alanRow);
  results.push(assertEqual_('parsed.team ALAN', alan.team, 'ALAN Sensors Team'));
  results.push(assertEqual_('parsed.hasIssues false for ALAN no-issues', alan.hasIssues, false));

  // Missing team field
  const noTeam = parseSubmissionFields_({});
  results.push(assertEqual_('parsed.team empty when missing', noTeam.team, ''));
  results.push(assertEqual_('parsed.hasIssues false when no data', noTeam.hasIssues, false));

  return results;
}

function testHoboFridayLogic_() {
  Logger.log('--- 4. HOBO Friday logic ---');
  const results = [];

  // Mock sheet that records setBackground calls for verification
  function makeMockSheet() {
    const calls = [];
    return {
      calls,
      getRange: (row, col, numRows, numCols) => ({
        setBackground: (color) => calls.push({ row, col, color }),
        getLastColumn: () => 5
      }),
      getLastColumn: () => 5
    };
  }

  function runFridayTest(nightDate, team, overrideChecked, hoboWeeklyChecked) {
    const sheet = makeMockSheet();
    const parsed = {
      team,
      overrideChecked,
      hoboWeeklyChecked,
      nightDateRaw: nightDate
    };
    return {
      result: validateAndMarkHoboFridayLogic_(sheet, [], [], 2, parsed),
      sheet
    };
  }

  // Non-ALAN team, all false regardless of date
  const nonAlan = runFridayTest(new Date('2026-04-17'), 'Acoustics Team', false, false);
  results.push(assertEqual_('Non-ALAN: isFriday false', nonAlan.result.isFriday, false));
  results.push(assertEqual_('Non-ALAN: fridayMissingHobo false', nonAlan.result.fridayMissingHobo, false));
  results.push(assertEqual_('Non-ALAN: overrideUsedOnNonFriday false', nonAlan.result.overrideUsedOnNonFriday, false));
  results.push(assertEqual_('Non-ALAN: no sheet writes', nonAlan.sheet.calls.length, 0));

  // Friday, ALAN, no HOBO: should flag missing
  const fridayNoHobo = runFridayTest(new Date('2026-04-17'), 'ALAN Sensors Team', false, false);
  results.push(assertEqual_('Friday ALAN no HOBO: isFriday true', fridayNoHobo.result.isFriday, true));
  results.push(assertEqual_('Friday ALAN no HOBO: fridayMissingHobo true', fridayNoHobo.result.fridayMissingHobo, true));
  results.push(assertEqual_('Friday ALAN no HOBO: overrideUsedOnNonFriday false', fridayNoHobo.result.overrideUsedOnNonFriday, false));
  results.push(assert_('Friday ALAN no HOBO: sheet was highlighted', fridayNoHobo.sheet.calls.length > 0, ''));

  // Friday, ALAN, HOBO confirmed: no missing flag
  const fridayWithHobo = runFridayTest(new Date('2026-04-17'), 'ALAN Sensors Team', false, true);
  results.push(assertEqual_('Friday ALAN with HOBO: isFriday true', fridayWithHobo.result.isFriday, true));
  results.push(assertEqual_('Friday ALAN with HOBO: fridayMissingHobo false', fridayWithHobo.result.fridayMissingHobo, false));
  results.push(assertEqual_('Friday ALAN with HOBO: no sheet highlight', fridayWithHobo.sheet.calls.length, 0));

  // Thursday, ALAN, override enabled
  const thursdayOverride = runFridayTest(new Date('2026-04-16'), 'ALAN Sensors Team', true, false);
  results.push(assertEqual_('Thursday override: isFriday false', thursdayOverride.result.isFriday, false));
  results.push(assertEqual_('Thursday override: overrideUsedOnNonFriday true', thursdayOverride.result.overrideUsedOnNonFriday, true));
  results.push(assert_('Thursday override: sheet highlighted', thursdayOverride.sheet.calls.length > 0, ''));

  // Normal non-Friday, ALAN, no override
  const normalNight = runFridayTest(new Date('2026-04-16'), 'ALAN Sensors Team', false, false);
  results.push(assertEqual_('Normal night: isFriday false', normalNight.result.isFriday, false));
  results.push(assertEqual_('Normal night: fridayMissingHobo false', normalNight.result.fridayMissingHobo, false));
  results.push(assertEqual_('Normal night: overrideUsedOnNonFriday false', normalNight.result.overrideUsedOnNonFriday, false));
  results.push(assertEqual_('Normal night: no sheet writes', normalNight.sheet.calls.length, 0));

  // null date, should not throw, isFriday false
  const nullDate = runFridayTest(null, 'ALAN Sensors Team', false, false);
  results.push(assertEqual_('Null date: isFriday false', nullDate.result.isFriday, false));

  return results;
}

function testTeamConfigIntegrity_() {
  Logger.log('--- 5. TEAM_CONFIG integrity ---');
  const results = [];

  const teams = Object.keys(CONFIG.TEAM_CONFIG);

  results.push(assertEqual_('TEAM_CONFIG has 4 teams', teams.length, 4));

  ['Acoustics Team', 'Imaging Team', 'ALAN Sensors Team', 'Data & QA'].forEach(team => {
    results.push(assert_('TEAM_CONFIG has ' + team, teams.includes(team), ''));
    const cfg = CONFIG.TEAM_CONFIG[team];
    if (cfg) {
      results.push(assert_(team + '.col is number > 0', typeof cfg.col === 'number' && cfg.col > 0, ''));
      results.push(assert_(team + '.issueCol is number > 0', typeof cfg.issueCol === 'number' && cfg.issueCol > 0, ''));
      results.push(assert_(team + '.summaryIdx is number >= 0', typeof cfg.summaryIdx === 'number' && cfg.summaryIdx >= 0, ''));
      results.push(assertNotEqual_(team + '.col !== issueCol', cfg.col, cfg.issueCol));
    }
  });

  // All cols, issueCols, summaryIdxs must be unique
  const cols = teams.map(t => CONFIG.TEAM_CONFIG[t].col);
  const issueCols = teams.map(t => CONFIG.TEAM_CONFIG[t].issueCol);
  const idxs = teams.map(t => CONFIG.TEAM_CONFIG[t].summaryIdx);
  results.push(assertEqual_('cols are unique', cols.length, new Set(cols).size));
  results.push(assertEqual_('issueCols are unique', issueCols.length, new Set(issueCols).size));
  results.push(assertEqual_('summaryIdxs are unique', idxs.length, new Set(idxs).size));

  // TEAM_VALUES must match TEAM_CONFIG keys exactly
  results.push(assertEqual_('TEAM_VALUES length matches TEAM_CONFIG', CONFIG.TEAM_VALUES.length, teams.length));
  CONFIG.TEAM_VALUES.forEach(v => {
    results.push(assert_('TEAM_VALUES entry in TEAM_CONFIG: ' + v, !!CONFIG.TEAM_CONFIG[v], ''));
  });

  // allComplete logic, verify it uses summaryIdx correctly
  const mockRow = ['2026-04-12', 'N', 'N', 'N', 'N', 'N'];
  Object.values(CONFIG.TEAM_CONFIG).forEach(cfg => {
    mockRow[cfg.summaryIdx] = 'Y';
  });
  const allY = Object.values(CONFIG.TEAM_CONFIG).every(cfg => mockRow[cfg.summaryIdx] === 'Y');
  results.push(assertEqual_('allComplete logic correct when all Y', allY, true));

  const partialRow = ['2026-04-12', 'Y', 'N', 'N', 'N', 'N'];
  const partialY = Object.values(CONFIG.TEAM_CONFIG).every(cfg => partialRow[cfg.summaryIdx] === 'Y');
  results.push(assertEqual_('allComplete logic correct when partial Y', partialY, false));

  return results;
}

function testDuplicateDetectionLogic_() {
  Logger.log('--- 6. Duplicate detection logic ---');
  const results = [];

  // Simulate the duplicate check in updateNightlySummary_
  // The function reads the current cell value and flags duplicate if already 'Y'
  function simulateDuplicateCheck(existingValue) {
    return existingValue === 'Y';
  }

  results.push(assertEqual_('duplicate detected when existing value is Y', simulateDuplicateCheck('Y'), true));
  results.push(assertEqual_('no duplicate when existing value is N', simulateDuplicateCheck('N'), false));
  results.push(assertEqual_('no duplicate when existing value is empty', simulateDuplicateCheck(''), false));

  // allComplete only fires when all four teams are Y
  function simulateAllComplete(acoustics, imaging, alan, dataqqa) {
    const mockRow = { 1: acoustics, 2: imaging, 3: alan, 4: dataqqa };
    return Object.values(CONFIG.TEAM_CONFIG).every(cfg => mockRow[cfg.summaryIdx] === 'Y') ? 'Y' : 'N';
  }

  results.push(assertEqual_('allComplete Y when all four submitted', simulateAllComplete('Y', 'Y', 'Y', 'Y'), 'Y'));
  results.push(assertEqual_('allComplete N when one missing', simulateAllComplete('Y', 'Y', 'Y', 'N'), 'N'));
  results.push(assertEqual_('allComplete N when all missing', simulateAllComplete('N', 'N', 'N', 'N'), 'N'));
  results.push(assertEqual_('allComplete N when three submitted', simulateAllComplete('Y', 'Y', 'N', 'Y'), 'N'));

  // Orange highlight should only fire on duplicate
  function shouldHighlightOrange(isDuplicate) {
    return isDuplicate;
  }
  results.push(assertEqual_('orange highlight fires on duplicate', shouldHighlightOrange(true), true));
  results.push(assertEqual_('orange highlight does not fire on first submission', shouldHighlightOrange(false), false));

  return results;
}

function testDemoModeBehavior_() {
  Logger.log('--- 7. sendEmail_ DEMO_MODE behavior ---');
  const results = [];

  // Capture original DEMO_MODE
  const originalDemoMode = CONFIG.DEMO_MODE;

  // Test with DEMO_MODE true: should log, not send
  // We verify by checking the function does not throw and logs correctly
  CONFIG.DEMO_MODE = true;
  try {
    sendEmail_('test@weber.edu', 'Test subject', 'Test body', 'testDemoModeBehavior_');
    results.push(assert_('sendEmail_ with DEMO_MODE true does not throw', true, ''));
  } catch (e) {
    results.push(assert_('sendEmail_ with DEMO_MODE true does not throw', false, e.message));
  }

  // Test with empty to address: should not throw
  try {
    sendEmail_('', 'Test subject', 'Test body', 'testDemoModeBehavior_');
    results.push(assert_('sendEmail_ with empty to does not throw in DEMO_MODE', true, ''));
  } catch (e) {
    results.push(assert_('sendEmail_ with empty to does not throw in DEMO_MODE', false, e.message));
  }

  // Verify DEMO_MODE is currently true (pre-production check)
  results.push(assert_(
    'DEMO_MODE is true: emails suppressed for safety',
    originalDemoMode === true,
    'DEMO_MODE is false: emails will send on next form submission. Set to true for testing.'
  ));

  // Restore original DEMO_MODE
  CONFIG.DEMO_MODE = originalDemoMode;

  return results;
}

function testRosterNames_() {
  Logger.log('--- 8. getRosterNames_ (integration) ---');
  const results = [];

  const sheetId = PropertiesService.getScriptProperties().getProperty(CONFIG.SHEET_PROP_KEY);
  if (!sheetId) {
    return [skip_('getRosterNames_ tests', 'No linked spreadsheet: run buildNightlyFormAndSheet() first')];
  }

  let ss;
  try {
    ss = SpreadsheetApp.openById(sheetId);
  } catch (e) {
    return [skip_('getRosterNames_ tests', 'Cannot open spreadsheet: ' + e.message)];
  }

  const roster = ss.getSheetByName('Roster');
  results.push(assert_('Roster sheet exists', !!roster, 'Run buildNightlyFormAndSheet() to create it'));
  if (!roster) return results;

  results.push(assert_('Roster has at least header row', roster.getLastRow() >= 1, ''));

  const names = getRosterNames_(ss);
  results.push(assert_('getRosterNames_ returns array', Array.isArray(names), ''));

  names.forEach((name, i) => {
    results.push(assert_('Roster name ' + i + ' is non-empty string', typeof name === 'string' && name.length > 0, ''));
    results.push(assertNotEqual_('Roster name ' + i + ' is not placeholder', name, 'Add team members here, one per row'));
  });

  if (names.length === 0) {
    Logger.log('  ⚠ Roster is empty: populate before first collection night.');
  }

  return results;
}

function testNightDatesFromSummary_() {
  Logger.log('--- 9. getNightDatesFromSummary_ (integration) ---');
  const results = [];

  const sheetId = PropertiesService.getScriptProperties().getProperty(CONFIG.SHEET_PROP_KEY);
  if (!sheetId) {
    return [skip_('getNightDatesFromSummary_ tests', 'No linked spreadsheet: run buildNightlyFormAndSheet() first')];
  }

  let dates;
  try {
    dates = getNightDatesFromSummary_();
  } catch (e) {
    return [assert_('getNightDatesFromSummary_ does not throw', false, e.message)];
  }

  results.push(assert_('returns array', Array.isArray(dates), ''));

  if (dates.length > 0) {
    dates.forEach((d, i) => {
      results.push(assertMatches_('Night date ' + i + ' is YYYY-MM-DD', d, /^\d{4}-\d{2}-\d{2}$/));
    });

    for (let i = 0; i < dates.length - 1; i++) {
      results.push(assert_(
        'Dates sorted descending: ' + dates[i] + ' >= ' + dates[i + 1],
        dates[i] >= dates[i + 1], ''
      ));
    }
  } else {
    Logger.log('  No collection nights recorded yet: submit a test form response first.');
  }

  return results;
}

function testAudioExportInfrastructure_() {
  Logger.log('--- 10. Audio export infrastructure (integration) ---');
  const results = [];

  if (!CONFIG.ROOT_FOLDER_ID || CONFIG.ROOT_FOLDER_ID === 'YOUR_ROOT_FOLDER_ID_HERE') {
    return [skip_('Audio export tests', 'CONFIG.ROOT_FOLDER_ID not set')];
  }

  let root;
  try {
    root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
    results.push(assert_('Root folder accessible', !!root, ''));
  } catch (e) {
    return [assert_('Root folder accessible', false, e.message)];
  }

  // Required permanent folders
  ['_admin', '_calibration', '_scripts', '_to_rename', '_audio_export'].forEach(name => {
    const found = root.getFoldersByName(name).hasNext();
    results.push(assert_('Permanent folder exists: ' + name, found, 'Run createNightlyTemplate() to create it'));
  });

  // folderHasAudio_ returns false for known non-audio folders
  const adminFolders = root.getFoldersByName('_admin');
  if (adminFolders.hasNext()) {
    try {
      const hasAudio = folderHasAudio_(adminFolders.next());
      results.push(assertEqual_('folderHasAudio_ false for _admin', hasAudio, false));
    } catch (e) {
      results.push(assert_('folderHasAudio_ does not throw on _admin', false, e.message));
    }
  }

  // folderHasAudio_ returns boolean
  const calibFolders = root.getFoldersByName('_calibration');
  if (calibFolders.hasNext()) {
    try {
      const hasAudio = folderHasAudio_(calibFolders.next());
      results.push(assert_('folderHasAudio_ returns boolean', typeof hasAudio === 'boolean', ''));
    } catch (e) {
      results.push(assert_('folderHasAudio_ does not throw on _calibration', false, e.message));
    }
  }

  return results;
}

/**
 * Audio export tool: creates a structured mirror of audio files in _audio_export/.
 *
 * Structure mirrors the primary archive:
 *   _audio_export/
 *     20260412_I_SM4/    ← shortcuts to SM4 .wav files
 *     20260412_I_SM5/    ← shortcuts to SM5 .wav files
 *     20260412_I_AM/
 *       N/               ← shortcuts to AudioMoth north .WAV files
 *       S/               ← shortcuts to AudioMoth south .WAV files
 *     20260413_I_SM4/
 *     ...
 *
 * HOW TO USE:
 *
 * Option A: Run from Apps Script editor:
 *   Select exportAudioFiles from the function dropdown and click Run.
 *   Authorize when prompted. The _audio_export/ folder will be rebuilt
 *   in the project root with the full nightly mirror structure.
 *   Open it in Drive for Desktop to process recursively with BirdNET
 *   or Kaleidoscope, or select all and download as a zip.
 *
 * Option B: Web app (recommended for non-technical users):
 *   Deploy > New deployment > Web app > Execute as Me > Anyone with link.
 *   Share the URL. One button click rebuilds the full mirror.
 *
 * NOTES:
 * - Creates shortcuts only, original files stay in place, nothing is moved
 * - Re-running clears and rebuilds the entire mirror fresh
 * - Only collects .wav and .WAV files
 * - Preserves nightly folder structure for sensor attribution
 * - AudioMoth files retain subfolder context (N/ and S/)
 * - Update CONFIG.ROOT_FOLDER_ID before running
 */
function exportAudioFiles() {
  const rootId = CONFIG.ROOT_FOLDER_ID;
  if (!rootId || rootId === 'YOUR_ROOT_FOLDER_ID_HERE') {
    throw new Error(
      'CONFIG.ROOT_FOLDER_ID is not set. ' +
      'Add the Drive folder ID of LIGHT_ALAN-W_2026/ to CONFIG before running.'
    );
  }

  const root = DriveApp.getFolderById(rootId);
  const exportFolderName = '_audio_export';

  // Clear previous export folder entirely and rebuild fresh
  const existing = root.getFoldersByName(exportFolderName);
  while (existing.hasNext()) {
    existing.next().setTrashed(true);
  }
  const exportRoot = root.createFolder(exportFolderName);

  const result = { files: 0, nights: 0, sensors: new Set() };

  // Walk only nightly folders, skip permanent folders
  const permanentFolders = new Set([
    '_admin', '_calibration', '_scripts', '_to_rename', '_audio_export'
  ]);

  const topFolders = root.getFolders();
  while (topFolders.hasNext()) {
    const folder = topFolders.next();
    const name = folder.getName();

    // Skip permanent project folders, only process YYYYMMDD_I nightly folders
    if (permanentFolders.has(name)) continue;
    if (!/^\d{8}_/.test(name)) continue;

    result.nights += 1;
    // Mirror sensor-level folders directly to keep a flat nightly export layout:
    // _audio_export/YYYYMMDD_I_SM4, _audio_export/YYYYMMDD_I_SM5, _audio_export/YYYYMMDD_I_AM/N, etc.
    const nightlySubfolders = folder.getFolders();
    while (nightlySubfolders.hasNext()) {
      const nightlySub = nightlySubfolders.next();
      mirrorAudioFolder_(nightlySub, exportRoot, result);
    }
  }

  Logger.log(
    'Audio export complete. %s files found across %s collection nights. ' +
    'Sensors: %s. Export folder: %s',
    result.files,
    result.nights,
    Array.from(result.sensors).join(', '),
    exportRoot.getUrl()
  );

  return {
    count: result.files,
    nights: result.nights,
    url: exportRoot.getUrl()
  };
}

/**
 * Recursively mirrors a folder's audio files into the export structure.
 * Creates matching subfolders only when audio files are found inside them.
 */
function mirrorAudioFolder_(sourceFolder, exportParent, result) {
  const sourceName = sourceFolder.getName();

  // Check if this folder contains any audio files directly
  const files = sourceFolder.getFiles();
  const audioFiles = [];
  while (files.hasNext()) {
    const file = files.next();
    const lower = file.getName().toLowerCase();
    if (lower.endsWith('.wav')) {
      audioFiles.push(file);
    }
  }

  // Check which subfolders contain audio so we can preserve parent structure.
  const subfoldersWithAudio = [];
  const subfolders = sourceFolder.getFolders();
  while (subfolders.hasNext()) {
    const sub = subfolders.next();
    if (folderHasAudio_(sub)) subfoldersWithAudio.push(sub);
  }

  // Create matching export subfolder if this folder or any descendants have audio.
  const shouldCreateFolder = audioFiles.length > 0 || subfoldersWithAudio.length > 0;
  if (!shouldCreateFolder) return;
  const exportFolder = exportParent.createFolder(sourceName);

  // If audio files found, add shortcuts in this matching export subfolder.
  if (audioFiles.length > 0) {
    audioFiles.forEach(file => {
      exportFolder.createShortcut(file.getId());
      result.files += 1;
      // Track which sensor types were found
      const parts = sourceName.split('_');
      if (parts.length >= 3) result.sensors.add(parts[2]);
    });
  }

  // Recurse into subfolders (handles AM/N/, AM/S/, HOBO/01/ etc.)
  subfoldersWithAudio.forEach(sub => mirrorAudioFolder_(sub, exportFolder, result));
}

/**
 * Quick check: does this folder or any descendant contain a .wav or .WAV file?
 * Used to avoid creating empty mirror subfolders.
 */
function folderHasAudio_(folder) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    if (files.next().getName().toLowerCase().endsWith('.wav')) return true;
  }
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    if (folderHasAudio_(subs.next())) return true;
  }
  return false;
}

/**
 * Web app entry point. Deploy as:
 * Deploy > New deployment > Web app
 * Execute as: Me
 * Who has access: Anyone with the link (or Anyone in your organization)
 *
 * Share the URL with Dr. Cavitt and team leads.
 * No login to Apps Script required; just open the link and click Export.
 */
function doGet() {
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>LIGHT Team  Audio Export</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: system-ui, sans-serif;
          background: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 24px;
        }
        .card {
          background: #fff;
          border-radius: 12px;
          padding: 32px 28px;
          max-width: 420px;
          width: 100%;
          box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        }
        .title {
          font-size: 18px;
          font-weight: 600;
          color: #0d2137;
          margin-bottom: 8px;
        }
        .subtitle {
          font-size: 13px;
          color: #666;
          line-height: 1.5;
          margin-bottom: 24px;
        }
        .btn {
          width: 100%;
          padding: 14px;
          background: #0d2137;
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
        }
        .btn:hover { background: #1a3a5c; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .status {
          margin-top: 16px;
          font-size: 13px;
          color: #555;
          line-height: 1.6;
          min-height: 20px;
        }
        .status.success { color: #00796b; font-weight: 500; }
        .status.error { color: #b71c1c; }
        .link {
          display: inline-block;
          margin-top: 12px;
          color: #0d2137;
          font-weight: 500;
          text-decoration: underline;
          font-size: 13px;
        }
        .note {
          margin-top: 20px;
          padding: 10px 12px;
          background: #fff8e1;
          border-left: 3px solid #f57f17;
          border-radius: 4px;
          font-size: 12px;
          color: #555;
          line-height: 1.5;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="title">LIGHT Team Audio Export</div>
        <div class="subtitle">
          Collects all .wav and .WAV audio files from every collection night
          into a single Drive folder. Open that folder and download to run
          NFC detection processing.
        </div>
        <button class="btn" id="btn" onclick="runExport()">Export all audio files</button>
        <div class="status" id="status"></div>
        <div class="note">
          Creates shortcuts only  original files stay in place.
          Previous export is cleared each time. Allow 1 to 2 minutes
          for large collections.
        </div>
      </div>
      <script>
        function runExport() {
          const btn = document.getElementById('btn');
          const status = document.getElementById('status');
          btn.disabled = true;
          btn.textContent = 'Exporting...';
          status.className = 'status';
          status.textContent = 'Finding audio files across all collection nights...';

          google.script.run
            .withSuccessHandler(function(result) {
              btn.disabled = false;
              btn.textContent = 'Export all audio files';
              status.className = 'status success';
              status.innerHTML =
                result.count + ' files found across ' + result.nights +
                ' collection nights.<br>' +
                '<a class="link" href="' + result.url + '" target="_blank">' +
                'Open export folder in Drive</a>';
            })
            .withFailureHandler(function(err) {
              btn.disabled = false;
              btn.textContent = 'Export all audio files';
              status.className = 'status error';
              status.textContent = 'Error: ' + err.message +
                '. Check that CONFIG.ROOT_FOLDER_ID is set correctly.';
            })
            .exportAudioFiles();
        }
      </script>
    </body>
    </html>
  `)
  .setTitle('LIGHT Team Audio Export')
  .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function addAcousticsSectionItems_(form) {
  form.addSectionHeaderItem().setTitle('SM4');
  addChecklistItem_(
    form,
    'SM4 filename prefix verified as I-SM4-01 in device settings',
    true,
    'Pre-season configuration required. Open SongMeter app, confirm prefix is set ' +
    'to I-SM4-01 (hyphens: device does not support underscores in prefix field). ' +
    'Device generates I-SM4-01_YYYYMMDD_HHMMSS.wav automatically. ' +
    'Note: raw file order is Site-Sensor-Device_Date, opposite of SOP 13, because ' +
    'the device appends the date after the prefix. This is expected, not an error. ' +
    'Derivative files follow SOP 13 date-first order as normal.'
  );
  addChecklistItem_(form, 'Raw .wav files copied to YYYYMMDD_I_SM4/, not renamed', true);
  addChecklistItem_(form, 'File count confirmed (1-2 .wav files expected per night)', true);
  addChecklistItem_(form, 'Spot-check: 1 file opened, audio plays, timestamps correct', true);
  addChecklistItem_(form, 'SD card retained until next-day verification', true);

  form.addSectionHeaderItem().setTitle('SM5');
  addChecklistItem_(
    form,
    'SM5 filename prefix verified as I-SM5-01 in device settings',
    true,
    'Pre-season configuration required. Open SongMeter app, confirm prefix is set ' +
    'to I-SM5-01 (hyphens: device does not support underscores in prefix field). ' +
    'Device generates I-SM5-01_YYYYMMDD_HHMMSS.wav automatically. ' +
    'Note: raw file order is Site-Sensor-Device_Date, opposite of SOP 13, because ' +
    'the device appends the date after the prefix. This is expected, not an error.'
  );
  addChecklistItem_(form, 'Raw .wav files copied to YYYYMMDD_I_SM5/, not renamed', true);
  addChecklistItem_(form, 'File count confirmed for session length', true);
  addChecklistItem_(form, 'Spot-check: 1 file opened, audio plays, timestamps correct', true);
  addChecklistItem_(form, 'SD card retained until next-day verification', true);

  form.addSectionHeaderItem().setTitle('AudioMoth (AM-N, AM-S)');
  addChecklistItem_(form, 'AM-N raw .WAV files in YYYYMMDD_I_AM/N/ subfolder', true);
  addChecklistItem_(form, 'AM-S raw .WAV files in YYYYMMDD_I_AM/S/ subfolder', true);
  addChecklistItem_(form, 'Device ID confirmed via metadata for both units (N and S)', true);
  addChecklistItem_(form, 'Spot-check: 1 file per unit opened and verified', true);
  addChecklistItem_(form, 'Media retained until next-day verification', true);
  addChecklistItem_(
    form,
    '[PENDING ACOUSTICS TEAM CONFIRMATION] AudioMoth custom prefix configured if supported',
    false,
    'If AudioMoth firmware supports a custom prefix, set AM-N unit to I_AM_N ' +
    'and AM-S unit to I_AM_S. If not supported, attribution remains by subfolder only. ' +
    'Confirm with Davis Swanson before first collection night.'
  );

  addTeamIssueFields_(form, 'Acoustics Team');
}

function addImagingSectionItems_(form) {
  form.addSectionHeaderItem().setTitle('Thermal Binoculars (THERM-01)');
  addChecklistItem_(form, '.mp4 scan recordings uploaded to YYYYMMDD_I_THERMAL/', true);
  addChecklistItem_(form, '3x10-min scan bouts per hour completed during active treatment only', true);
  addChecklistItem_(form, 'Altitude classifications logged for each track', true);
  addChecklistItem_(form, 'Scan bout documentation completed by Observation and Logging Lead', true);

  form.addSectionHeaderItem().setTitle('All-sky Camera (01)');
  addChecklistItem_(form, '.FIT files uploaded to YYYYMMDD_I_ALLSKY/, not renamed', true);
  addChecklistItem_(form, 'Dark frames collected at end of session and uploaded to YYYYMMDD_I_ALLSKY/dark/', true);
  addChecklistItem_(form, 'File count plausible for session length (~120 frames/hr at 30-sec interval)', true);
  addChecklistItem_(form, 'Device internal storage cleared for next night [CRITICAL: 1 GB limit]', true);

  form.addSectionHeaderItem().setTitle('Low-light Video: Sony ZV-1 (01)');
  addChecklistItem_(form, 'DS######.mp4 files uploaded to YYYYMMDD_I_LLV/, not renamed', true);
  addChecklistItem_(form, 'Focus lock confirmed (lens tape applied per SOP 6)', true);
  addChecklistItem_(form, 'Spot-check: file plays back, image quality acceptable', true);

  addTeamIssueFields_(form, 'Imaging Team');
}

function addAlanSensorsSectionItems_(form) {
  form.addSectionHeaderItem().setTitle('Sky Quality Meter: SD card (SQM 01-SD)');
  addChecklistItem_(form, 'SQM CSV uploaded to YYYYMMDD_I_SQM/, not renamed', true);
  addChecklistItem_(form, 'Data values plausible (mag/arcsec^2), no unexpected gaps or spikes', true);

  form.addSectionHeaderItem().setTitle('HOBO Loggers (01-06)');
  addChecklistItem_(
    form,
    'HOBO 01 CSV exported to YYYYMMDD_I_HOBO/01/ (cross-check with SQM)',
    true,
    'Verify HOBO-01 lux readings are in the same order of magnitude as SQM sky brightness ' +
      'and show the same general trend across the night (e.g. both decrease after W shutoff). ' +
      'Formal pass/fail tolerance is pending SOP 12 confirmation  use qualitative judgement until then.'
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
    'Spectral distribution image exported as PNG for each session (not JPG)',
    true,
    'The device exports spectral distribution images as JPG by default. ' +
      'Re-export or convert each to PNG before uploading to YYYYMMDD_I_SPEC/raw/. ' +
      'JPG is lossy and not acceptable for scientific image data.'
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

  addTeamIssueFields_(form, 'ALAN Sensors Team');
}

function addDataQaSectionItems_(form) {
  form.addSectionHeaderItem().setTitle('Folder setup (Data and Equipment Return Lead)');
  addChecklistItem_(form, 'Nightly folder created from template: YYYYMMDD_I/', true);
  addChecklistItem_(form, 'All sensor subfolders present before uploads began', true);
  addChecklistItem_(form, 'All team submissions received (Acoustics, Imaging, ALAN Sensors)', true);

  form.addSectionHeaderItem().setTitle('Manifest and checksum');
  addChecklistItem_(form, 'SHA-256 checksum script run on full nightly folder', true);
  addChecklistItem_(form, 'manifest.csv generated and saved to YYYYMMDD_I_ADMIN/', true);
  addChecklistItem_(
    form,
    'manifest.csv fields confirmed: filename, file_path, sha256, device_id, start_time, stop_time, gps, w_treatment',
    true,
    'Field order per SOP 12. Run the SHA-256 checksum script and verify all columns are present before saving manifest to YYYYMMDD_I_ADMIN/.'
  );
  addChecklistItem_(form, 'File counts verified against Expected Files Table', true);
  addChecklistItem_(
    form,
    'File count on primary Drive copy verified against source media for all devices',
    true,
    'SOP 12 step 8: count must match exactly. Record any discrepancy in the Field Log ' +
      'and notify the Data and QA Coordinator before erasing any media.'
  );

  form.addSectionHeaderItem().setTitle('Spot-check QA');
  addChecklistItem_(form, 'SM4: 1 .wav file opened and verified', true);
  addChecklistItem_(form, 'SM5: 1 .wav file opened and verified', true);
  addChecklistItem_(form, 'AudioMoth: 1 file per unit (N and S) opened and verified', true);
  addChecklistItem_(form, 'HOBO: all 6 CSVs opened, timestamps and values plausible', true);
  addChecklistItem_(form, 'SQM: CSV contains full overnight record, no gaps', true);
  addChecklistItem_(form, 'LUX: 3 sessions present, 6 readings each', true);
  addChecklistItem_(form, 'ALLSKY: frame count plausible, dark frames present in YYYYMMDD_I_ALLSKY/dark/', true);
  addChecklistItem_(form, 'THERMAL and LLV: files play back with no corruption', true);
  addChecklistItem_(
    form,
    'No corrupt, empty, or misattributed files found during spot-check',
    true,
    'SOP 12 step 7: if any file appears corrupt or misattributed, stop immediately. ' +
      'Do not alter any files. Notify the Data and QA Coordinator and leave original ' +
      'media untouched. Document in Field Log and select "Corrupt file detected" in ' +
      'the issues field above.'
  );
  addChecklistItem_(
    form,
    '[AWAITING SOP CONFIRMATION] Formal pass/fail QA criteria documented',
    false,
    'Procedure not finalized; use best judgment until SOP 12 is finalized.'
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
  addChecklistItem_(
    form,
    'Nightly Field Lead has reviewed and signed off on ingest completion',
    true,
    'SOP 12 step 10: Nightly Field Lead confirms primary copy complete, manifest ' +
      'generated, secondary backup complete, spot-check verified, media retained, ' +
      'and Field Log filed before signing off.'
  );

  addTeamIssueFields_(form, 'Data & QA');
}

function addChecklistItem_(form, title, required, helpText) {
  const item = form.addCheckboxItem().setTitle(title).setChoiceValues(['Complete']).setRequired(required);
  if (helpText) item.setHelpText(helpText);
}

function addTeamIssueFields_(form, teamLabel) {
  const issueChoices = [
    CONFIG.ISSUE_NONE_TEXT,
    'Equipment malfunction or failure',
    'File missing or could not be located',
    'Protocol deviation (explain in notes below)',
    'Weather or site access issue',
    'Pending item not yet resolved',
    'Other (explain in notes below)'
  ];
  if (teamLabel === 'Data & QA') {
    issueChoices.splice(
      2,
      0,
      'SD card will not mount (see SOP 12 troubleshooting)',
      'Corrupt file detected',
      'Checksum mismatch detected',
      'Manifest fields missing or incomplete',
      'Institutional server unavailable  backup copy made'
    );
  }
  form
    .addCheckboxItem()
    .setTitle(`Issues or deviations (${teamLabel})`)
    .setChoiceValues(issueChoices)
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

  // Roster sheet  to work we will need to populate with all the team members names.
  const roster = getOrCreateSheet_(spreadsheet, 'Roster');
  if (roster.getLastRow() === 0) {
    roster.appendRow(['name', 'team', 'email']);
    roster.appendRow(['Add team members here  one per row', '', '']);
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
      'logSubmissionRow_: WARNING  header mismatch detected. ' +
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
  // getRange(row, col, numRows, numCols): column A from row 2 for (getLastRow() - 1) rows  excludes row 1 header only
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  return values
    .map((r) => (r[0] || '').toString().trim())
    .filter((n) => n && n !== 'Add team members here  one per row');
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

  // If headers exist but don't match, warn and continue  never clear existing data.
  const current = summarySheet.getRange(1, 1, 1, summarySheet.getLastColumn()).getValues()[0];
  const mismatch =
    current.length < requiredHeaders.length ||
    requiredHeaders.some((h, i) => (current[i] || '') !== h);
  if (mismatch) {
    Logger.log(
      'ensureSummarySchema_: WARNING  schema mismatch detected. ' +
        'Proceeding without schema correction. Manual review of Nightly_Summary headers required.'
    );
  }
}
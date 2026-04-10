/**
 * LIGHT Team — Google Drive nightly folder template
 * -------------------------------------------------
 * Creates the standard YYYYMMDD_I_* tree under the project root. Paste into the same
 * Apps Script project as other Drive utilities, or a standalone project bound to the
 * Drive folder, and run createNightlyTemplate(rootFolderId, nightToken) after authorizing.
 *
 * LLV folder is flat (files go directly in YYYYMMDD_I_LLV/), matching the form checklist and SOP 13 tree.
 * _calibration is created once and reused.
 */

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * @param {string} rootFolderId Drive ID of LIGHT_ALAN-W_2026 (or equivalent project root).
 * @param {string} nightToken Folder name for the night, e.g. 20260412_I (matches SOP 13 root).
 */
function createNightlyTemplate(rootFolderId, nightToken) {
  const root = DriveApp.getFolderById(rootFolderId);

  const calibration = getOrCreateFolder_(root, '_calibration');
  getOrCreateFolder_(calibration, 'HOBO');
  getOrCreateFolder_(calibration, 'SQM');
  getOrCreateFolder_(calibration, 'baseline_readings');

  const night = getOrCreateFolder_(root, nightToken);
  const p = nightToken;

  getOrCreateFolder_(night, p + '_SM4');

  const am = getOrCreateFolder_(night, p + '_AM');
  getOrCreateFolder_(am, 'N');
  getOrCreateFolder_(am, 'S');

  getOrCreateFolder_(night, p + '_SQM');

  const hobo = getOrCreateFolder_(night, p + '_HOBO');
  for (var h = 1; h <= 6; h += 1) {
    var id = h < 10 ? '0' + h : String(h);
    getOrCreateFolder_(hobo, id);
  }

  getOrCreateFolder_(night, p + '_SPEC');
  getOrCreateFolder_(night, p + '_THERMAL');
  getOrCreateFolder_(night, p + '_LUX');
  getOrCreateFolder_(night, p + '_ALLSKY');

  getOrCreateFolder_(night, p + '_LLV');

  getOrCreateFolder_(night, p + '_WEATHER');
  getOrCreateFolder_(night, p + '_ADMIN');
}

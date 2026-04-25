/**
 * LIGHT Team: Google Drive nightly folder template
 * --------------------------------------------------
 * AUTHORSHIP
 * System architecture and all structural decisions were produced by Logan Jones
 * in collaboration with Claude (Anthropic) and Cursor AI.
 * Folder hierarchy follows SOPs 12 and 13 as specified in the LIGHT Team
 * Pre-Season Work Plan (Aavash Ghising, Task 1, due March 31, 2026).
 * Principal Investigator: Dr. John F. Cavitt, Weber State University.
 */

const DRIVE_CONFIG = {
  HOBO_COUNT: 6,
  SENSOR_SUFFIXES: ['SM4', 'SM5', 'SQM', 'SPEC', 'THERMAL', 'LUX', 'ALLSKY', 'LLV', 'WEATHER', 'ADMIN'],
  AM_SUBFOLDERS: ['N', 'S'],
  CALIBRATION_SUBFOLDERS: ['HOBO', 'SQM', 'baseline_readings'],
  PERMANENT_FOLDERS: ['_admin', '_scripts']
};

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * @param {string} rootFolderId Drive ID of LIGHT_ALAN-W_2026 (or equivalent project root).
 * @param {string} nightToken Folder name for the night, e.g. 20260412_I (matches SOP 13 root).
 */
function createNightlyTemplate(rootFolderId, nightToken) {
  if (!/^\d{8}_[IC]$/.test(nightToken)) {
    throw new Error(
      'Invalid nightToken "' + nightToken + '". ' +
      'Expected format: YYYYMMDD_I (e.g. 20260412_I) or YYYYMMDD_C for Control.'
    );
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Could not acquire lock for createNightlyTemplate. Another instance may be running.');
  }

  try {
    const createdBy = Session.getActiveUser().getEmail();
    const createdAt = new Date().toISOString();
    Logger.log(
      'createNightlyTemplate started: token=%s rootId=%s user=%s time=%s',
      nightToken,
      rootFolderId,
      createdBy,
      createdAt
    );

    const root = DriveApp.getFolderById(rootFolderId);

    // Permanent project folders, created once and reused every night.
    DRIVE_CONFIG.PERMANENT_FOLDERS.forEach(function(name) {
      getOrCreateFolder_(root, name);
    });
    getOrCreateFolder_(root, '_to_rename');
    const toRename = getOrCreateFolder_(root, '_to_rename');
    const readmeContent =
      'SOP 13: Correction folder\n\n' +
      'Place files here when:\n' +
      '- A file was named incorrectly at ingest\n' +
      '- A device-generated name is garbled, duplicated, or problematic\n\n' +
      'For each file placed here:\n' +
      '1. Preserve the original file exactly as-is\n' +
      '2. Create the correctly named version in the correct nightly subfolder\n' +
      '3. Document both the error and the correction in the Master Field Log\n' +
      '4. Note the issue in the ingest manifest\n\n' +
      'Do not delete, overwrite, or rename files directly in place.\n' +
      'Do not erase original device media until the Data and QA Coordinator confirms resolution.';
    const existing = toRename.getFilesByName('README.txt');
    if (!existing.hasNext()) {
      toRename.createFile('README.txt', readmeContent, MimeType.PLAIN_TEXT);
    }
    const calibration = getOrCreateFolder_(root, '_calibration');
    DRIVE_CONFIG.CALIBRATION_SUBFOLDERS.forEach(function(sub) {
      getOrCreateFolder_(calibration, sub);
    });
    getOrCreateFolder_(root, '_audio_export');
    Logger.log('Permanent folders verified: _admin, _scripts, _calibration, _audio_export');

    // Nightly folder tree.
    const night = getOrCreateFolder_(root, nightToken);
    const p = nightToken;
    Logger.log('Nightly folder created: %s (id=%s)', nightToken, night.getId());

    const am = getOrCreateFolder_(night, p + '_AM');
    DRIVE_CONFIG.AM_SUBFOLDERS.forEach(function(sub) {
      getOrCreateFolder_(am, sub);
    });

    const hobo = getOrCreateFolder_(night, p + '_HOBO');
    for (var h = 1; h <= DRIVE_CONFIG.HOBO_COUNT; h += 1) {
      var id = h < 10 ? '0' + h : String(h);
      getOrCreateFolder_(hobo, id);
    }

    DRIVE_CONFIG.SENSOR_SUFFIXES.forEach(function(suffix) {
      getOrCreateFolder_(night, p + '_' + suffix);
    });
    const spec = getOrCreateFolder_(night, p + '_SPEC');
    getOrCreateFolder_(spec, 'raw');
    getOrCreateFolder_(spec, 'dark');
    getOrCreateFolder_(spec, 'screencap');
    const allsky = getOrCreateFolder_(night, p + '_ALLSKY');
    getOrCreateFolder_(allsky, 'dark');
    Logger.log('Sensor subfolders created under %s', nightToken);
    Logger.log('createNightlyTemplate complete: %s', nightToken);

    return {
      nightToken: nightToken,
      nightFolderId: night.getId(),
      rootFolderId: root.getId(),
      createdAt: new Date().toISOString(),
      createdBy: createdBy,
      sensorFolders: DRIVE_CONFIG.SENSOR_SUFFIXES.map(function(s) {
        return p + '_' + s;
      })
    };
  } finally {
    lock.releaseLock();
  }
}

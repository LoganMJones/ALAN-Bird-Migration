/**
 * LIGHT Team — Google Drive nightly folder template
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
  SENSOR_SUFFIXES: ['SM4', 'SQM', 'SPEC', 'THERMAL', 'LUX', 'ALLSKY', 'LLV', 'WEATHER', 'ADMIN'],
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

    // Permanent project folders — created once, reused every night.
    DRIVE_CONFIG.PERMANENT_FOLDERS.forEach(function(name) {
      getOrCreateFolder_(root, name);
    });
    const calibration = getOrCreateFolder_(root, '_calibration');
    DRIVE_CONFIG.CALIBRATION_SUBFOLDERS.forEach(function(sub) {
      getOrCreateFolder_(calibration, sub);
    });
    Logger.log('Permanent folders verified: _admin, _scripts, _calibration');

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

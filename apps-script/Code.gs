/**
 * Namdal Sportsskytterlag – registrering av tilstedeværelse på skytetrening.
 *
 * Google Apps Script web-app. Datakilden er et Google-regneark med tre faner:
 *   Medlemmer       – medlemslisten (kan importeres automatisk fra en Excel-fil i Drive)
 *   Økter           – én rad per treningsdag med valgt skyteleder ("huskes" for dagen)
 *   Registreringer  – én rad per person som har registrert seg
 *
 * Se README.md for oppsett.
 */

const CONFIG = {
  SHEET_MEMBERS: 'Medlemmer',
  SHEET_SESSIONS: 'Økter',
  SHEET_REGISTRATIONS: 'Registreringer',

  // Kolonnenavn som gjenkjennes i medlemsarket (store/små bokstaver ignoreres).
  COLUMNS: {
    name: ['navn', 'fullt navn', 'medlemsnavn', 'name'],
    firstName: ['fornavn', 'first name'],
    lastName: ['etternavn', 'last name'],
    active: ['aktiv', 'status'],
    leader: ['skyteleder', 'kan være skyteleder', 'godkjent skyteleder'],
  },

  MEMBER_HEADERS: ['Navn', 'Medlemsnr', 'Aktiv', 'Skyteleder'],
  SESSION_HEADERS: ['Dato', 'Skyteleder', 'Satt kl.', 'Endret kl.'],
  REGISTRATION_HEADERS: ['Tidspunkt', 'Dato', 'Navn', 'Type', 'Invitert av', 'Skyteleder'],

  MAX_GUEST_NAME_LENGTH: 80,
};

/* ------------------------------------------------------------------ */
/* Web-app                                                             */
/* ------------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Registrer tilstedeværelse – Namdal Sportsskytterlag')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    // Tillat at skjemaet bygges inn på nettsiden (namdalssl.no/oppmoteregistrering/).
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Data klienten trenger når siden lastes (og etter hver registrering).
 * @param {string=} pin  Tilgangskode hvis ACCESS_PIN er satt.
 */
function getInitialData(pin) {
  checkPin_(pin);
  const ss = getSpreadsheet_();
  const members = readMembers_(ss);
  const today = todayKey_();
  const session = findSession_(ss, today);
  const active = members.filter(function (m) { return m.active; });

  return {
    today: today,
    members: sortNames_(active.map(function (m) { return m.name; })),
    leaders: sortNames_(active.filter(function (m) { return m.leader; }).map(function (m) { return m.name; })),
    todayLeader: session ? { name: session.name, setAt: session.setAt } : null,
    registeredToday: registrationsFor_(ss, today).length,
  };
}

/**
 * Registrer én person på dagens trening.
 * @param {{pin?:string, type:'medlem'|'gjest', name:string, invitedBy?:string,
 *          leader?:string, changeLeader?:boolean}} p
 * @return {{status:'ok'|'already'|'needLeader', name?:string, time?:string, leader?:string}}
 */
function register(p) {
  p = p || {};
  checkPin_(p.pin);

  const type = p.type === 'gjest' ? 'Gjest' : 'Medlem';
  const name = clean_(p.name);
  const invitedBy = clean_(p.invitedBy);
  const requestedLeader = clean_(p.leader);
  if (!name) throw new Error('Navn mangler.');

  const ss = getSpreadsheet_();
  const members = readMembers_(ss).filter(function (m) { return m.active; });
  const memberNames = new Set(members.map(function (m) { return m.name; }));
  const leaderNames = new Set(members.filter(function (m) { return m.leader; }).map(function (m) { return m.name; }));

  if (type === 'Medlem' && !memberNames.has(name)) {
    throw new Error('Fant ikke «' + name + '» i medlemslisten. Velg navnet fra listen, eller registrer deg som gjest.');
  }
  if (type === 'Gjest' && name.length > CONFIG.MAX_GUEST_NAME_LENGTH) {
    throw new Error('Navnet er for langt.');
  }
  if (invitedBy && !memberNames.has(invitedBy)) {
    throw new Error('Fant ikke «' + invitedBy + '» i medlemslisten.');
  }
  if (requestedLeader && !leaderNames.has(requestedLeader)) {
    throw new Error('«' + requestedLeader + '» er ikke registrert som skyteleder.');
  }

  // Låsen hindrer at to som registrerer seg samtidig begge setter skyteleder.
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const today = todayKey_();
    const now = new Date();
    const time = formatTime_(now);
    const sessions = ensureSheet_(ss, CONFIG.SHEET_SESSIONS, CONFIG.SESSION_HEADERS);
    let session = findSession_(ss, today);

    if (!session) {
      if (!requestedLeader) return { status: 'needLeader' };
      sessions.appendRow([today, requestedLeader, time, '']);
      session = { name: requestedLeader, setAt: time };
    } else if (p.changeLeader && requestedLeader && requestedLeader !== session.name) {
      sessions.getRange(session.row, 2, 1, 3).setValues([[requestedLeader, session.setAt, time]]);
      session = { name: requestedLeader, setAt: session.setAt };
    }

    const already = registrationsFor_(ss, today).some(function (r) {
      return r.name.toLowerCase() === name.toLowerCase();
    });
    if (already) return { status: 'already', name: name, leader: session.name };

    ensureSheet_(ss, CONFIG.SHEET_REGISTRATIONS, CONFIG.REGISTRATION_HEADERS)
      .appendRow([now, today, name, type, invitedBy, session.name]);

    return { status: 'ok', name: name, time: time, leader: session.name };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Oppsett og import (kjøres fra Apps Script-editoren)                 */
/* ------------------------------------------------------------------ */

/** Oppretter fanene med overskrifter hvis de mangler. Overskriver ingenting. */
function setup() {
  const ss = getSpreadsheet_();
  const members = ss.getSheetByName(CONFIG.SHEET_MEMBERS);
  if (!members) {
    const sh = ensureSheet_(ss, CONFIG.SHEET_MEMBERS, CONFIG.MEMBER_HEADERS);
    sh.getRange(2, 1, 3, 4).setValues([
      ['Kari Nordmann', '1001', 'Ja', 'Ja'],
      ['Ola Nordmann', '1002', 'Ja', 'Nei'],
      ['Eksempel Medlem', '1003', 'Ja', 'Nei'],
    ]);
  }
  ensureSheet_(ss, CONFIG.SHEET_SESSIONS, CONFIG.SESSION_HEADERS);
  ensureSheet_(ss, CONFIG.SHEET_REGISTRATIONS, CONFIG.REGISTRATION_HEADERS);
  return 'Ferdig. Fanene ' + [CONFIG.SHEET_MEMBERS, CONFIG.SHEET_SESSIONS, CONFIG.SHEET_REGISTRATIONS].join(', ') + ' finnes.';
}

/**
 * Henter den nyeste Excel-fila (.xlsx) fra Drive-mappa i script-egenskapen
 * EXCEL_FOLDER_ID og erstatter innholdet i fanen Medlemmer.
 * Krever avansert tjeneste «Drive API» (er slått på i appsscript.json).
 */
function importLatestExcel() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('EXCEL_FOLDER_ID');
  if (!folderId) throw new Error('Sett script-egenskapen EXCEL_FOLDER_ID til ID-en for Drive-mappa med Excel-fila.');

  const files = DriveApp.getFolderById(folderId).getFilesByType(MimeType.MICROSOFT_EXCEL);
  let newest = null;
  while (files.hasNext()) {
    const f = files.next();
    if (!newest || f.getLastUpdated() > newest.getLastUpdated()) newest = f;
  }
  if (!newest) return 'Fant ingen Excel-fil i mappa.';

  const signature = newest.getId() + ':' + newest.getLastUpdated().getTime();
  if (props.getProperty('LAST_IMPORTED') === signature) return 'Ingen endringer siden forrige import.';

  const tmp = Drive.Files.create(
    { name: 'tmp-import – ' + newest.getName(), mimeType: MimeType.GOOGLE_SHEETS },
    newest.getBlob()
  );
  try {
    const values = SpreadsheetApp.openById(tmp.id).getSheets()[0].getDataRange().getDisplayValues();
    const col = findColumns_(values[0] || []);
    if (col.name < 0 && col.firstName < 0) {
      throw new Error('Fant ingen kolonne for navn i «' + newest.getName() + '». Forventet f.eks. «Navn» eller «Fornavn»/«Etternavn».');
    }
    const sh = ensureSheet_(getSpreadsheet_(), CONFIG.SHEET_MEMBERS, CONFIG.MEMBER_HEADERS);
    sh.clearContents();
    sh.getRange(1, 1, values.length, values[0].length).setValues(values);
  } finally {
    DriveApp.getFileById(tmp.id).setTrashed(true);
  }
  props.setProperty('LAST_IMPORTED', signature);
  return 'Importerte ' + newest.getName() + '.';
}

/** Kjører importLatestExcel hver natt kl. 03. */
function installNightlyImport() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'importLatestExcel'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('importLatestExcel').timeBased().everyDays(1).atHour(3).create();
  return 'Nattlig import er satt opp.';
}

/* ------------------------------------------------------------------ */
/* Hjelpefunksjoner                                                    */
/* ------------------------------------------------------------------ */

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Fant ikke regnearket. Sett script-egenskapen SPREADSHEET_ID.');
  return ss;
}

function checkPin_(pin) {
  const required = PropertiesService.getScriptProperties().getProperty('ACCESS_PIN');
  if (required && String(pin || '') !== required) throw new Error('PIN_REQUIRED');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readMembers_(ss) {
  const sh = ss.getSheetByName(CONFIG.SHEET_MEMBERS);
  if (!sh) throw new Error('Fant ikke fanen «' + CONFIG.SHEET_MEMBERS + '». Kjør setup() først.');
  const values = sh.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const col = findColumns_(values[0]);
  if (col.name < 0 && col.firstName < 0) {
    throw new Error('Fant ingen navnekolonne i fanen «' + CONFIG.SHEET_MEMBERS + '».');
  }

  const seen = new Set();
  const out = [];
  values.slice(1).forEach(function (row) {
    const name = clean_(col.name >= 0
      ? row[col.name]
      : [row[col.firstName], col.lastName >= 0 ? row[col.lastName] : ''].join(' '));
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({
      name: name,
      active: col.active < 0 ? true : !isNo_(row[col.active]),
      leader: col.leader < 0 ? true : isYes_(row[col.leader]),
    });
  });
  return out;
}

function findColumns_(header) {
  const norm = header.map(function (h) { return String(h).trim().toLowerCase(); });
  const out = {};
  Object.keys(CONFIG.COLUMNS).forEach(function (key) {
    out[key] = norm.findIndex(function (h) { return CONFIG.COLUMNS[key].indexOf(h) >= 0; });
  });
  return out;
}

function findSession_(ss, today) {
  const sh = ss.getSheetByName(CONFIG.SHEET_SESSIONS);
  if (!sh) return null;
  const values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (dateKey_(values[i][0]) === today && clean_(values[i][1])) {
      return { row: i + 1, name: clean_(values[i][1]), setAt: timeText_(values[i][2]) };
    }
  }
  return null;
}

function registrationsFor_(ss, today) {
  const sh = ss.getSheetByName(CONFIG.SHEET_REGISTRATIONS);
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(function (r) { return dateKey_(r[1]) === today; })
    .map(function (r) { return { name: clean_(r[2]), type: r[3] }; });
}

function todayKey_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function dateKey_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').trim();
}

function formatTime_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'HH:mm');
}

function timeText_(v) {
  return v instanceof Date ? formatTime_(v) : String(v || '').trim();
}

function clean_(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function isYes_(v) {
  return ['ja', 'j', 'x', 'yes', 'true', '1', 'sant'].indexOf(String(v).trim().toLowerCase()) >= 0;
}

function isNo_(v) {
  return ['nei', 'n', 'no', 'false', '0', 'usant', 'inaktiv', 'utmeldt', 'sluttet'].indexOf(String(v).trim().toLowerCase()) >= 0;
}

function sortNames_(names) {
  return names.slice().sort(function (a, b) { return a.localeCompare(b, 'nb'); });
}

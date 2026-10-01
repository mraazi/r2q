/**
 * Recitation Tracker v2 — Google Apps Script backend
 * --------------------------------------------------
 * Storage : this Google Sheet (tabs: Students, Sessions, Tajweed)
 * Teacher : <web app URL>?admin=<ADMIN_KEY>   (or open the URL and enter the key)
 * Parents : <web app URL>?s=<student token>   (read-only, one student only)
 *
 * Setup steps are in SETUP.md. Short version:
 *   1. Paste Code.gs + Index.html into Extensions > Apps Script of a new Google Sheet
 *   2. Run setup() once and authorise
 *   3. Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone
 *   4. Menu "Recitation Tracker > Show teacher link"
 */

// ============================== CONFIG ==============================

var APP_NAME = 'Recitation Tracker';
var DEFAULT_SESSIONS_PER_MONTH = 8;
var ATTENDANCE = ['Present', 'Absent', 'Replacement'];
var STATUSES = ['Not yet', 'Learning', 'Fair', 'Mastered'];
var MONTH_STATUSES = ['Open', 'Completed'];

// Tajweed syllabus (mirrors the monthly sheet). Topic ids are permanent keys —
// rename labels freely, but never reuse or change an id once data exists.
var TOPIC_GROUPS = [
  { id: 'general', name: 'General', topics: [
    ['g1', 'Makharijul Hurf'], ['g2', 'Harakah'], ['g3', 'Sukoon & Shaddah'],
    ['g4', 'Ismul-Jalaalah'], ['g5', 'Breathing/Flow']
  ]},
  { id: 'sifat', name: 'Sifatul Hurf', topics: [
    ['s1', 'Qolqolah'], ['s2', 'Leen'], ['s3', 'Istitaalah'], ['s4', 'Tafash-shee'],
    ['s5', 'Inhiraaf'], ['s6', 'Safeer'], ['s7', 'Takreer'], ['s8', 'Hams/Jahr'],
    ['s9', 'Shiddah/Rokhowah/Bayniyyah'], ['s10', "Isti'laa'/Istifaal"], ['s11', 'Itbaaq/Infitaah']
  ]},
  { id: 'rulings', name: 'Rulings', topics: [
    ['r1', 'Noon Meem Mushaddadah'],
    ['rn1', 'Iqlaab', 'Noon Saakinah wa Tanween'], ['rn2', "Ikhfaa'", 'Noon Saakinah wa Tanween'],
    ['rn3', 'Idghaam', 'Noon Saakinah wa Tanween'], ['rn4', 'Idzhaar', 'Noon Saakinah wa Tanween'],
    ['rm1', "Ikhfaa'", 'Meem Shafawee'], ['rm2', 'Idghaam', 'Meem Shafawee'], ['rm3', 'Idzhaar', 'Meem Shafawee'],
    ['rd1', "Mad Tobi'ee & Mad Badal", 'Mudood'], ['rd2', 'Mad Waajib Muttasil', 'Mudood'],
    ['rd3', "Mad Ja'iz Munfasil", 'Mudood'], ['rd4', "Mad 'Aaridh Lissukoon", 'Mudood'],
    ['rd5', 'Mad Leen', 'Mudood'], ['rd6', "Mad 'Iwadh", 'Mudood'],
    ['rd7', 'Mad Silah Sughra/Kubra', 'Mudood'], ['rd8', 'Mad Laazim Harfee/Kalimee', 'Mudood']
  ]},
  { id: 'additional', name: 'Additional Rulings', topics: [
    ['a1', "Waqf Ibtida'"], ['a2', 'Hamzatul Wasl'], ['a3', 'Saktah'], ['a4', 'Imalah/Ishmam/Rawm']
  ]}
];

var SHEETS = {
  Students: ['id', 'name', 'age', 'token', 'active', 'notes', 'createdAt', 'plan'],
  Sessions: ['id', 'studentId', 'date', 'attendance', 'page', 'surah', 'ayah', 'notes', 'updatedAt', 'pageFrom'],
  Tajweed:  ['id', 'studentId', 'date', 'topicId', 'status', 'remarks', 'updatedAt'],
  Months:   ['id', 'studentId', 'month', 'status', 'classes', 'remarks', 'updatedAt']
};
// Columns stored as plain text so Sheets never auto-converts them (dates, ids, and
// free text that starts with "=" or "+" would otherwise be parsed as formulas)
var TEXT_COLS = {
  Students: ['id', 'name', 'token', 'notes', 'plan'],
  Sessions: ['id', 'studentId', 'date', 'notes'],
  Tajweed:  ['id', 'studentId', 'date', 'topicId', 'remarks'],
  Months:   ['id', 'studentId', 'month', 'remarks']
};

// ============================== WEB APP ==============================

function doGet(e) {
  var p = (e && e.parameter) || {};
  var boot = { mode: 'signin', url: getWebAppUrl_() };

  try {
    if (p.s) {
      boot.mode = 'parent';
      boot.data = getParentView(String(p.s));
    } else if (p.admin) {
      if (isAdmin_(p.admin)) {
        boot.mode = 'teacher';
        boot.key = String(p.admin);
        boot.data = bootstrap_();
      } else {
        boot.error = 'Teacher key not recognised.';
      }
    }
  } catch (err) {
    boot.error = err.message || String(err);
  }

  var t = HtmlService.createTemplateFromFile('Index');
  // '/' is escaped too: HtmlService strips anything after '//' in inline scripts
  t.bootJson = JSON.stringify(boot).replace(/</g, '\\u003c').replace(/\//g, '\\/').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

// ============================== JSON API (for the GitHub Pages site) ==============================
// The static site POSTs {fn, args} as text/plain (avoids a CORS preflight) and gets {ok, result|error} back.

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fns = {
      api_signIn: api_signIn, api_bootstrap: api_bootstrap, api_saveStudent: api_saveStudent,
      api_resetToken: api_resetToken, api_saveSession: api_saveSession, api_deleteSession: api_deleteSession,
      api_saveTajweed: api_saveTajweed, api_saveMonth: api_saveMonth, api_deleteMonth: api_deleteMonth,
      api_deleteTajweedEntry: api_deleteTajweedEntry, api_saveSettings: api_saveSettings,
      getParentView: getParentView
    };
    var fn = String(req.fn || '');
    if (!Object.prototype.hasOwnProperty.call(fns, fn)) throw new Error('Unknown action.');
    out = { ok: true, result: fns[fn].apply(null, req.args || []) };
  } catch (err) {
    out = { ok: false, error: (err && err.message) || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// ============================== PUBLIC API (called via google.script.run) ==============================
// Every teacher function takes the admin key first and rejects anything else.

/** Teacher sign-in: returns the full dataset if the key is valid. */
function api_signIn(key) {
  assertAdmin_(key);
  return bootstrap_();
}

function api_bootstrap(key) {
  assertAdmin_(key);
  return bootstrap_();
}

/** Create or update a student. Returns the saved student. */
function api_saveStudent(key, s) {
  assertAdmin_(key);
  var name = clean_(s && s.name, 120);
  if (!name) throw new Error('Student name is required.');
  var age = s.age === '' || s.age == null ? '' : toInt_(s.age, 3, 99, 'Age');
  return withLock_(function () {
    var existing = s.id ? findById_('Students', s.id) : null;
    var row = {
      id: existing ? existing.id : newId_(),
      name: name,
      age: age,
      token: existing ? existing.token : newToken_(),
      active: s.active === false || s.active === 'FALSE' ? false : true,
      notes: clean_(s.notes, 500),
      createdAt: existing ? existing.createdAt : nowIso_(),
      plan: s.plan != null ? cleanPlan_(s.plan) : (existing ? existing.plan : '')
    };
    upsert_('Students', row);
    return row;
  });
}

/** Issue a new parent link (old link stops working immediately). */
function api_resetToken(key, studentId) {
  assertAdmin_(key);
  return withLock_(function () {
    var st = findById_('Students', studentId);
    if (!st) throw new Error('Student not found.');
    st.token = newToken_();
    upsert_('Students', st);
    return st;
  });
}

/** Create or update a session (attendance + page progress). */
function api_saveSession(key, x) {
  assertAdmin_(key);
  if (!x || !findById_('Students', x.studentId)) throw new Error('Student not found.');
  var date = checkDate_(x.date);
  if (ATTENDANCE.indexOf(x.attendance) < 0) throw new Error('Attendance must be Present, Absent or Replacement.');
  var absent = x.attendance === 'Absent';
  var row = {
    id: x.id || newId_(),
    studentId: String(x.studentId),
    date: date,
    attendance: x.attendance,
    page: absent || blank_(x.page) ? '' : toInt_(x.page, 1, 604, 'Page'),
    pageFrom: absent || blank_(x.pageFrom) ? '' : toInt_(x.pageFrom, 1, 604, 'From page'),
    surah: absent || blank_(x.surah) ? '' : toInt_(x.surah, 1, 114, 'Surah'),
    ayah: absent || blank_(x.ayah) ? '' : toInt_(x.ayah, 1, 286, 'Ayat'),
    notes: clean_(x.notes, 1000),
    updatedAt: nowIso_()
  };
  return withLock_(function () { upsert_('Sessions', row); return row; });
}

function api_deleteSession(key, id) {
  assertAdmin_(key);
  return withLock_(function () { return deleteById_('Sessions', id); });
}

/**
 * Save Tajweed assessments for one student as of a date.
 * changes: [{topicId, status, remarks}] — one row per topic per date (re-saving the same date overwrites).
 */
function api_saveTajweed(key, studentId, date, changes) {
  assertAdmin_(key);
  if (!findById_('Students', studentId)) throw new Error('Student not found.');
  date = checkDate_(date);
  var valid = topicIds_();
  var clean = (changes || []).map(function (c) {
    if (!valid[c.topicId]) throw new Error('Unknown topic: ' + c.topicId);
    if (c.status && STATUSES.indexOf(c.status) < 0) throw new Error('Unknown status: ' + c.status);
    return { topicId: c.topicId, status: c.status || '', remarks: clean_(c.remarks, 1000) };
  });
  if (!clean.length) return [];

  return withLock_(function () {
    var rows = readTable_('Tajweed');
    var byKey = {};
    rows.forEach(function (r) { if (r.studentId === studentId && r.date === date) byKey[r.topicId] = r; });
    var saved = [];
    var appends = [];
    clean.forEach(function (c) {
      var ex = byKey[c.topicId];
      var row = {
        id: ex ? ex.id : newId_(), studentId: studentId, date: date, topicId: c.topicId,
        status: c.status, remarks: c.remarks, updatedAt: nowIso_()
      };
      if (ex) upsert_('Tajweed', row); else appends.push(toRow_('Tajweed', row));
      saved.push(row);
    });
    appendRows_('Tajweed', appends);
    return saved;
  });
}

/**
 * Create or update a month record for a student (one per student per month).
 * m: {studentId, month:'YYYY-MM', status:'Open'|'Completed', classes: 1..31 or '', remarks}
 */
function api_saveMonth(key, m) {
  assertAdmin_(key);
  if (!m || !findById_('Students', m.studentId)) throw new Error('Student not found.');
  var month = String(m.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Month must be YYYY-MM.');
  var status = m.status || 'Open';
  if (MONTH_STATUSES.indexOf(status) < 0) throw new Error('Status must be Open or Completed.');
  return withLock_(function () {
    var existing = readTable_('Months').filter(function (r) { return r.studentId === String(m.studentId) && r.month === month; })[0];
    var row = {
      id: existing ? existing.id : newId_(),
      studentId: String(m.studentId),
      month: month,
      status: status,
      classes: blank_(m.classes) ? '' : toInt_(m.classes, 1, 31, 'Classes'),
      remarks: clean_(m.remarks, 1000),
      updatedAt: nowIso_()
    };
    upsert_('Months', row);
    return row;
  });
}

/** Removes a month record only (sessions and tajweed entries in that month are kept). */
function api_deleteMonth(key, id) {
  assertAdmin_(key);
  return withLock_(function () { return deleteById_('Months', id); });
}

function api_deleteTajweedEntry(key, id) {
  assertAdmin_(key);
  return withLock_(function () { return deleteById_('Tajweed', id); });
}

function api_saveSettings(key, s) {
  assertAdmin_(key);
  var props = PropertiesService.getScriptProperties();
  if (s.webAppUrl != null) {
    var u = String(s.webAppUrl).trim().replace(/\?.*$/, '');
    if (u && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) throw new Error('Web app URL must start with https://script.google.com and end with /exec');
    props.setProperty('WEB_APP_URL', u);
  }
  if (s.sessionsPerMonth != null) props.setProperty('SESSIONS_PER_MONTH', String(toInt_(s.sessionsPerMonth, 1, 31, 'Sessions per month')));
  return settings_();
}

/** Parent (read-only) view for a single student. */
function getParentView(token) {
  token = String(token || '').trim();
  if (!/^[a-f0-9]{24}$/.test(token)) throw new Error('This link is not valid. Please ask the teacher for a new one.');
  var st = readTable_('Students').filter(function (s) { return s.token === token; })[0];
  if (!st || st.active === false || st.active === 'FALSE') throw new Error('This link is not valid. Please ask the teacher for a new one.');
  return {
    student: { id: st.id, name: st.name, age: st.age, plan: st.plan },
    sessions: readTable_('Sessions').filter(function (r) { return r.studentId === st.id; })
      .map(function (r) { return { date: r.date, attendance: r.attendance, pageFrom: r.pageFrom, page: r.page, surah: r.surah, ayah: r.ayah, notes: r.notes }; }),
    tajweed: readTable_('Tajweed').filter(function (r) { return r.studentId === st.id; })
      .map(function (r) { return { date: r.date, topicId: r.topicId, status: r.status, remarks: r.remarks }; }),
    months: readTable_('Months').filter(function (r) { return r.studentId === st.id; })
      .map(function (r) { return { month: r.month, status: r.status, classes: r.classes, remarks: r.remarks }; }),
    topics: TOPIC_GROUPS, statuses: STATUSES,
    settings: { sessionsPerMonth: settings_().sessionsPerMonth }
  };
}

// ============================== SHEET MENU / SETUP ==============================

function onOpen() {
  SpreadsheetApp.getUi().createMenu(APP_NAME)
    .addItem('Show teacher link', 'menuShowLinks')
    .addItem('Set web app URL…', 'menuSetUrl')
    .addSeparator()
    .addItem('Run setup (safe to re-run)', 'setup')
    .addItem('Import data from v1 tracker…', 'menuImportV1')
    .addItem('Reset teacher key', 'menuResetKey')
    .addToUi();
}

/** Creates the tabs and the teacher key. Safe to run again. */
function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var head = SHEETS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#E8F0EC');
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach(function (col) {
      var c = head.indexOf(col) + 1;
      sh.getRange(1, c, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  });
  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', newToken_());
  if (!props.getProperty('SESSIONS_PER_MONTH')) props.setProperty('SESSIONS_PER_MONTH', String(DEFAULT_SESSIONS_PER_MONTH));

  var msg = 'Setup done.\n\nTeacher key: ' + props.getProperty('ADMIN_KEY') +
    '\n\nNext: Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone), then use menu ' +
    APP_NAME + ' > Show teacher link.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* run from editor: see Execution log */ }
}

function menuShowLinks() {
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  var url = getWebAppUrl_();
  var html = '<div style="font:14px/1.5 Arial,sans-serif">' +
    (url ? '<p><b>Teacher link</b> (bookmark it, don\'t share it):</p><p><a target="_blank" href="' + url + '?admin=' + key + '">' + url + '?admin=' + key + '</a></p>'
         : '<p style="color:#b00">Web app URL is not set. Deploy first, then use <b>Set web app URL…</b>.</p>') +
    '<p><b>Teacher key:</b> <code>' + key + '</code></p>' +
    '<p>Parent links are in the app: open a student, then tap <b>Parent link</b>.</p></div>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(240), APP_NAME);
}

function menuSetUrl() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Web app URL', 'Paste the Web app URL from Deploy > Manage deployments (ends with /exec):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var u = r.getResponseText().trim().replace(/\?.*$/, '');
  if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) { ui.alert('That does not look like a web app URL ending in /exec.'); return; }
  PropertiesService.getScriptProperties().setProperty('WEB_APP_URL', u);
  ui.alert('Saved.');
}

function menuResetKey() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Reset teacher key?', 'Your current teacher link will stop working. Parent links are not affected.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', newToken_());
  menuShowLinks();
}

/**
 * One-off import from the v1 tracker sheet ("Quran Tracker Data" > "Quran Progress":
 * Date | Time | Student Name | Surah | Page). Creates missing students and one Present
 * session per student per day (the last page logged that day). Safe to re-run.
 */
function menuImportV1() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Import v1 data', 'Paste the URL of the old "Quran Tracker Data" Google Sheet:', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var m = r.getResponseText().match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) { ui.alert('Could not read a sheet ID from that URL.'); return; }
  ui.alert(importV1_(m[1]));
}

function importV1_(sheetId) {
  var src = SpreadsheetApp.openById(sheetId).getSheetByName('Quran Progress');
  if (!src) return 'No "Quran Progress" tab found in that sheet.';
  var data = src.getDataRange().getValues().slice(1);
  var tz = Session.getScriptTimeZone();
  return withLock_(function () {
    var students = readTable_('Students');
    var byName = {};
    students.forEach(function (s) { byName[String(s.name).trim().toLowerCase()] = s; });
    var existingSess = {};
    readTable_('Sessions').forEach(function (x) { existingSess[x.studentId + '|' + x.date] = true; });

    var lastPerDay = {}; // key studentId|date -> page
    var newStudents = 0;
    data.forEach(function (row) {
      var name = String(row[2] || '').trim();
      var page = parseInt(row[4], 10);
      if (!name || !(page >= 1 && page <= 604)) return;
      var d = row[0] instanceof Date ? Utilities.formatDate(row[0], tz, 'yyyy-MM-dd') : String(row[0]).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      var st = byName[name.toLowerCase()];
      if (!st) {
        st = { id: newId_(), name: name, age: '', token: newToken_(), active: true, notes: '', createdAt: nowIso_() };
        upsert_('Students', st);
        byName[name.toLowerCase()] = st;
        newStudents++;
      }
      lastPerDay[st.id + '|' + d] = page; // rows are chronological, last one wins
    });

    var rows = [];
    Object.keys(lastPerDay).forEach(function (k) {
      if (existingSess[k]) return;
      var parts = k.split('|');
      rows.push(toRow_('Sessions', { id: newId_(), studentId: parts[0], date: parts[1], attendance: 'Present',
        page: lastPerDay[k], surah: '', ayah: '', notes: 'Imported from v1', updatedAt: nowIso_() }));
    });
    appendRows_('Sessions', rows);
    return 'Imported ' + newStudents + ' new student(s) and ' + rows.length + ' session(s).';
  });
}

// ============================== INTERNALS ==============================

function bootstrap_() {
  return {
    students: readTable_('Students'),
    sessions: readTable_('Sessions'),
    tajweed: readTable_('Tajweed'),
    months: readTable_('Months'),
    topics: TOPIC_GROUPS, statuses: STATUSES, attendance: ATTENDANCE, monthStatuses: MONTH_STATUSES,
    settings: settings_()
  };
}

function settings_() {
  var props = PropertiesService.getScriptProperties();
  return {
    sessionsPerMonth: parseInt(props.getProperty('SESSIONS_PER_MONTH'), 10) || DEFAULT_SESSIONS_PER_MONTH,
    webAppUrl: getWebAppUrl_()
  };
}

function getWebAppUrl_() {
  var stored = PropertiesService.getScriptProperties().getProperty('WEB_APP_URL');
  if (stored) return stored;
  try {
    var u = ScriptApp.getService().getUrl();
    if (u && /\/exec$/.test(u)) return u;
  } catch (e) {}
  return '';
}

function isAdmin_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!real && String(key || '').trim() === real;
}

function assertAdmin_(key) {
  if (!isAdmin_(key)) throw new Error('Not authorised. Check your teacher key.');
}

var HEADERS_OK_ = {};
function sheet_(name) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name);
  if (!sh) { // tabs added in later versions are created on first use
    if (!SHEETS[name]) throw new Error('Unknown tab ' + name);
    sh = ss.insertSheet(name);
    var hd = SHEETS[name];
    sh.getRange(1, 1, 1, hd.length).setValues([hd]).setFontWeight('bold').setBackground('#E8F0EC');
    sh.setFrozenRows(1);
    (TEXT_COLS[name] || []).forEach(function (col) { sh.getRange(1, hd.indexOf(col) + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
  }
  if (!HEADERS_OK_[name]) { // add header cells for columns introduced after the tab was created
    var head = SHEETS[name];
    if (sh.getLastColumn() < head.length) {
      sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#E8F0EC');
      (TEXT_COLS[name] || []).forEach(function (col) { sh.getRange(1, head.indexOf(col) + 1, sh.getMaxRows(), 1).setNumberFormat('@'); });
    }
    HEADERS_OK_[name] = true;
  }
  return sh;
}

function readTable_(name) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  var head = SHEETS[name];
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, head.length).getValues();
  var tz = Session.getScriptTimeZone();
  var out = [];
  vals.forEach(function (v) {
    if (!v[0]) return;
    var o = {};
    head.forEach(function (h, i) {
      var x = v[i];
      if (x instanceof Date) x = h === 'date' ? Utilities.formatDate(x, tz, 'yyyy-MM-dd') : x.toISOString();
      o[h] = x;
    });
    out.push(o);
  });
  return out;
}

function toRow_(name, obj) {
  return SHEETS[name].map(function (h) { return obj[h] === undefined || obj[h] === null ? '' : obj[h]; });
}

function findRowIndex_(name, id) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2 || !id) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function findById_(name, id) {
  var r = findRowIndex_(name, id);
  if (r < 0) return null;
  return readTable_(name).filter(function (o) { return String(o.id) === String(id); })[0] || null;
}

function upsert_(name, obj) {
  var row = toRow_(name, obj);
  var r = findRowIndex_(name, obj.id);
  if (r < 0) return appendRows_(name, [row]);
  sheet_(name).getRange(r, 1, 1, row.length).setValues([row]);
}

/** Appends rows, growing the sheet (with plain-text formats) when it is full. */
function appendRows_(name, rows) {
  if (!rows || !rows.length) return;
  var sh = sheet_(name);
  var start = sh.getLastRow() + 1;
  var need = start + rows.length - 1 - sh.getMaxRows();
  if (need > 0) {
    var grow = Math.max(need, 500);
    sh.insertRowsAfter(sh.getMaxRows(), grow);
    var head = SHEETS[name];
    (TEXT_COLS[name] || []).forEach(function (col) {
      sh.getRange(start, head.indexOf(col) + 1, sh.getMaxRows() - start + 1, 1).setNumberFormat('@');
    });
  }
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function deleteById_(name, id) {
  var r = findRowIndex_(name, id);
  if (r < 0) return false;
  sheet_(name).deleteRow(r);
  return true;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function topicIds_() {
  var m = {};
  TOPIC_GROUPS.forEach(function (g) { g.topics.forEach(function (t) { m[t[0]] = true; }); });
  return m;
}

function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function newToken_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 24); }
function nowIso_() { return new Date().toISOString(); }
function blank_(v) { return v === '' || v === null || v === undefined; }

function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max); }

function toInt_(v, min, max, label) {
  var n = Number(v);
  if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) throw new Error(label + ' must be a whole number from ' + min + ' to ' + max + '.');
  return n;
}

/**
 * Classes-per-month plan: [{from: 'YYYY-MM', n: 1..31}], each entry applies from its month onward.
 * Stored as JSON text so a change (e.g. 8 -> 4 from November) never rewrites past months' targets.
 */
function cleanPlan_(p) {
  if (typeof p === 'string') { if (!p) return ''; try { p = JSON.parse(p); } catch (e) { throw new Error('Invalid class plan.'); } }
  if (!Array.isArray(p)) throw new Error('Invalid class plan.');
  var byMonth = {};
  p.slice(0, 60).forEach(function (e) {
    var from = String(e && e.from || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(from)) throw new Error('Plan month must be YYYY-MM.');
    byMonth[from] = toInt_(e.n, 1, 31, 'Classes per month');
  });
  var out = Object.keys(byMonth).sort().map(function (k) { return { from: k, n: byMonth[k] }; });
  return out.length ? JSON.stringify(out) : '';
}

function checkDate_(d) {
  d = String(d || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d + 'T00:00:00Z'))) throw new Error('Date must be YYYY-MM-DD.');
  return d;
}

/**
 * Google Apps Script for Student Quran Tracker
 *
 * HOW TO SET UP:
 * ==============
 * 1. Go to https://script.google.com
 * 2. Click "New Project"
 * 3. Delete any existing code and paste this entire file
 * 4. Click "Deploy" > "New deployment"
 * 5. Select type: "Web app"
 * 6. Set "Execute as": "Me"
 * 7. Set "Who has access": "Anyone"
 * 8. Click "Deploy"
 * 9. Copy the Web app URL (starts with https://script.google.com/macros/s/...)
 * 10. Paste that URL in the Student Quran Tracker app settings
 *
 * NOTE: First time you deploy, you'll need to authorize the script.
 *       Click "Authorize access" and follow the prompts.
 */

// Change this to your Google Sheet ID (from the URL)
// https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit
const SHEET_ID = ''; // Leave empty to auto-create a new sheet

// Sheet name for student data
const SHEET_NAME = 'Quran Progress';

/**
 * Handle POST requests from the web app
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'sync') {
      return syncStudents(data.students, data.timestamp);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests (for testing)
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      message: 'Quran Tracker API is running. Use POST to sync data.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Sync students to Google Sheet
 */
function syncStudents(students, timestamp) {
  const sheet = getOrCreateSheet();

  // Parse timestamp
  const date = new Date(timestamp);
  const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const timeStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm:ss');

  // Add rows for each student
  students.forEach(student => {
    sheet.appendRow([
      dateStr,
      timeStr,
      student.name,
      student.surahName || `Surah ${student.surah}`,
      student.page
    ]);
  });

  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      message: `Synced ${students.length} students`,
      timestamp: timestamp
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get existing sheet or create new one
 */
function getOrCreateSheet() {
  let spreadsheet;

  if (SHEET_ID) {
    // Use existing spreadsheet
    spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  } else {
    // Create new spreadsheet in user's Drive
    const files = DriveApp.getFilesByName('Quran Tracker Data');
    if (files.hasNext()) {
      spreadsheet = SpreadsheetApp.open(files.next());
    } else {
      spreadsheet = SpreadsheetApp.create('Quran Tracker Data');
    }
  }

  // Get or create the sheet
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    // Add headers
    sheet.appendRow(['Date', 'Time', 'Student Name', 'Surah', 'Page']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Test function - run this to verify setup
 */
function testSync() {
  const testData = {
    action: 'sync',
    students: [
      { name: 'Test Student', surah: 1, surahName: 'Al-Fatihah', page: 1 }
    ],
    timestamp: new Date().toISOString()
  };

  const result = syncStudents(testData.students, testData.timestamp);
  Logger.log(result.getContent());
}

# Recitation Tracker v2: Setup (about 10 minutes)

The app runs as a Google Apps Script web app. All data lives in a Google Sheet that you own.

Files to paste into Apps Script:

- `Code.gs`: the server code, including storage, security and the parent links.
- `Index.html`: the app itself. Paste it as an HTML file named exactly **Index**.

## 1. Create the sheet and script

1. Create a new Google Sheet and name it `Recitation Tracker v2`.
2. In the sheet, open **Extensions → Apps Script**.
3. Delete the starter code in `Code.gs` and paste in the full contents of `Code.gs`.
4. Click **+ → HTML** and name the file `Index`. Delete its contents and paste in the full contents of `Index.html`.
5. Open **Project Settings (gear icon)** and set the **Time zone** to `(GMT+08:00) Kuala Lumpur`.
6. Click **Save**.

## 2. Run setup once

1. In the function dropdown, choose `setup` and click **Run**.
2. Authorise the script: pick your account, then **Advanced → Go to project (unsafe) → Allow**. The warning appears because this is your own unverified script.
3. Setup creates the `Students`, `Sessions` and `Tajweed` tabs and generates your **teacher key**, which is shown in the Execution log.

## 3. Deploy

1. Click **Deploy → New deployment → Select type: Web app**.
2. Set **Execute as** to **Me**.
3. Set **Who has access** to **Anyone**. Parents need this to open their links without a Google login.
4. Click **Deploy** and copy the **Web app URL**, which ends in `/exec`.
5. Go back to the sheet and reload it. A **Recitation Tracker** menu appears.
6. Choose **Recitation Tracker → Set web app URL…** and paste the URL.
7. Choose **Recitation Tracker → Show teacher link** and bookmark that link on your phone and laptop.

You can also open the plain `/exec` URL and type your teacher key. The browser remembers it.

## 4. Use it

- **Settings → + Add student**: add each student's full name and age.
- **Classes per month**: each student is set to **4**, **8** or **Custom** (1–31), under **Edit** on the student's page or when adding a student. When you change it, pick the month it starts from. Earlier months keep their old target, so past attendance percentages don't change. **Settings → Default classes per month** only sets the starting value for new students.
- **Months**: each student's page has a row of month chips (for example Sep 2026 ✓ and Oct 2026). **+ Add month** opens the next month, where you set its number of classes and an optional remark for parents. Use **✓ Mark completed** when a month is done, or **Edit month** to change its classes, status or remark. Removing a month only deletes the month entry. Its sessions stay.
- **From / To page**: each session records where the student started and finished. From defaults to the last session's To page. The month card and Page tab then show the month's start page, end page and pages covered.
- **+ Log session**: record the date, attendance (Present, Absent or Replacement), the page reached, the surah and optionally the ayat, plus any notes. The page defaults to the student's last stop. The app warns you if the surah/ayat doesn't match the page.
- **Student → Tajweed → Update assessment**: set a status (Not yet, Learning, Fair or Mastered) and a remark for each topic. Each save is dated, so the monthly view shows what changed.
- **Student → Parent link**: copy the link or send it by WhatsApp. It is read-only and shows that one child only. **Reset link** kills the old link immediately.
- **Attendance tab (top)**: shows the month register for all students.

## Updating the code later

After you paste new code, go to **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. The URL stays the same, so parent links keep working. Clicking "New deployment" instead would give you a new URL.

**Gotcha when editing Index.html:** HtmlService deletes everything after `//` or `/*` inside inline `<script>` blocks, including when they appear inside strings and template literals. For example, a literal `https://` inside a backtick string breaks the whole page, and you get a blank screen. Keep the script free of comments, and build URLs with the `SL` constant, as in `'https:' + SL + SL + 'example.com'`.

**Web app URL:** Apps Script's auto-detected URL can point at the wrong deployment. If parent links look wrong, use the sheet menu **Recitation Tracker → Set web app URL…** and paste the `/exec` URL from **Deploy → Manage deployments**.

## Moving over v1 data (optional)

Choose **Recitation Tracker → Import data from v1 tracker…** and paste the URL of your old `Quran Tracker Data` sheet. The import creates the missing students (Ariz, Raza, Rayyan) and one Present session per student per day, using the last page logged that day. Running it again won't create duplicates.

## Security model

- Every teacher action checks the teacher key on the server. The parent page cannot write anything.
- A parent link is a random 24-character token that returns one student's data only. Teacher notes are never sent to parents.
- If your teacher link leaks, use **Recitation Tracker → Reset teacher key**.
- Anyone who has a parent link can view that child's report, so send each link only to that child's parent.

# Smart Family Frame V1 Household Reliability Report

Date: 15 September 2026

## Decision

The software is ready for the next **real 2-hour Mac + Acer PM161Q B1 test**. Automated and isolated-browser checks are green. Physical monitor behavior, actual Mac sleep/restart, Chrome restart, and 2-hour/24-hour duration checks remain owner-run evidence and are not claimed here.

## Household reliability verified

- Exact Maid scenario: ₹3,000 calendar-day salary, one Leave, one Paid Leave and one Half Day produces ₹150 deduction and ₹2,850 payable.
- Working-day calculation counts only configured weekdays; weekends and Not Scheduled do not become unpaid absences.
- Custom deduction uses the configured ₹150/day; two unpaid leaves deduct ₹300.
- No-deduction mode preserves the full monthly salary despite Leave records.
- Milk scenario starting 5 Sep: 4 deliveries, 1 skipped, 2.5 litres at ₹70/litre produces ₹175; pre-start entries are excluded.
- Manual vegetable amounts total correctly and overwrite immediately by service/date.
- Start/end dates, partial months, month boundaries and year boundaries remain isolated.
- A 20-service, 600-entry month calculates correctly in the automated suite without responsiveness evidence suggesting optimization is needed.
- Payment totals now show paid and remaining amounts; partial and final payments are separate history records.
- Household payment reminders are ordinary Reminder records at 09:00 on the first of the next month; duplicate clicks reuse the existing matching reminder.
- Clear entry removes only one service/date record after a deliberate second action.

## Database, backup and offline evidence

- A real fake-IndexedDB v1 database containing photo metadata/blob, calendar event, note, reminder, schedule and settings was upgraded to v2. All V1 records survived and all four Household stores were added.
- Household backup validation and repository restore cover services, entries, payment history and service calculation settings. Legacy v1 backups restore with empty Household collections.
- Production PWA was built and served on isolated **localhost:4411**. Household data survived online reload. After stopping the server, the app reloaded from the service-worker cache, retained IndexedDB data, opened Household, and saved a new attendance entry offline.
- Real **localhost:4400** data was not opened, reset or modified.

## Defects found and fixed

1. Partial payment history was overwritten by the final monthly payment. Payments now append as separate transactions and the UI derives Paid/Partially Paid/Unpaid from their total.
2. Remaining payment was not visible. Month total, paid so far and remaining are now shown before recording a payment and on the Payments page.
3. Salary deduction was hidden behind a collapsed detail element. Rate, attendance categories, deduction, payable, status and plain-language calculation are now visible on the monthly card.
4. Daily entries could not be removed. Clear entry now uses a two-step inline action and deletes only that service/date record.
5. Repeated payment-reminder clicks could create duplicates. Matching reminders are now reused in the existing reminder store.
6. IndexedDB v1→v2 preservation lacked a true migration test. The suite now constructs and upgrades a populated v1 database.

## Known V1 limitations

- Paused is a current service-level state, not a history of dated pause ranges. Existing records remain; new quick entry is hidden while Paused or Stopped.
- Household reminders are payment shortcuts into the normal reminder system; general delivery/leave reminders are created in Reminders.
- Backups contain photo metadata, not photo binaries.
- Browser storage is origin-specific. Development, isolated QA and daily port 4400 data are separate.

## Manual checks still required

- Acer PM161Q B1 at 1920×1080 in Extended Display mode.
- Chrome full quit/restart using the normal port 4400 profile.
- Mac restart and real sleep/wake.
- Actual reminder overlay at 09:00 (logic/storage paths are automated; waiting for wall-clock delivery was not performed).
- 2-hour run, followed by the 24-hour soak.
- Manual restore should first be rehearsed in a safe non-4400 origin/profile before using real data.

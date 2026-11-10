# Household Real-World Test

Use the daily frame at **http://localhost:4400** in a normal Chrome window. Tick each box only after seeing the expected result.

## Staff and salary

- [ ] **Maid setup:** Add Maid, ₹3,000/month, start 1 September 2026, calendar-day deduction. Expected: the overview shows the rate, rule, and September payable.
- [ ] **Maid leave:** Record 3 Sep as Leave. Expected: unpaid leave increases by 1 and deduction increases by ₹100.
- [ ] **Paid leave:** Record 5 Sep as Paid Leave. Expected: paid leave increases but the deduction does not.
- [ ] **Half day:** Record 6 Sep as Half Day. Expected: unpaid leave becomes 1.5 days and total deduction becomes ₹150.
- [ ] **Salary calculation:** With Present on 1, 2 and 4 Sep plus the records above, expected payable is **₹2,850**. The visible calculation should show ₹3,000 ÷ 30, 1.5 unpaid days, ₹150 deduction, and ₹2,850 payable.

## Deliveries and variable costs

- [ ] **Milk delivered:** Add Milk Vendor, start 5 Sep, ₹70/litre, usual quantity 0.5 litre. Mark 5 and 6 Sep delivered. Expected: 2 deliveries and 1 litre.
- [ ] **Milk skipped:** Mark 7 Sep Not delivered. Expected: skipped becomes 1 and payable does not increase.
- [ ] **Milk quantity change:** Mark 8 Sep delivered with 1 litre and 9 Sep with 0.5 litre. Expected: 4 deliveries, 1 skipped, 2.5 litres, **₹175** payable.
- [ ] **Vegetable amount:** Add Vegetables with Manual amounts. Enter ₹120 on 10 Sep, ₹85 on 12 Sep and ₹160 on 15 Sep. Expected total: **₹365**.
- [ ] **Edit daily record:** Change 12 Sep vegetables from ₹85 to ₹100 and press Done. Expected total updates immediately to **₹380**.
- [ ] **Clear record:** Open 12 Sep, select Clear entry, then Confirm clear for Vegetables. Expected: only the 12 Sep vegetable entry disappears and total becomes **₹280**.

## Payments and history

- [ ] **Partial payment:** For the Maid, record ₹1,000. Expected: status Partially Paid, paid ₹1,000, remaining ₹1,850.
- [ ] **Full payment:** Record the remaining ₹1,850. Expected: status Paid and remaining ₹0.
- [ ] **Payment history:** Expected: both ₹1,000 and ₹1,850 payment records remain visible with their dates.
- [ ] **Month change:** Move September → October → September. Expected: September records remain; October has no copied daily records; service configuration remains.

## Date boundaries

- [ ] **Start date:** For a service starting 10 Sep, attempt to open an earlier date. Expected: that service is unavailable for entry and contributes no earlier payment.
- [ ] **End date:** End the service 20 Sep. Expected: it is unavailable after 20 Sep and no later records contribute.

## Protection and recovery

- [ ] **Backup:** Settings → Download backup. Expected: JSON downloads and includes household services, entries, payments and calculation settings. Photo files remain excluded.
- [ ] **Restore:** Restore that backup in a safe test origin/profile first. Expected: names, rates, dates, entries, payments, history and calculation rules return.
- [ ] **Offline:** After one online production load, disconnect safely or stop the local preview server. Reload. Expected: app and Household open and existing records remain available.
- [ ] **Chrome restart:** Quit normal Chrome completely, reopen http://localhost:4400. Expected: frame and Household data persist. Do not use Incognito.
- [ ] **Mac restart:** Restart the Mac, run the daily command, reopen http://localhost:4400. Expected: all IndexedDB data persists.

## Real monitor and soak

- [ ] Connect the Acer as an Extended Display at 1920×1080.
- [ ] Run the frame for 2 hours. Expected: slideshow, clock, reminders, scheduler, Household and Frame Mode remain responsive without errors.
- [ ] If the 2-hour check passes, continue to the separate 24-hour soak test.

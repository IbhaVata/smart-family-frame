# QA Checklist — Smart Digital Family Frame V1

Manual test plan. Run in Chrome on the Mac with the Acer PM161Q B1 attached as an extended
1920×1080 display. Daily frame address: http://localhost:4400 (`npm run frame`); development:
http://localhost:5400 (`npm run dev`). The two addresses keep separate data. Mark each row ☐ → ☑ when it passes; note the date/browser at the top.

Tester: ________  Date: ________  Browser: ________  Build: `npm run frame` / `npm run dev`

## Setup and start

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 1 | First launch | Open the app in a fresh browser profile (or after Reset). | "SMART FAMILY FRAME / Set up your frame" with name field prefilled "Living Room Frame" and START. | ☐ |
| 2 | Frame setup | Change the name to "Kitchen Frame", press START. | Management screen opens, sidebar shows "Kitchen Frame". Reload: setup is not shown again. | ☐ |
| 3 | Restart | Quit the browser, start it again, open the app. | Same data, no setup screen. | ☐ |
| 4 | Refresh | Press Cmd+R on any page. | Data, settings and frame name retained. | ☐ |

## Photos

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 5 | Add one photo | Photos → Add photos → pick one JPG. | Toast "Added 1 photo", tile appears with thumbnail. | ☐ |
| 6 | Add multiple photos | Add photos → select 5+ files (mix of JPG/PNG/WEBP). | All added, count in header updates, storage usage shown. | ☐ |
| 7 | Drag and drop | Drag image files from Finder onto the Photos page. | Outline highlights, photos are added. | ☐ |
| 8 | Unsupported file | Add a .gif, .heic or .txt file. | Red toast "… is not a supported image. Use JPG, PNG or WEBP." Nothing added. | ☐ |
| 9 | Corrupted photo | Rename a text file to `x.jpg` and add it. | Red toast "… looks corrupted and could not be opened." | ☐ |
| 10 | Favorite | Hover a tile → heart. Then Favorites filter. | Heart shown on tile; appears in Favorites filter. Unfavorite removes it. | ☐ |
| 11 | Lightbox | Click a tile; use arrows/←→; Esc. | Full image shown, navigation works, closes. | ☐ |
| 12 | Delete photo | Tile → trash → confirm. | Photo removed from grid and from the slideshow. | ☐ |
| 13 | Photos persist | Reload the page. | All photos still there (from IndexedDB). | ☐ |

## Slideshow and frame mode

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 14 | Enter frame mode | Press ENTER FRAME MODE. | Browser fullscreen on the monitor, no navigation/scrollbars, cursor hides after ~3 s. | ☐ |
| 15 | Slideshow | Wait through several intervals. | Photos change automatically with the chosen transition; no stretching; portrait photos centred with blurred background. | ☐ |
| 16 | Timer | Settings → Photo duration 5 s, then 30 s, then Custom 7 s. | Slideshow speed changes immediately each time; no double-changes. | ☐ |
| 17 | Pause/resume | Move mouse → pause button (or Space). | "PAUSED" badge, photo stops changing. Resume continues. | ☐ |
| 18 | Previous/next | Controls ‹ › or ← → keys. | Correct neighbour photo; timer restarts. | ☐ |
| 19 | Shuffle | Settings → Shuffle on. Watch a full cycle. | Random order, every photo shown once per cycle, no immediate repeat at loop boundary. Off → order of adding. | ☐ |
| 20 | Loop off | Settings → Loop off. | Slideshow stops on the last photo. | ☐ |
| 21 | Favorites only | Settings → Slideshow source: Favorites. | Only favorites shown; if none are favorited, all photos shown. | ☐ |
| 22 | 0 photos | Delete all photos, enter frame mode. | "No photos yet" message, app does not break. | ☐ |
| 23 | 1 photo | Keep exactly one photo. | It stays on screen, next/prev keep it, no flicker. | ☐ |
| 24 | Delete active photo | While frame mode shows photo X (note it), exit, delete X, re-enter (or delete from another tab). | Slideshow continues with the next photo; no blank screen. | ☐ |
| 25 | Transitions | Try Crossfade / Fade / None and durations. | Behaviour matches; None is instant. | ☐ |
| 26 | Long run | Leave frame mode running for several hours. | Still cycling, memory stable (Chrome Task Manager), no console errors. | ☐ |

## Clock and date

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 27 | Clock | Frame controls → Clock. | Large time, updates every minute (or second when enabled). | ☐ |
| 28 | 12/24 format | Settings → Time format. | "4:05 PM" vs "16:05" everywhere (clock, corner clock, calendar, reminders). | ☐ |
| 29 | Seconds | Settings → Show seconds on/off. | Seconds appear/disappear. | ☐ |
| 30 | Date | Settings → Show date off. | Weekday/date hidden on clock, corner clock, dashboard. | ☐ |
| 31 | Clock styles | Digital vs Minimal. | Visibly different styles. | ☐ |

## Calendar, notes, reminders

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 32 | Calendar create | Add event today 16:00–16:45 "Doctor". | Appears in Today, Upcoming, Month; frame Calendar mode shows it. | ☐ |
| 33 | Calendar edit | Edit title/time. | Changes visible after reload. | ☐ |
| 34 | Calendar delete | Edit → Delete → confirm. | Removed everywhere. | ☐ |
| 35 | Calendar validation | Empty title, end before start. | Inline errors, nothing saved. | ☐ |
| 36 | Notes create | Add pinned note "Dinner with family at 8 PM". | Note card; frame Notes mode shows it large and readable from 2–3 m. | ☐ |
| 37 | Notes edit / pin | Unpin, edit text, pin again. | Unpinned notes disappear from the frame. | ☐ |
| 38 | Notes window | Set "Show until" to yesterday. | Chip "Pinned (outside window)", not on the frame. | ☐ |
| 39 | Notes delete | Trash → confirm. | Removed. | ☐ |
| 40 | Reminder create | Add "Call Mom", today, time = now + 1 min, repeat Daily. | Row shows Next: Today at … | ☐ |
| 41 | Reminder trigger | Wait for the minute to arrive (in management or frame mode). | Large overlay with title, time, message and DISMISS. | ☐ |
| 42 | No re-fire | Dismiss, reload the app within 10 minutes. | Overlay does not appear again for that occurrence. | ☐ |
| 43 | Reminder disable | Toggle off. | Next occurrence not shown; overlay never appears. | ☐ |
| 44 | Reminder edit/delete | Change time; delete. | Behaves accordingly. | ☐ |
| 45 | Reminder preview | Eye icon. | Overlay appears immediately; Dismiss closes it. | ☐ |

## Scheduler

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 46 | Load examples | Schedule → Load example schedules. | 7 schedules; timeline coloured; "Active now" chip on the current one. | ☐ |
| 47 | Scheduler switch | Create a schedule Clock from now+1 min to now+3 min, priority 5. Enter frame mode. | Frame switches to Clock at the minute, back afterwards. | ☐ |
| 48 | Overlapping | Two overlapping schedules with different priorities. | Higher priority wins; list shows "Overridden by …" on the other. Same priority: shorter window wins. | ☐ |
| 49 | Cross-midnight | Night 23:00 → 06:30, every day. Set Mac clock to 23:30 then 01:00 then 06:29 then 06:30. | Night active at 23:30, 01:00, 06:29; not at 06:30. Timeline shows Night at both ends of the day. | ☐ |
| 50 | Disabled schedule | Toggle a schedule off. | It no longer affects the frame. | ☐ |
| 51 | Days of week | Weekdays-only schedule on a weekend. | Not active. | ☐ |
| 52 | Invalid schedule | Name empty / no days. | Inline error, not saved. | ☐ |
| 53 | Default mode | No active schedule; Settings → Default frame mode. | Frame shows the default mode. | ☐ |

## Modes

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 54 | Dashboard | Frame controls → Dashboard. | Large photo left, time/date, next event, pinned note right. | ☐ |
| 55 | Night mode | Settings → Night clock / Black screen; frame → Night. | Dim clock on black / fully black screen. | ☐ |
| 56 | Notes mode | Frame → Notes with 0, 1, 2, 4 pinned notes. | Graceful empty state; 1 note large; up to 4 in a grid. | ☐ |
| 57 | Calendar mode | With no events / many events. | "Nothing planned today"; long lists truncated with "+N more". | ☐ |

## Fullscreen and display

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 58 | Fullscreen | ENTER FRAME MODE on the Acer. | Fullscreen on that monitor. | ☐ |
| 59 | ESC | Press Esc. | Fullscreen exits and the management screen returns. | ☐ |
| 60 | Exit button | Mouse → Exit. | Same as Esc. | ☐ |
| 61 | 1920×1080 | Acer at native resolution. | Layout fills the screen, text readable from 2–3 m. | ☐ |
| 62 | 1366×768 | Chrome DevTools device toolbar or another monitor. | Same layout proportionally smaller, nothing cut off. | ☐ |
| 63 | 1280×800 | As above. | Same. | ☐ |
| 64 | 1920×1200 | As above. | Same. | ☐ |
| 65 | Wake lock | Leave frame mode for longer than the Mac display-sleep setting. | Screen stays on (Chrome). | ☐ |

## Data

| # | Test | Steps | Expected | Pass |
| --- | --- | --- | --- | --- |
| 66 | Offline mode | Use `npm run frame`, load once, then turn Wi-Fi off and reload. | App loads and all features work. No offline warning in frame mode. | ☐ |
| 67 | Backup | Settings → Download backup. | JSON file downloads; contains settings, events, notes, reminders, schedules, photo list; toast says photos not included. | ☐ |
| 68 | Restore valid | Change some data, then restore the file. | Confirmation shows counts; after restore data matches the backup; photos untouched. | ☐ |
| 69 | Restore invalid | Restore a random .json or .txt. | "This backup cannot be used" with reasons; nothing changed. | ☐ |
| 70 | Reset | Settings → RESET SMART FRAME → cancel; then confirm. | Cancel changes nothing. Confirm wipes everything and shows the setup screen. | ☐ |
| 71 | Demo data | Fresh frame → Load demo data. | Events, notes, reminders, schedules and 6 sample photos appear. | ☐ |
| 72 | Storage error | Chrome → Site settings → block data for localhost, reload. | Banner "Storage problem…", app still usable (memory), no blank page. | ☐ |
| 73 | Console | Open DevTools console during all of the above. | No errors (wake-lock warnings are acceptable if the browser denies it). | ☐ |

/** Local (device time zone) calendar dates. `toISOString()` is UTC, which is the wrong day for
 *  Indian users between 00:00 and 05:30 IST. */
export const localDateKey = (d = new Date()) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD
export const localMonthKey = (d = new Date()) => localDateKey(d).slice(0, 7);

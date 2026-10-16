# Activity calendar release checklist

This feature branch is for review. Do not merge or deploy until Firebase
permissions are coordinated. Main publishes the website through GitHub Pages.
No production data, historical summaries, or rules were changed by this review.

## Which rules to review

- `database.rules.calendar-proposed.json` is the compatible proposal. It preserves
  the production permissions supplied by Santi on 2026-10-16, and adds
  `activity/santi` and `activity/kristina`. No other grants are changed.
- `database.rules.json` is the older broad interim template, not a production
  snapshot. Do not publish it as part of this release.
- `database.rules.pinned.json` is the stricter future option. Santi's outdated
  laptop UID is corrected to `g6mCVuzg89VR2ttIFr308xtlplu2`; the phone remains
  `exa5g4kzTpdEuEHqqCw1HI5S7vC3`. Kristina's listed device IDs still need live
  confirmation before switching to this option. Do not publish it blindly.

The compatible proposal allows any signed-in anonymous account to read activity
summaries and write Kristina's activity, matching the current broad grants for
her slot. It also preserves the existing broad access to her sessions,
categories and notes, and the existing shared room/message reads. These are
not participant-only permissions. Restricting them is a separate coordinated
identity change; the pinned option demonstrates that policy.

## Summary contract

`activity/<person>/days/YYYY-MM-DD` holds integer total seconds and session
count, date, reporting timezone(s), coverage, update time, and hashed session
membership markers. It contains no categories, session timestamps or individual
session durations. Daily totals and counts still reveal daily work patterns.
Session push IDs encode creation time, so markers use SHA-256 instead of raw
IDs. The original session log remains the source of truth.

A session belongs entirely to its local **end date**, using its stored IANA
zone. A session across midnight is not split. New sessions have
`activityVersion: 1`, so failed summary writes can reconcile after reload or
reconnect. Older entries, including entries with a timezone but no version,
require explicit historical consent. Missing days remain unknown, not zero.
Timestamp corrections reconcile both dates in one owner transaction; retries
recompute absolute totals rather than applying deltas. Clock labels use the
server offset and refresh every 30 seconds.

Backfill previews the complete connected history snapshot. Publication verifies
that the reviewed snapshot is unchanged and writes the timezone reservation and
all reviewed days atomically. The chosen zone applies only to entries without
a stored zone. A later refresh needs a new preview. No history is published by
opening the page, previewing, or cancelling. Phones do not start this module.

Time management keeps original session fields and appends `timeEdits` snapshots
inside each existing `sessions/<person>/<id>` record. `activeEdit` chooses the
visible snapshot and `editVersion` prevents stale forms from overwriting newer
changes. Undo rewinds the pointer; removal is a restorable snapshot, not a
Firebase deletion. Manual additions carry a hidden base, so they can be undone
too. No new top-level permissions are needed. Removed shared sessions keep their
hashed membership marker with zero contribution, preserving backfill consent on
restore. Edits to older unshared records do not opt them into the calendar.
All clients should reload after release so they interpret correction snapshots.

The browser maintains full private history in memory. Reconciliation reads and
transacts over the owner's activity subtree, deliberately trading tiny writes
for atomic correctness at this two-person scale. The fake database tests auth
expressions and application behavior, not the Firebase transaction engine.

## Console steps before release

1. In the Firebase project's Realtime Database **Rules** tab, save a copy of
   the currently published rules and compare it with the supplied snapshot.
   Stop if the live grants have changed.
2. Review `database.rules.calendar-proposed.json`. In Rules Playground, verify
   both Santi UIDs can read/write `activity/santi`, another signed-in UID can
   read but cannot write it, and an unauthenticated request is denied. Confirm
   the deliberately broad Kristina grants and unchanged existing paths.
3. With explicit approval, publish that reviewed proposal in Firebase. This
   does not create activity records or publish history.
4. Authorize the PR merge separately, for example: “The calendar rules are
   published; merge the calendar PR into main.” Then rerun required checks,
   merge, and verify the Pages deployment and both participants' new totals.
5. Each person reviews and publishes their own earlier activity only if they
   want it shared. Historical backfill is not required for release.

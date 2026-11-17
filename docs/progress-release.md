# Personal Progress boards

Open **Progress** from Timer or Dashboard. Add columns for any project or area,
then add tasks by title. Open a column’s options to edit its description or
color, move it left or right, focus on the column, or archive it. Drag active
tasks to reorder them or move them across columns. Task details also have a
column picker and Move up / Move down actions for touch and keyboard use.

Use **Focus** on a task, or open **Working on…** on the timer. The picker shows
your two most recent choices in this browser. Search or browse for a task,
column, or category, or type a new standalone category. A task shows its
column on the timer. When a task or column is selected, you can set an
optional shared label for your partner’s live timer view. **Clear selection**
returns the timer to an unassigned session. Once a run starts, the target is
locked through pauses. Reset ends the run and allows a new target. Open session
notes from the task’s history, the column’s column-only history, or the
Dashboard’s Time management list.
The selected target stays in place for another run while it remains available.

**Dashboard → Category breakdown** includes standalone categories and
Progress columns. A task session contributes to its recorded column and
appears in that column’s task breakdown. Expand a column to see its tasks
and any time logged directly to it. The five largest categories appear first,
and you can expand the full list for Today, This week, or All time. The
partner’s lifetime focus time appears in **Activity**.

Select **Edit** beside the period controls to rename a category or transfer
all of its logged sessions to another category. **Undo transfer** reverses
the latest transfer on that page. Transfers between Progress columns keep
task assignments. Transfers to standalone categories clear those assignments
from the affected sessions, and Undo restores them. Transferring history
keeps the source category available for future sessions.

In **Dashboard → Time management → Manage logged time**, use the focus picker
to filter the session list by task, column, or category. Edit a matching
session’s minutes or assignment, or assign a task when adding missed work.
Undo restores the previous duration and assignment together.

Completing a task moves it under **Completed**. Open it there to see its history
or restore it. **Archive & Trash** holds hidden columns and deliberately removed
tasks. Restoring a column brings back its tasks. Moving a task keeps its
lifetime history and leaves past time in the column originally recorded.

## How it fits the timer

The site is a static HTML, CSS and JavaScript app published by GitHub Pages.
Firebase anonymous authentication gives each browser a UID. The URL role
chooses the timer slot and the database rules decide what the UID can access.

Each participant has one private `progress/<role>/board` with stable column and
task IDs. Board changes are transactions over that board. Private
`progress/<role>/links/<sessionId>` records hold the original column, optional
task ID, and optional session note. Unassigned runs can have a note without a
target. The existing `sessions/<role>/<sessionId>`
record supplies the duration and end date, including edits and removals from
Time management. Progress and the original stats read the same durations.
A stable run ID and a local pending queue allow retries of both writes after a
refresh. The private link can arrive after the original session during a sync
failure. Retrying leaves existing notes and time corrections intact.

The board uses the browser’s local Monday-to-Sunday week and counts a session
on its recorded end date, as the Dashboard does. The timer still excludes
paused time and keeps its existing five-second minimum. Firebase timestamps a
run on its first successful session write, so an offline run’s end date is the
date it first syncs. Shared presence and activity carry their existing fields.

## Release checklist

1. Compare the Firebase console’s live Realtime Database rules with
   [the Progress proposal](../database.rules.progress-proposed.json). The file
   is based on the repository’s calendar compatibility proposal. Carry over
   any newer production grants for the existing features and ensure neither
   the root nor the parents of the new private paths grant access broadly.
2. Publish the reviewed rules. Before enabling either person, collect the
   verified anonymous UIDs for every browser that should access that person’s
   board or session history. Use the UID shown in Dashboard, on the phone, or
   in Progress’s access message on the **published** origin. A UID from a
   local preview, another browser profile, or a different device is distinct.
3. As a Firebase administrator, add each verified UID under
   `progressAccess/devices/<uid>` with string value `"santi"` or `"kristina"`.
   Set `progressAccess/enabled/<role>` to boolean `true` for the enrolled
   person. Enable each role once all its existing history users are enrolled.
   On enablement the same allowlist protects that role’s canonical session
   log, so older clients still work on enrolled browsers and unlisted
   browsers lose access to that history. Clients cannot modify the registry.
   When enrolling a new browser, also check that the existing timer, category,
   and shared activity rules authorize its UID for that role.
4. In Rules Playground or the local Realtime Database emulator, verify
   owner read/write, denial for the peer and an unknown or signed-out UID,
   denial for browser writes to the enrollment registry, and access for all
   enrolled session-logging browsers. Check shared room and activity access.
5. Publish the frontend through the repository’s GitHub Pages workflow
   (source branch `main`). Reload the published app on each enrolled browser
   and verify its board opens and a short targeted session appears in the
   board and Dashboard. Use distinct browser profiles to verify the two
   participants’ access.

The phone can manage its board and view history. Timer controls and target
selection remain on the device running the timer. New or reset browser
profiles need enrollment. A durable sign-in method could simplify device
enrollment later. Board changes require a connection, and native drag-and-drop
is aimed at desktop. If a browser clears local data before syncing a finished
run, its pending write is lost. Older sessions can be assigned to Progress
through Time management. The timer still has one local run state per role and browser
profile. Run it from one tab per profile.

Run the browser and unit suite with `npm test`. With a local Realtime Database
emulator running on port 9000, run
`node --test tests/progress-rules.emulator.js` to check the actual Firebase
authorization engine. Set `PROGRESS_EMULATOR_PORT` to override the port.
The test resets its dedicated `demo-sft-progress-test` namespace.

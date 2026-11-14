# Shared Focus Timer

A focus timer for two people, Santi and Kristina. Each runs their own timer;
a corner pill shows whether the other one is working right now. It also has
stats, categories, a private note, and messages that stay sealed until the
other person's session ends.

**Open it:** https://santi6117.github.io/shared-focus-timer/?me=santi
(Kristina uses `?me=kristina`. The `?me=` part is only needed the first
time in each browser.)

Double-clicking `index.html` won't work. Browsers refuse to run the app's
JavaScript from a file opened that way, so it has to be the link above.

## How the code is organised

```
index.html                 the page's markup, nothing else
css/
  tokens.css               every colour, radius and background knob
  background.css           the background layer and the swirl wallpaper
  wallpapers/              one file per unlockable wallpaper
  layout.css               the centre timer card
  widgets.css              the corner widgets
js/
  main.js                  startup: what runs, in what order
  config.js                Firebase project settings, the two names
  identity.js              which person this browser is (?me=)
  device.js                laptop (runs the timer) or phone (a remote)
  firebase.js              sign-in, database paths, server clock
  timer.js                 your timer: state, controls, crash recovery
  timer-view.js            draws the timer card (laptop)
  remote-view.js           draws the timer card read-only (phone)
  own-room.js              your published state: running? status?
  presence.js              the other person's pill, top right
  status.js                your status ("eating") when not focusing
  sessions.js              the log of finished sessions
  categories.js            the "working on…" box and chips
  stats.js                 the two bottom-left widgets
  note.js                  the bottom-right note
  messages.js              held messages, top left
  alert.js                 chime, notification, blinking tab title
  cottage.js               dashboard cottage, saved decor and earned-hour milestones
  wallpapers.js            which wallpaper shows; the picker
  swirl.js                 bounded canvas for Swirl's moving colours
  sky.js                   Paper hills' time-of-day sky
  lib/                     pure logic with no page or database in it,
                           which is what the unit tests check directly
tests/                     automated tests (see below)
docs/
  roadmap.md               what this project is, every decision and why
  sessions/                one short log per working session
database.rules*.json       rules templates and release proposals
```

`timer.js` announces what happens ("started", "ended", "log this session")
and the other modules listen. The session logger records completed runs and
Progress reads the session log to calculate task and column totals.

## How changes get made

1. Run the affected tests while iterating. For example, a Progress change can
   start with `TZ=America/New_York node --test tests/progress.test.js`. Add
   `--test-name-pattern='pattern'` before the file to focus on one behavior.
2. Run `npm test` on the final change before committing and pushing. If that
   exact commit already passed locally, reuse the result when publishing it.
3. Push to `main` when ready to publish. GitHub Pages serves the static files
   directly. Check the live page or the changed assets after deployment.

## Tests

`npm test` runs the full suite serially. The pure tests cover timer math,
timezones, session edits, and Firebase rules templates. The browser tests
exercise the real page with an in-memory Firebase substitute, including
timer recovery, sharing, calendar, Progress, and time management.

The browser harness controls page time. Jump to the target time when the
assertion only needs the final state. Replay clock callbacks when checking
intermediate behavior such as chime cadence or retries. Title flashing
also uses a real browser worker, so those tests still observe its real beats.

`npm run serve` previews the site locally at http://localhost:8080/?me=santi.
It still talks to the real Firebase database.

## Progress

Each person can organize tasks in a private board and link existing timer
sessions to a task or a column. See the [Progress guide and Firebase release
checklist](docs/progress-release.md) for setup and device enrollment.

## Security rules

Published Realtime Database rules are managed in the Firebase console. The
rules files in this repository are templates and release proposals. Use the
[activity calendar release notes](docs/firebase-calendar-release.md) and the
[Progress release checklist](docs/progress-release.md) to review the relevant
proposal against the live rules.

## Cottage

The laptop Dashboard includes a cottage below Time management. Personal lifetime
focus hours unlock the house at 100h and fourteen decorations through 200h.
Click its door to go inside and use Decorate to place or put away earned items.
Decoration choices and earned milestones are saved per person in this browser;
corrections do not remove already earned rewards. The phone remains a remote.

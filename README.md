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

Claude does the work in a session with this repo attached:

1. edits the files
2. runs the tests (`npm test`) and fixes anything that breaks
3. commits with a message saying what changed and why
4. pushes to `main`, and GitHub Pages redeploys the site within a minute
   or two

Git history replaces the old `index-pre-*-backup.html` files. Any earlier
version can be brought back from there.

## Tests

`npm test` runs two sets:

- **`tests/lib.test.js`** checks the pure logic: time formatting, week
  boundaries across daylight-saving changes, crash-recovery maths, category
  totals and message states.
- **`tests/app.test.js`** opens the real page in a headless Chrome with
  Firebase swapped for an in-memory fake (`tests/helpers/`), then clicks
  through every behaviour earlier sessions checked by hand: countdown,
  pause/resume, logging exactly once, crash recovery, categories, presence,
  stats, the note, messages, and the end-of-session alert. The test clock is
  controlled, so a 25-minute session takes milliseconds.

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

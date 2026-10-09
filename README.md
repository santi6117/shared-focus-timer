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
  wallpapers.js            which wallpaper shows; the picker
  swirl.js                 bounded canvas for Swirl's moving colours
  sky.js                   Paper hills' time-of-day sky
  lib/                     pure logic with no page or database in it,
                           which is what the unit tests check directly
tests/                     automated tests (see below)
docs/
  roadmap.md               what this project is, every decision and why
  sessions/                one short log per working session
database.rules.json        the security rules to use now
database.rules.pinned.json the final rules, once both UIDs are known
```

`timer.js` announces what happens ("started", "ended", "log this session")
and the other modules listen. It never calls into them. So adding a feature
means adding a listener; it never means editing the timer.

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

## Security rules

The rules live in the Firebase console, not in this repo, so a change here
does nothing until it's pasted there:
**Firebase console → Realtime Database → Rules → paste → Publish.**

- **`database.rules.json` should go in now.** Anyone signed in (which the app
  does silently) can read and write the five known paths, and nobody else can
  do anything.
- **`database.rules.pinned.json` goes in once both anonymous UIDs are known.**
  It locks each person's data to their own laptop and phone. Each UID is
  shown in the bottom-right corner of the page. Replace `SANTI_UID`,
  `SANTI_PHONE_UID`, `KRISTINA_UID` and `KRISTINA_PHONE_UID`, then paste. Collect the UIDs from the GitHub Pages address, not a local
  file: a new address means a new UID.

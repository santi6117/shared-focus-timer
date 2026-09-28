# Working on this repo

Read `docs/roadmap.md` first (§2 is how Santi wants to work), then the
newest file in `docs/sessions/`.

## Rules

- **Run `npm test` before every commit, and only commit when it passes.**
  (One-time setup: `npm install`. Chromium is preinstalled in Claude's cloud
  environment; if it can't be found, set `PW_CHROMIUM` to its path.)
- **New behaviour gets a test in the same commit.** Test through the page
  (element text, classes, database writes via `window.__fakeDb`) rather than
  internal function names, so the tests survive refactors. If the app starts
  using a Firebase API the fake doesn't have, extend
  `tests/helpers/fake-firebase.js`.
- **One change per commit.** The message says what changed and why. The
  commit log is the project history, so code comments describe the code as
  it is now. No "added on <date>" or "the old version did X" in comments.
- **Comments explain shape and intent**, and name the rejected alternative
  wherever a real decision was made. Every file opens with a header saying
  what it's for. Don't annotate syntax.
- **No build step.** The site is static files served by GitHub Pages. npm
  exists only for the tests; nothing the page loads may depend on it.
- **Keep `timer.js` free of other features.** Features listen to its events
  (`change`, `start`, `reset`, `end`, `session`); the timer never calls them.
  Pure logic goes in `js/lib/` and gets a unit test.
- **Push to `main` only when green.** Pages deploys `main` straight to the
  live site both people use.

## End of a session

Add `docs/sessions/YYYY-MM-DD.md` (format in roadmap §8), and update the
roadmap if a decision changed. Commit both.

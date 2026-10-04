# Shared Focus Timer — Project Roadmap

**Read this file first, at the start of every session.** It is written for an
assistant starting with zero context about this project. Then read the newest
file in `docs/sessions/` to find out where things actually left off, and
`CLAUDE.md` for the rules of working in this repo.

> **Status as of 2026-10-04.** v1 feature work was completed 2026-09-07.
> Post-v1 changes since, each with its own session log:
>
> - 2026-09-10: crash/reboot recovery fix
> - 2026-09-11: the note widget (§6e) and the heart
> - 2026-09-11 (b): the end-of-session alert (§6f)
> - 2026-09-11 (c): held messages (§6g)
> - 2026-09-28: moved into git with an automated test suite, split into
>   modules, and the title flash made continuous (§6f)
> - 2026-10-02: status (§6h) and phone remote mode (§6i)
> - 2026-10-03: unlockable wallpapers (§6j); the split widget flips to the
>   other person's day (§6d)
> - 2026-10-04: stopwatch mode (§6k)
>
> On 2026-10-02 Santi opened a second round of features: status, a good
> phone experience, and unlockable wallpapers (moved out of §7). Order and
> remaining work are in §9.

---

## 1. What this is

A single-page website: a focus timer for two people (Santi and his girlfriend
Kristina). The main mechanic is an **individual timer**: each person runs
their own, independently (their own duration, their own start/pause). A
**small corner widget** shows whether the other person's timer is currently
running, and if so their live remaining time and what they're working on.
This is the presence indicator and the headline feature: she can tell he's
working without him telling her, and vice versa.

When their timer isn't running, the widget shows their **status** if they've
set one ("eating · 40m ago"), otherwise "not working". A paused timer, a
closed tab and an offline laptop all look the same; the status is what says
more (§5a, §6h).

**Timers run on laptops only.** A phone is a remote: it shows your laptop's
timer read-only, sets your status, and shows the other person (§6i).

A **synced mode** is a possible later opt-in: when toggled on, starting your
timer also starts theirs, same duration, in lockstep. Not designed, not
requested, not part of v1 (§6).

This project **replaces two earlier ideas**:

- "FocusBuddy": a focus timer plus a cozy shared-home decoration game for
  long-distance couples. Dropped as too much scope and too much art.
- A separate solo work-tracker app (ASCII-themed desktop window). Its
  work-logging purpose is now covered by this project's stat tracker.

Do not suggest reviving either as a separate build.

---

## 2. How to work with Santi

These are his explicit instructions. They are requirements, not preferences.
This section deliberately replaces an earlier teaching-oriented split (he
wrote all the logic, each stage preceded by a concept lesson), which was
making the project too slow. Do not drift back toward it.

### Role
You build; he oversees. He is not trying to learn this code line by line. His
goal is to understand **how the pieces fit together**, keep enough familiarity
to judge quality, and stay the person making the calls. He wants the project
to run with as little involvement from him as possible while staying high
quality. Explain the architecture. Don't teach.

### Division of labor
- **Assistant writes all of the code**, runs the tests, commits and pushes.
- **Santi reads and asks questions**, and makes the product decisions. If he
  wants to take something over he'll say so; don't offer pieces to him
  unprompted.

### Explaining — two channels, both required
1. **In conversation, after building.** Cover what each file and function is
   responsible for, what talks to what, and which choices were judgment calls
   (with the alternative and why it lost).
2. **In the code itself.** Comments are a deliverable. Every file opens with a
   header comment saying what it's for. Every non-obvious function gets a
   comment saying what it does and why it exists. Anywhere a real decision
   was made, the comment names the alternative. He should be able to open a
   file cold in three weeks and find his way around.

Comments explain **shape and intent, not syntax**, and describe the code as
it is now. History (what changed, when, what it replaced) goes in commit
messages and session logs.

### What not to do
- No concept lessons before implementation.
- No comprehension checks, quizzes, exercises, or "does that make sense?"
- No language or syntax tutorials.
- Anything he should actually decide gets framed as a decision (tradeoff,
  recommendation, done), not as a lesson.
- Don't open with a status recap; lead with substance. Bullets over long
  paragraphs for new concepts.

### Tone
Warm and friendly, still concise outside of the explanation sections.
Collaborator warmth, not tutor encouragement; no praise for understanding
things.

### Calibration
- Mathematics and abstraction: **no hand-holding.** Math degree from Oakland
  University, AI minor; Oxford MFoCS MSc from October 2026; graph theory
  research on distance-restricted cop numbers.
- Software tooling, infra, deployment: **he's a beginner.** Never used a
  terminal, no server/API/database experience. Don't assume knowledge, but
  the fix is a line of "what this is" alongside doing it, not a tutorial.

### Practical
- Give concrete stopping conditions and definitions of done rather than
  open-ended direction. Ignition is harder for him than sustaining.
- **He scopes tightly and says so.** When he asks to hold a feature for its
  own session, hold it.
- **He gives good design feedback from using the thing.** The background's
  second pass (§6c) came from him noticing it cycled in place rather than
  travelling, which was an exactly correct read of a structural flaw. Take
  his "it feels like X" reports as diagnostic, not vague.
- When a request is ambiguous, ask before starting. When his approach has a
  real flaw, answer first, then flag it.
- **The limits in this file are guidance, not a cage** (his words,
  2026-10-02: the project is "entirely vibecoded"). Where best practice or
  your own judgment says otherwise, do the better thing, keeping it
  accessible to him, and record the decision here.

---

## 3. Starting point and constraints

Assessed at project start (Aug 2026):

- **Prior projects:** a tutoring site (GitHub Pages, HTML/CSS) and a Cops and
  Robbers graph game (single HTML file, SVG + JavaScript, BFS-based AI). Both
  front-end only.
- **Terminal:** has never really used one.
- **Servers / APIs / databases:** no experience.
- **Time budget:** 2–3 hours per week.
- **Oxford move-in October 1, 2026.** After that his time is shorter still,
  which is why the project is set up to be maintained by an assistant with
  minimal involvement from him.

---

## 4. Architecture — decisions made and why

### Stack: plain HTML/CSS/JavaScript, no build step

Static files served by **GitHub Pages** from `main` of
`santi6117/shared-focus-timer`. No bundler, no React, no TypeScript.

- **ES modules** (`<script type="module">`), one file per feature. Chosen on
  2026-09-28 over one big file (its single shared scope made declaration
  order load-bearing, the cause of the 2026-09-10 crash) and over plain
  script files (which share one global namespace and keep some of that
  fragility). Cost: the page no longer runs from a double-clicked file,
  since browsers block modules on `file://`. It is always opened via the
  Pages URL, which notifications needed anyway.
- **npm is used only for the test suite**, which is assistant tooling; Santi
  never runs it and the site never depends on it.
- **Firebase loads as the "compat" SDK via plain `<script>` tags**, which
  define a global `firebase`. `js/firebase.js` is the only module that touches
  that global. Kept over the modular SDK to avoid changing every database
  call for no user-facing gain.

### Module shape

- `js/main.js` owns startup order: sign in → load timer state → every
  feature subscribes → crash recovery → render loop. A phone (`js/device.js`)
  skips everything that runs or publishes a timer.
- `js/own-room.js` answers "is my timer running?" for both: the local timer
  on a laptop, the published `room/<me>` on a phone.
- `js/timer.js` owns the timer and publishes it to `room/<me>`. It announces
  transitions as events (`change`, `start`, `reset`, `end`, `session`), and
  features listen. The timer never calls into features by name. A listener
  that throws is isolated by `EventTarget` and cannot break the timer.
- `js/lib/` holds pure logic (no DOM, no Firebase), unit-tested directly.
- A 250ms render loop draws only what changes with time: the countdown and
  the other person's countdown. Everything else re-renders on events.

### Real-time sync: Firebase Realtime Database

Santi's own first model was a shared file in the cloud that both people write
to and read from, where each browser calculates the other's remaining time
locally. **What was right about it** (and it's the central insight): what
crosses the network is not the ticking countdown but the *event*, "started at
time T with R left." Each browser computes `remaining = R - (now - T)`
locally.

**Three things that broke it:** a file can't tell you it changed (polling);
front-end code can't keep a write token secret; two laptops' clocks disagree.
Firebase Realtime Database solves all three: WebSocket push, browser-safe
writes governed by security rules, and a server timestamp primitive.
Rejected: Supabase, which costs tables, rows and RLS policies as day-one
concepts.

### Identity and access: anonymous auth, slot chosen by URL

- **Firebase Anonymous Auth**, signed in silently on page load. Each browser
  gets a stable UID.
- **Which slot you occupy comes from `?me=santi` or `?me=kristina`**,
  persisted to `localStorage`, so it's needed once per browser.
- **Security rules** (`database.rules.json`, `database.rules.pinned.json`):
  interim rules require sign-in; the final rules pin each slot to one UID,
  making the no-cross-writes rule server-enforced.

Cost: clearing site data or a new laptop mints a new UID and the pinned rules
need a one-line edit. Each person has **two** UIDs in the pinned rules,
laptop and phone. Moving origin (file:// → Pages) also mints new UIDs and
wipes localStorage, which is why UIDs are collected only from the Pages URL.

### Shared state — the entire data model

```
room/<person>        { running, mode, startedAt, remainingAtStart, category,
                       status: { text, setAt },
                       today: { until, seconds, top: [{label, color, seconds}],
                                restCount, restSeconds } }
sessions/<person>/<pushId>  { endedAt, elapsedSeconds, categoryKey }
categories/<person>/<key>   { label, color, lastUsedAt }
notes/<person>       { text, updatedAt }
messages/<recipient> { note: { text, sentAt }, read: <sentAt> }
```

- `startedAt` is a **server** timestamp in ms. `remainingAtStart` is in
  **seconds**: how much was left *as of `startedAt`*, not the fixed session
  length. Publishing the fixed length broke pause/resume for the peer.
- **`mode` is `"countdown"` or `"stopwatch"`** (missing means countdown).
  A stopwatch's run length is always the two-hour cap, so it isn't
  published; the reader shows `cap - remaining` (§6k).
- **`room/<person>.category` holds the LABEL, not the key**, so the peer can
  render it without reading that person's vocabulary.
- **A mid-session category change uses `update()`, not `set()`.** `set()`
  would re-stamp `startedAt` and restart the peer's view of the countdown.
- **The timer publishes with `update()`, not `set()`**, so it never wipes
  the `status` a phone set. It writes every timer field each time.
- **`today` is a published summary**, not read access to the other
  person's `sessions/`: only today's totals leave, already labelled, with
  `until` (the owner's next local midnight) so the reader can tell it's
  stale without either clock agreeing on a timezone (§6d).
- **`status` lives in `room/`**, not its own subtree: the presence listener
  already reads `room/`, and the live rules already allow it.
- **No heartbeat field in `room/`.** Presence is derived from `running`, and
  `onDisconnect()` clears it (below).
- **`sessions/` is append-only**, and a sibling of `room/` so the presence
  listener never re-downloads history.
- **`categories/` is the vocabulary; `sessions/` stores only the key**
  (`label.trim().toLowerCase()`, whitespace collapsed). A rename edits one
  field and every past session follows.
- **Each person writes only their own subtrees**, with **one deliberate
  exception: `messages/`**, keyed by recipient, so the sender writes
  `messages/<them>/note` and the recipient writes `messages/<me>/read`. Two
  separate children so the rules can govern them separately (§6g).
- **Synced mode (deferred) would be a second exception**: starting your timer
  would write a start event into the other person's entry. Not designed.

Resist any change that grows this further.

### Reading the peer's clock: `.info/serverTimeOffset`

The pill computes the peer's remaining time as `remainingAtStart -
(myNow - theirStartedAt)`. `theirStartedAt` is server time, so `myNow` must
be too: `Date.now()` plus Firebase's live client-vs-server offset. Your own
timer never needs this, since both sides of its maths use your own clock.

### Disconnect handling: `onDisconnect()`, not a heartbeat

At connect time the app tells the Firebase server: *when this connection
drops, set `room/<me>.running = false`.* Works for a closed tab, a slept
laptop and lost wifi. Re-armed on every reconnect, since the instruction is
bound to one connection. Accepted edge case: a brief network hiccup
mid-session flips the other person's view to "not working" until the
connection returns; your own timer is unaffected.

---

## 5a. Decided behavior

Settled 2026-09-05, extended since. These are answers, not open questions.
Don't re-ask them.

**Duration**
- Free-set to any length. No fixed 25/5 presets.
- **Cannot be changed while running.** Pause, change, start.
- Changing it while paused **logs whatever elapsed time is pending** first.

**Pause**
- Pause preserves remaining time and resumes from where it stopped.

**Stopwatch** (§6k)
- A switch beside the minutes box picks countdown or stopwatch. Locked while running;
  switching while paused logs the pending time first.
- Counts up from 0:00, `h:mm:ss` past the hour. **Stops itself at 2 hours**,
  logs 2 hours, and fires the same end alert. Holds at 2:00:00 in the
  accent colour (no `+` count-up).
- The other person's pill and your phone count up too, marked ↑.

**Reaching zero**
- The run **stops**: `running` goes false, so the peer sees "not working."
- The session **auto-logs** at the full duration.
- The display **counts upward** past zero in the accent colour, prefixed `+`.
- The end-of-session alert fires (§6f).
- Start out of the count-up rolls straight into a fresh session; neither
  Start nor Reset double-logs.

**Categories**
- **One category per session, assigned when it logs.** Switching mid-session
  moves the whole block.
- **Editable any time**, mid-session included.
- **An empty category logs as `uncategorized`** and writes no vocabulary
  entry.
- **Established labels are stable.** Typing "thesis" over an existing
  "Thesis" snaps back to the stored spelling.

**Closing the tab mid-session**
- The other person's view clears immediately to "not working."

**Presence**
- Running: "Kristina — focusing on Thesis · 24:00".
- Not running, status set: "Kristina — eating · 40m ago".
- Otherwise: "not working." No "paused on Thesis" state.

---

## 5. Milestone 1 — done except for the Kristina-dependent items

Definition of done: two people, two laptops, each with their own working
timer, each visible to the other via the corner widget.

- **Stage 0 (sync hello-world):** done 2026-09-02.
- **Stage 1 (local timer):** done 2026-09-03.
- **Stage 2 (shared tree + presence):** built 2026-09-05/07; verified in two
  windows on one machine.

**Still open:**
1. **A real two-device test** with Kristina's laptop.
2. **The pinned security rules**, which need both real anonymous UIDs, taken
   from the Pages URL (§4). Five clauses, one asymmetric: see
   `database.rules.pinned.json`. The interim `database.rules.json` should be
   live before that.

Both need Kristina. No timeline, and nothing built since needs redoing
because of the wait.

---

## 6. Milestone 2 — COMPLETE, plus post-v1 additions

### 6a. Permanent stat tracker

Total focused time by day, week and lifetime, from the append-only log.

- **What counts as a session:** logged on Reset, on reaching zero, on a
  duration change with pending time, and on recovery from an interrupted run
  (elapsed-to-last-heartbeat). Always the time *actually* elapsed.
- **Logged exactly once**, guarded by the timer's `logged` flag.
- **5-second noise floor.**
- **Elapsed is clamped to `[0, duration]`.**
- **Display:** a collapsed `Today` chip, bottom-left, expanding into Today /
  This week / All time plus a session count.
- **Week starts Monday, local time**, computed from the calendar (DST-safe).
- **Totals are summed client-side from the whole log**, not kept as rollup
  counters in the database.
- **Session writes wait for the category vocabulary to load** (5s backstop),
  so a session logged before Firebase answers can't repaint an established
  category's label or colour.

### 6b. UI

**"Warm & cozy"**: soft paper tones, rounded cards, gentle shadows, one
terracotta accent. Timer centred, everything else in corners. Every colour
and radius lives in `css/tokens.css`.

### 6c. Animated background

A smeared, grainy rainbow that swirls continuously. Pure CSS in
`css/background.css`; the file's comments carry the full reasoning. Knobs in
`css/tokens.css`: `--bg-base` (#f0c9a2), `--bg-cycle` (30s, Santi's tuned
value), `--bg-tour` (150s), `--bg-veil` (0.5).

**Load-bearing, don't undo:** no `filter: blur()`; gradients end at the same
hex with alpha `00`, never `transparent`; `.b1`–`.b8` stay in spectral
order; the cool half laps 18% slower; radii vary 24–46vmax; `linear` lap
timing; `prefers-reduced-motion` freezes it. Never use
`animation-direction: alternate` for travel (it makes a pendulum).

### 6d. Category tracking

- **Derived, not declared.** A free-text input plus the five most recent
  chips (hidden below two categories).
- **Colours auto-assign** from an eight-hue palette on first use.
- **Breakdown widget** beside the stats chip: top three for a period
  (Today / This week / All time, default This week) above a proportion bar
  that includes a neutral remainder, so shares always sum to the real total.
- **Kristina sees the label live** in the presence pill.
- **Flips to the other person's day** (2026-10-03, Santi's call). A
  `You / Kristina` pill beside the period pill. Theirs is **today only**,
  from the summary they publish (`js/shared-today.js`), so the period pill
  locks to Today while it shows. Published by each laptop on any session or
  category change, debounced a second so the load burst writes once, and
  skipped when unchanged. Phones publish nothing. Opens on your own split
  each load. Kristina agreed to her day being visible.

### 6e. Note (2026-09-11)

Bottom-right free-text note, private to each person, in `notes/<person>`.
Free text rather than a to-do list. Writes debounced 800ms. localStorage
mirror so it paints instantly. A remote edit from the other laptop is applied
only when the box isn't focused and no save is pending.

### 6f. End-of-session alert (2026-09-11, flash changed 2026-09-28)

Three signals at the zero crossing, chosen because they fail differently:

| Signal | Works when | Fails when |
|---|---|---|
| Chime (WebAudio, synthesised) | tab buried | volume down |
| OS notification | volume down | no permission, or `file://` |
| Tab-title blink | no permission, no audio | not looking at the tab bar |

- **Chime once; notification once** (tagged so a later one replaces it).
- **The title blinks every second with no time limit** until the person is
  back: returning to the tab/window, any click or keypress on the page, or
  Start/Reset. Santi's call on 2026-09-28, reversing the earlier one-shot
  flash. Driven by a Web Worker, because a hidden tab's own timers are
  slowed to once a minute after five minutes.
- A single long `setTimeout` aimed at zero wakes the page on time in a
  hidden tab; it only calls `tick()`, so zero still has one code path.
- Every alert path degrades to silence on failure.

### 6g. Held messages (2026-09-11)

A note for the other person that stays **sealed while their timer runs**.
Top-left envelope widget.

- Schema and the cross-write: §4. `read` stores the message's own `sentAt`,
  so unread is an exact equality check.
- **The gate is `running` and nothing else.**
- Chip: `Message` → `message when you're done` (sealed) → `1 message — read
  it`.
- **The read receipt is written when the text is on screen** (panel open,
  unsealed).
- **One slot per direction, newest wins**; the compose box is prefilled with
  whatever is still unread, and clears once it's read.
- **Restraint is the feature**: no sound, flash or notification of its own.
  The end-of-session notification mentions a waiting message.
- Sealing is a client-side courtesy, not a security boundary.

### 6h. Status (2026-10-02)

What you're up to when you're not focusing, shown in the other person's
pill in place of "not working".

- Stored at `room/<me>/status` as `{ text, setAt }` (server timestamp).
- **Free text plus presets** (eating, sleeping, out with friends, errands,
  in lectures). Presets show while the box has focus on a laptop, always on
  a phone. Normalised: trimmed, whitespace collapsed, 40 characters.
- **Shown with its age**, coarse ("just now", "40m ago", "14h ago").
  No expiry: the age makes a stale status obvious.
- **Cleared by Start** on the laptop. Hidden while the timer runs.
- **Not cleared on disconnect**, so a status set from the phone stays up
  after the phone locks.

### 6i. Phone remote mode (2026-10-02)

Timers run on laptops only (Santi's call: it keeps the phone out of a
focus session). A phone is a remote.

- **Detected from the hardware** (touch, no hover), not screen width, so a
  narrow laptop window is still a laptop. `?device=phone|laptop` overrides
  and is remembered.
- **Shows your laptop's timer read-only**, from `room/<me>` with the
  server-clock maths the presence pill uses, plus "on your laptop · Thesis".
- **Never writes `running` and never registers `onDisconnect`.** An iPhone
  drops its connection each time the screen locks, which would otherwise
  flip you to "not working" mid-session.
- **Messages stay sealed while the laptop's timer runs.**
- **The phone is only the timer, the status and the other person's pill**
  (Santi's call, 2026-10-03). Stats, breakdown, note and messages are not
  shown and not started, so the phone never downloads session history.
  The status gets the weight: smaller clock, larger box, presets as a
  two-column grid of 44px buttons.
- No alert, no crash recovery, no controls, no category box on the phone.

### 6j. Unlockable wallpapers (2026-10-03)

| Wallpaper | Unlocks at | State |
|---|---|---|
| Swirl (§6c) | always | built |
| Rainy window | 100 h | built (iterated twice with Santi) |
| Paper hills, live sky | 200 h | built 2026-10-03, awaiting feedback |
| Koi pond | 300 h | built 2026-10-03, awaiting feedback |

- **Unlocks are derived from all-time hours** in the session log, the
  person's own. Nothing "unlocked" is stored; hours never go down.
- **The choice is per device, in localStorage** (`wallpaper:<me>`), not in
  Firebase. Painted from storage on the first frame, before the log loads.
- **The picker is inside the stats panel.** Locked ones show progress
  ("62 / 100 h"). A new unlock puts a dot on the stats chip until the panel
  is opened (`wallpapersSeen:<me>`). No toast, no sound.
- **`?bg=<id>` previews any built wallpaper** without unlocking or saving.
- **Markup:** one `.wp-<id>` wrapper per wallpaper inside
  `#backgroundLayer`; `data-bg` picks one and the rest are `display: none`,
  which also stops their animations. Each new wallpaper is its own file in
  `css/wallpapers/`.
- **Same rules as §6c:** only `transform` and `opacity` animate, no blur,
  gradients fade to the same hex at alpha `00`, reduced motion freezes.
- **The phone has no picker** and shows the swirl unless previewed.
- **Rainy window:** dusk sky; two bokeh layers of city lights (one
  element each, a dozen gradients) that crossfade, drift and swell; a few
  lights flickering on their own beat; cars on one wet road near the
  bottom, with soft reflections, passing rarely and irregularly; three depths of rain, gradient streaks, blended with `overlay`
  so they show against lights and vanish against the sky, leaning with a
  slow wind; static beads and an edge vignette; seven runner drops.
- **Paper hills:** four cut-paper hill silhouettes (inline SVG, each
  throwing a soft shadow on the one behind) under a sky blended from
  time-of-day keyframes (`js/lib/sky.js`): pink dawn, gold afternoon,
  violet dusk, indigo night with stars and a crescent moon. `js/sky.js`
  sets the colours as custom properties once a minute; sun and moon glide
  between updates on a one-minute transition. Only three paper clouds and
  a star twinkle move continuously. Fixed schedule (sunrise ~6:30, sunset
  ~18:45), not computed from location. `?sky=<hour>` pins the time.
- **Koi pond:** top-down cut-paper pond (Santi's picks: top-down, cut
  paper like Hills, calm, follows the clock). Four depths of water with
  inner shadows, a mossy bank and stones in the corners, lily pads and a
  lotus, three occasional ripples. Four koi (kohaku, ogon, showa, orenji)
  built by `js/koi.js`; each swims as nested transforms: a slow drift
  loop, an orbit, a sway, a tail beat. Homes sit in the left and right
  thirds so they cross under the card rather than live there. Shadows are
  blurred inside their own SVG and skip the sway and tail. The light is
  one colour multiplied over everything (`js/lib/pond.js`, applied by
  `js/sky.js`), plus the sun's or moon's reflection on Hills' arc. Dusk
  is lavender, not rose (rose on teal cancels to grey). No colour
  transition on the light: minute steps are invisible, and a transition
  would repaint the full screen every frame.
- **Swirl as ink on paper** (2026-10-03, Santi's pick from three mock-ups:
  paper, risograph, marbled; then refined to a blend of the first two). A
  static paper layer is multiplied over the blobs: cream tint, an even
  fine paper tooth, a soft 7px dot screen, and an edge darkening. Mottled
  paper was tried first and read as dark spots. The centre wash
  (`--bg-veil`) sits above the paper and now shows; it used to paint *under* the blobs.
  Both are `.wp-swirl` pseudo-elements, so they don't touch the other
  wallpapers.

### 6k. Stopwatch mode (2026-10-04)

A stopwatch with a two-hour cap, so one left running can't log a day.

- **A countdown in disguise:** a run of `STOPWATCH_CAP_MS` whose clock
  shows time used (`shownMs` in `js/lib/timer-math.js`). Pause, resume,
  logging, the 5s noise floor, crash recovery and the end at zero are the
  countdown's own code; reaching zero *is* the auto-stop. Rejected: a
  separate counting-up path, which would duplicate every rule about when
  time gets logged.
- **Timer state:** `mode`, and `countdownDuration` (the minutes setting,
  kept while `duration` holds the cap). Older saved state migrates in
  `parseTimer`.
- **The switch** (`#modeToggle`) names the mode you're in ("↓ Countdown" /
  "↑ Stopwatch"). It sits in a settings row with the minutes box, above
  Start / Pause / Reset (Santi's call), so the settings sit together and
  the controls row stays three buttons. In stopwatch mode the minutes box
  is swapped for "Stops itself at 2 hours" in the same row so the card
  doesn't jump.
- **At the cap** (Santi's calls): chime, notification ("2 hours up") and
  the title blink fire, as for a countdown; the clock holds at 2:00:00.
- **The countdown's clock stays minutes-only** (`90:00`); only the
  stopwatch uses hours (`formatElapsed`).

### Synced timer mode (unchanged, still later)

An opt-in toggle binding the two timers. Not designed, not requested, not
part of v1.

---

## 7. Deferred to v2 — design so these aren't painful to bolt on

Do not build these. Do not let them creep into scope.

- A coin system, or a background upload flow (unlockable wallpapers and
  their picker moved into scope 2026-10-02: §6j)
- The couples wallpaper at 1,000 combined hours (planned, not designed).
  The repo is public, so a real photo of them can't be committed: it needs
  an illustrated version, or to live outside the repo.
- Category rename / merge tool (the key-vs-label split already makes it cheap)
- Retroactive labelling of past sessions (would break the append-only log)
- Message expiry (open question from 2026-09-11 (c): a message sits in the
  slot until replaced)
- Shared screen or camera
- Anything from the old "decorate a shared home" concept

---

## 8. Session log convention

At the end of each working session, write `docs/sessions/YYYY-MM-DD.md` (add
`-b`, `-c` for more in a day) and commit it. Under a page:

```markdown
# Session — YYYY-MM-DD

**Stage:** what was worked on, and its status

## What got built
Two or three sentences. Concrete: files, functions, what now works.

## Decisions made
Anything chosen over an alternative, and the reason. One line each.

## State of the code
What's working, what's half-done, what's known-broken. Test count.

## Next action
The single specific thing to do first next session.

## Open questions
Anything undecided, or anything he needs to supply.
```

Update this roadmap in the same commit whenever a decision changes. Session
files before 2026-09-04 use an older teaching-era format; read them for
history, don't reproduce their shape.

---

## 9. What's left

**Second round (opened 2026-10-02), in order:**

a. ~~Status + phone remote mode~~ (done 2026-10-02).
b. **Phone polish.** Layout cleanup done 2026-10-03. Still to do: home-screen install (manifest + icons; iOS only allows
   web notifications for sites added to the home screen), safe areas for
   the notch and home bar, the keyboard covering the status box, fewer
   background blobs on small screens. Test on Santi's iPhone.
c. **Unlockable wallpapers** (§6j). System and all four wallpapers built
   2026-10-03. Paper hills, the swirl's paper texture and Koi pond await
   Santi's feedback; the couples wallpaper stays deferred (§7).

**From v1:**

1. **GitHub Pages** is live (confirmed 2026-10-02). The interim security
   rules (`database.rules.json`) should be published if they aren't yet.
2. **The end-to-end real-browser pass on the Pages URL**, in two windows
   (`?me=santi` / `?me=kristina`): categories, chips, presence with category,
   stats and breakdown, the note round trip, a message unsealing at zero, the
   chime, the notification permission, and the blinking title. Most of this
   is now covered by the automated suite against a fake Firebase; this pass
   is for the real database and real browser permissions.
3. **The two-device test with Kristina** (§5 item 1).
4. **The pinned security rules** (§5 item 2), with UIDs taken from the Pages
   URL: four of them now, a laptop and a phone each.

Items 3 and 4 need Kristina. If everything passes, v1 is finished. Do not
extend the project to fill the time; §7 exists so new ideas get parked.

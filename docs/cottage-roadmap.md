# Cottage widget — roadmap

## Agreed scope

A compact dashboard card immediately below Time management. The cottage unlocks
at 100 personal lifetime focus hours, with upgrades every 5–10 hours. The first
frame is an exterior; clicking the door switches to one room in the same card.
Simple flat illustrations keep the art and interaction small.

## Approved first collection

| Lifetime hours | Unlock | Location |
| --- | --- | --- |
| 100 | Cottage, desk, chair and window | Base scene |
| 105 | Woven rug | Interior |
| 110 | Little plant | Interior |
| 120 | Bookshelf | Interior |
| 130 | Warm lamp | Interior |
| 135 | Window flowers | Exterior |
| 145 | Linen curtains | Interior |
| 150 | Coffee | Interior |
| 155 | Botanical print | Interior |
| 165 | Reading armchair | Interior |
| 170 | Blanket | Interior |
| 180 | Fireplace | Interior |
| 185 | Log basket | Interior |
| 195 | Sleeping cat | Interior |
| 200 | You & Kristina — framed couple portrait | Above the fireplace |

The 100-hour house and the approved upgrades span 100–200 hours.
Items are earned without spending hours. Placement is optional, using fixed spots
and an inline collection rather than dragging or a separate editor. Existing
hours count. No currencies, room expansion, maintenance or lost streaks.

## Stages and completion criteria

1. **Interaction prototype — built for review.** `prototypes/cottage/index.html`
   previews 95–200 hours without loading Firebase. Try the lock, door, return
   control, next reward, and placing/removing each item at desktop and narrow
   widths. Review the art, card size, and proposed collection.
2. **Dashboard integration.** Insert the reviewed card below Time management;
   subscribe to the existing personal session totals without changing timer.js.
   Keep preview-hour controls out of the real dashboard. Show a loading state
   until totals are known. Verify exact threshold boundaries and session edits.
3. **Saved decoration and reward handling.** Initially propose per-person,
   per-browser local storage, matching wallpaper choice. Cross-device sync is
   outside this first version. Validate stored item IDs, handle storage failure,
   and distinguish earned items from placed items. Quietly announce new unlocks
   in the card, with no timer interruption.
4. **Finish and release review.** Check keyboard navigation, small windows,
   contrast, reduced motion and offline/loading behavior. Run the complete
   regression suite and review the dashboard before publishing.

## Implemented behavior

The card is integrated natively below Time management on the laptop dashboard.
`js/cottage.js` subscribes to personal session totals; `js/lib/cottage.js` owns
thresholds and stored-item validation. `css/cottage.css` scopes the approved SVG
art and animation to the card. The timer and Firebase schema are unchanged.

The per-person `cottage:<person>` browser preference stores the highest earned
hours and placed item IDs. Current logged time, including manual additions,
counts toward rewards. Corrections cannot remove rewards already earned in
that browser; other browsers independently derive unlocks from their own loaded
history. Clearing browser data resets these preferences. Storage failure keeps
choices available for the visit and reports that they could not be saved.

The first scene is always the exterior. Decorations are optional and can be
placed individually or with Place all unlocked. Loading does not imply zero
hours. No prototype-hour controls are included in the real dashboard. Motion
pauses outside the dashboard and in background tabs; reduced-motion disables it.

## Photo and release authorization

Santi explicitly authorized publishing the supplied couple photograph on
2026-10-31 after being told the repository and website are public. It ships as
`assets/cottage-couple.jpeg`, displayed intact within a landscape frame at 200h.
He also authorized implementation and push. This supersedes the earlier local
prototype-only status and the generic roadmap restriction on committing photos
for this supplied image only. Firebase rules and production data are unchanged.

## Validation

Browser coverage checks exact unlock boundaries, placement persistence,
retaining rewards through corrections and reload, invalid saved data, placing
all fourteen decorations, the photo asset, and off-dashboard animation pausing.
The standalone art study also covers reduced-motion and narrow-screen overflow.

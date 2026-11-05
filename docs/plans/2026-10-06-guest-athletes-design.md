# Guest athletes on another sport's workout

**Date:** 2026-10-06  
**Goal:** Log an athlete who trains with a sport they do not belong to, on that day's weight-room card and on that speed-testing session, without changing their membership or the host sport's season totals.

---

## 1. Decisions

| Decision | Choice |
|----------|--------|
| Where | Weight-room manual log and speed-testing data entry |
| How they are added | Add-guest search under the roster. On speed testing, Other sports matches under the sport list after the coach types |
| Membership | Unchanged. A guest is not added to the host sport |
| That day | They appear on the card and on the session leaderboard, labeled Guest plus their real sport |
| Season totals | Host sport team-progress lifts, ISO rocks, and the weight-room team report count members only |
| Athlete record | Their own report and progression include the work |
| Attendance | Host sport percentages stay on the roster. A weight-room guest log stays on the card's sport, so it does not count as a practice for their own sport. A speed-testing entry still counts for each sport they belong to |
| Guest flag | Derived. No stored guest column |
| Speed context | Optional `entries.context_hugo_group`, the sport selected at save time. All sports and older entries leave it empty |
| Who can do it | Coach login, same as the rest of data entry and the weight room |

**Success criteria**

- On a soccer or volleyball card, a coach types a name, adds an athlete from another sport, saves their sets, and sees them labeled Guest after reload.
- On speed testing, with a sport selected, a coach picks someone from Other sports. The session leaderboard shows Guest and their home sport. A roster athlete on that same sport is not a guest.
- Soccer and volleyball season lift totals and attendance percentages do not include the guest. The guest's own report does.

---

## 2. How a guest is decided

Membership stays in `athlete_hugo_memberships`, the same list the roster uses.

**Weight room.** The session log keeps the card's `hugo_group`. Guest means this athlete has a log on the card and is not a member of that sport. Reopening the card loads those athletes by name and sport and puts them back on the checklist, checked, with cells filled. Season queries for team-progress lifts, ISO rocks, and the weight-room team report keep a log only when the athlete is a member of that sport. The athlete report still loads every log for that person.

**Speed testing.** `POST` writes `context_hugo_group` from the sport dropdown. All sports sends null. The live leaderboard still ranks everyone on the session. A row is a guest when the column is set and the athlete is not a member of it. The payload adds `guest` and the home sport label. Empty context means no Guest label. Team-progress tests already limit to the roster, so a guest's time stays out of the host sport's averages and still counts for a sport they belong to.

The migration adds a nullable `context_hugo_group` on `entries`, checked in the app with `isHugoGroup`. Existing rows stay null.

---

## 3. Screens

**Weight-room log.** The roster checklist stays. Under it, Add guest searches active athletes who are not on this sport and not already on the card. An empty box does not list the school. Each result shows name and real sport. Choosing one adds a checkbox and a column, with Guest and that sport on a second line under the name. Unchecking before save drops them from this save. Unchecking someone who already has a saved log leaves that log, same as a roster athlete you are not updating. The scan review screen is unchanged. A log that already exists for someone outside the sport still shows as a guest on this card.

**Speed testing.** With a sport selected, that sport's matches stay in the main list. After the coach types, other matches sit under Other sports, and arrow keys move through both. Choosing one fills the athlete box with name, sport, and Guest. Changing the sport dropdown clears that pick when they are not in the new sport. All sports keeps one list and saves a null context. Quick-add for someone who is not in the system stays separate.

**Leaderboard.** Rank is unchanged. A guest row adds Guest and their home sport after the name. If membership cannot be read for a row, the row still ranks and has no Guest label.

---

## 4. Errors

If the athlete list fails to load, the roster checklist still works and Add guest shows a short error. No name match says "No athletes match." Saves use the existing weight-room and speed-testing posts, including the same login and validation errors. A sport value that is not a Hugo sport is rejected with 400. Null context is allowed.

---

## 5. Tests

- A guest saved on a soccer card is present after reload, labeled Guest with their real sport, and their sets are stored.
- That log is in the athlete report and absent from soccer team-progress lifts, ISO rocks, and the weight-room team report.
- A guest card log does not change soccer attendance.
- An Other sports pick stores `context_hugo_group`. The session leaderboard sets `guest` only when that sport is set and the athlete is not a member.
- A member saved with that sport selected is not a guest.
- Null context (older rows and All sports) is not a guest.
- An invalid sport is rejected.
- Other sports is hidden until the coach types, and hidden when no sport is selected.
- Changing the sport clears a selected guest who is not in the new sport.

---

## 6. Out of scope

Adding the guest to the host roster, a stored guest flag, guest search on scan review, and a Guest label on the historical leaderboard.

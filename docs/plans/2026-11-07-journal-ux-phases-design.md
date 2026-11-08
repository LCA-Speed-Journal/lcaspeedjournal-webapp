# Journal UX phases — design

Date: 7 November 2026. Validated in conversation against the 6 November audit and the local app. This is the design the implementation plan executes. It is not a rewrite of the parser, norms, battery scoring, or speed windows.

## Who it is for

Strength coaches log marks all year. Athletes read a session on a TV or a phone. The admin sends a packet to a sport coach. One person can belong to more than one team. Light and dark both work on every screen, at phone width and at desktop width. A room may project either theme.

## What stays

- Within-session drop-off caption, exactly `Best · Line · N above` from `src/lib/dropoff/format.ts`. The trend pill is the separate session-to-session comparison. This project does not edit that caption.
- Phone data entry: one attempt, one submit, same session, same leaderboard.
- Navy and gold. No Pearson reskin. No program builder. No athlete accounts.
- `GET /api/athletes` stays public until Historical has another source. The Home link to it goes away.

## Group calendars

A workout belongs to one group from `HUGO_GROUPS` in `src/lib/weight-room/constants.ts`, or to Other. Each group has its own date ranges. There is no school-wide Fall or Winter start.

Week 1 is the seven days beginning on that range's start date. D1 is the start date. A Tuesday in a Monday-start volleyball range is `Volleyball W1D2`. The label is the group display name plus week and day, so boys basketball and girls basketball stay distinct.

Other is for open houses and events that are not one group's season. Other has no week number. The menu shows the date, the optional phase sentence, and the note.

`phase` becomes optional free text. Track may say "Competition." A group that is not phasic leaves it blank. `session_notes` stays the note for that day. `phase_week` is no longer collected. Old rows keep their stored phase until a group is assigned. Labels are computed from the stored group and the date. Editing a group's range relabels that group's sessions. The date alone never guesses the group.

The editor covers 2023 through 2027, and a later year can be added on the same screen. A group may have more than one range in a year.

## Board

The board URL contains `session`. A missing param opens the latest session and expands its tests. Refresh keeps the session. Display layout is full width, no graph paper, name and mark largest, filters behind Review. That layout exists in light and in dark. The mark and the zone word use the theme's primary ink. Zone color stays the left edge. Rank, mark, PB, trend pill, and the drop-off caption all stay.

Fonts: Source Sans 3 for UI text, Barlow Condensed for the mark and the rank, after the Penpot frame of that pair is accepted.

## Entry

Desktop, at a width chosen from the mockup: one test, athletes in the session's group as rows, Enter moves down the column. The parser stays behind the cell. Other has no single roster, so it keeps the athlete picker. The phone form is not deleted.

## Packet, people, shell

Team Leaders is the export. Metric keys get a human label stored once. Top athletes needs a minimum test count, or that ranking leaves the page. The athlete page becomes search, then one person, with team lanes. Sign out appears on staff screens. The shell (Board, Log, Athletes, Report) waits until the board and the entry flows have been used on a real session day. Weight room stays its own list under Log. Batteries become a multi-day board only in that last phase.

## How a phase is allowed to start

Penpot file `LCA Speed Journal mockups`, connected with File → MCP Server → Connect. The agent uses the official Penpot AI kit skills `penpot-foundations`, `penpot-component-factory`, `penpot-build-screen`, and `penpot-audit-accessibility`, plus `ar27111994/penpot-mcp`. Do not install `penpot-uiux-design` from awesome-copilot.

You accept or reject the frames in Penpot. An accepted frame is rebuilt on a coach-only `/design-preview` route with real tokens. Production code for that phase starts after the preview matches. Phase 0 (PIN, error copy, Home link, weight-room hub copy) has no mockup.

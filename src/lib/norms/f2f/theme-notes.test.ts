import { describe, expect, it } from "vitest";
import { themeGroupKey } from "./themes";
import { mergeThemeNotes, parseThemeNotesPatch } from "./theme-notes";

describe("parseThemeNotesPatch", () => {
  it("accepts session and sport|gender keys", () => {
    const key = themeGroupKey("soccer", "M");
    const parsed = parseThemeNotesPatch({
      session: "Session takeaway",
      [key]: "the gap is Force, not speed",
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        session: "Session takeaway",
        "soccer|M": "the gap is Force, not speed",
      },
    });
  });

  it("rejects unknown keys", () => {
    expect(parseThemeNotesPatch({ unknown: "nope" })).toEqual({
      ok: false,
      error: expect.stringMatching(/unknown|key/i),
    });
    expect(parseThemeNotesPatch({ "soccer|X": "nope" })).toEqual({
      ok: false,
      error: expect.stringMatching(/unknown|key/i),
    });
    expect(parseThemeNotesPatch({ "foo|bar": "nope" })).toEqual({
      ok: false,
      error: expect.stringMatching(/unknown|key/i),
    });
  });

  it("rejects non-string notes", () => {
    expect(parseThemeNotesPatch({ session: 12 })).toEqual({
      ok: false,
      error: expect.stringMatching(/string/i),
    });
    expect(parseThemeNotesPatch({ "soccer|M": null })).toEqual({
      ok: false,
      error: expect.stringMatching(/string/i),
    });
  });

  it("rejects notes longer than 500 characters", () => {
    expect(parseThemeNotesPatch({ session: "x".repeat(501) })).toEqual({
      ok: false,
      error: expect.stringMatching(/500/i),
    });
  });

  it("keeps empty strings so merge can clear an override", () => {
    const parsed = parseThemeNotesPatch({ session: "" });
    expect(parsed).toEqual({ ok: true, value: { session: "" } });
  });
});

describe("mergeThemeNotes", () => {
  it("overlays the patch and deletes keys cleared with an empty string", () => {
    const merged = mergeThemeNotes(
      {
        session: "old session",
        "soccer|M": "keep me",
        "soccer|F": "remove me",
      },
      {
        session: "new session",
        "soccer|F": "",
      }
    );
    expect(merged).toEqual({
      session: "new session",
      "soccer|M": "keep me",
    });
  });
});

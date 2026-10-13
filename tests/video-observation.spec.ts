import { test, expect } from "@playwright/test";
import { mergeSegments, observationDelta } from "../src/lib/video-observation";
test("video coverage merges loops and preserves unseen seek gaps", () => {
  expect(
    mergeSegments([
      [0, 2],
      [1, 3],
      [8, 9],
      [0, 1],
    ]),
  ).toEqual([
    [0, 3],
    [8, 9],
  ]);
  expect(observationDelta(0, 8, 0.25, 1)).toBe(0);
  expect(observationDelta(4, 4, 0.25, 1)).toBe(0);
  expect(observationDelta(8, 0, 0.25, 1)).toBe(0);
  expect(observationDelta(0, 0.25, 0.25, 1)).toBe(0.25);
  expect(observationDelta(0, 0.5, 0.25, 2)).toBe(0.25);
  expect(observationDelta(0, 5, 5, 1)).toBe(0);
});

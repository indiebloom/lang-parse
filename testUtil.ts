export * from "https://deno.land/std@0.223.0/assert/mod.ts";
import { assertEquals } from "https://deno.land/std@0.223.0/assert/mod.ts";

export const pp = (o: object) => JSON.stringify(o, null, 2);

export const assertObjectEquals = (actual: object, expected: object) =>
  assertEquals(
    actual,
    expected,
    `Expected\n${pp(expected)}\nbut got\n${pp(actual)}`,
  );

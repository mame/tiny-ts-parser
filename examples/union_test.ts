import test from "node:test";
import assert from "node:assert";
import { parseTaggedUnion, typeShow } from "tiny-ts-parser";
import { typecheck } from "./union.ts";

function run(code: string) {
  return typecheck(parseTaggedUnion(code), {});
}
function ok(expected: string, code: string) {
  assert.equal(expected, typeShow(run(code)));
}
function ng(expected: RegExp, code: string) {
  assert.throws(() => {
    run(code);
    return true;
  }, expected);
}

test("tagged union", () =>
  ok(
    "number",
    `
  type NumOrBoolean = { tag: "num", val: number } | { tag: "bool", val: boolean };
  const v = <{ tag: "num", val: number } | { tag: "bool", val: boolean }>{ tag: "num", val: 42 };
  switch (v.tag) {
    case "num": {
      v.val + 1;
    }
    case "bool": {
      v.val ? 1 : 2;
    }
  }
`,
  ));
test("tagged union error 1", () =>
  ng(
    /test.ts:3:46-3:50 tagged union's term has a wrong type/,
    `
  type NumOrBoolean = { tag: "num", val: number } | { tag: "bool", val: boolean };
  const v = <NumOrBoolean>{ tag: "num", val: true };
  1;
`,
  ));
test("tagged union error 2", () =>
  ng(
    /test.ts:3:3-7:4 variable v must have a tagged union type/,
    `
  const v = 1;
  switch (v.tag) {
    case "num": {
      v.val + 1;
    }
  }
`,
  ));
test("tagged union error 3", () =>
  ng(
    /test.ts:12:7-12:20 tagged union type has no case: unknown/,
    `
  type NumOrBoolean = { tag: "num", val: number } | { tag: "bool", val: boolean };
  const v = <NumOrBoolean>{ tag: "num", val: 42 };
  switch (v.tag) {
    case "num": {
      v.val + 1;
    }
    case "bool": {
      v.val ? 1 : 2;
    }
    case "unknown": {
      v.val ? 1 : 2;
    }
  }
`,
  ));
test("tagged union error 4", () =>
  ng(
    /test.ts:9:7-9:12 clauses has different types/,
    `
  type NumOrBoolean = { tag: "num", val: number } | { tag: "bool", val: boolean };
  const v = <NumOrBoolean>{ tag: "num", val: 42 };
  switch (v.tag) {
    case "num": {
      v.val;
    }
    case "bool": {
      v.val;
    }
  }
`,
  ));

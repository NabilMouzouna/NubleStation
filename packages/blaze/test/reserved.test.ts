import { describe, expect, it } from "vitest";
import { assertValidIdentifier, defineSchema, SchemaError, t } from "../src/index.js";

describe("reserved names and identifiers", () => {
  it("rejects table names that shadow a built-in resource", () => {
    expect(() => defineSchema({ users: t.model({ name: t.string() }) })).toThrow(SchemaError);
    expect(() => defineSchema({ files: t.model({ name: t.string() }) })).toThrow(SchemaError);
    expect(() => defineSchema({ notifications: t.model({ x: t.string() }) })).toThrow(SchemaError);
  });

  it("rejects auto-injected column names", () => {
    expect(() => defineSchema({ notes: t.model({ id: t.string() }) })).toThrow(/reserved/);
    expect(() => defineSchema({ notes: t.model({ app_id: t.uuid() }) })).toThrow(/reserved/);
  });

  it("rejects invalid identifiers", () => {
    expect(() => assertValidIdentifier("table", "1tasks")).toThrow(SchemaError);
    expect(() => assertValidIdentifier("table", "Tasks")).toThrow(SchemaError);
    expect(() => assertValidIdentifier("table", "my-table")).toThrow(SchemaError);
    expect(() => assertValidIdentifier("table", "select")).toThrow(/keyword/);
    expect(() => assertValidIdentifier("column", "a".repeat(64))).toThrow(/63/);
  });

  it("accepts a valid, non-reserved schema", () => {
    expect(() =>
      defineSchema({ clinic_tasks: t.model({ title: t.string().required() }) }),
    ).not.toThrow();
  });
});

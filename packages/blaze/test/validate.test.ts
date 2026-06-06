import { describe, expect, it } from "vitest";
import { defineSchema, serializeSchema, t } from "../src/index.js";
import { toZodSchema } from "../src/validate.js";

const schema = serializeSchema(
  defineSchema({
    tasks: t.model({
      title: t.string().required(),
      status: t.enum(["todo", "doing", "done"]).default("todo"),
      done: t.boolean(),
    }),
  }),
);
const tasks = schema.tables.tasks!;

describe("toZodSchema — insert", () => {
  const insert = toZodSchema(tasks, "insert");

  it("requires required fields without a default", () => {
    expect(insert.safeParse({}).success).toBe(false);
    expect(insert.safeParse({ title: "x" }).success).toBe(true);
  });

  it("permits omitting defaulted / optional fields", () => {
    expect(insert.safeParse({ title: "x" }).success).toBe(true);
    expect(insert.safeParse({ title: "x", status: "doing", done: true }).success).toBe(true);
  });

  it("rejects unknown keys, wrong types, and bad enum values", () => {
    expect(insert.safeParse({ title: "x", nope: 1 }).success).toBe(false);
    expect(insert.safeParse({ title: 1 }).success).toBe(false);
    expect(insert.safeParse({ title: "x", status: "archived" }).success).toBe(false);
  });
});

describe("toZodSchema — update", () => {
  const update = toZodSchema(tasks, "update");

  it("is fully partial", () => {
    expect(update.safeParse({}).success).toBe(true);
    expect(update.safeParse({ status: "doing" }).success).toBe(true);
  });

  it("still rejects unknown keys", () => {
    expect(update.safeParse({ nope: 1 }).success).toBe(false);
  });
});

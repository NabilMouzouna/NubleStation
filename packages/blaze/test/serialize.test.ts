import { describe, expect, it } from "vitest";
import {
  canonicalChecksum,
  canonicalJson,
  defineSchema,
  serializeSchema,
  t,
} from "../src/index.js";

describe("serializeSchema", () => {
  it("produces reorder-invariant canonical JSON and checksum", async () => {
    const a = defineSchema({
      notes: t.model({ title: t.string().required(), pinned: t.boolean().default(false) }),
      tags: t.model({ label: t.string().required() }),
    });
    // Same schema, tables and fields authored in a different order.
    const b = defineSchema({
      tags: t.model({ label: t.string().required() }),
      notes: t.model({ pinned: t.boolean().default(false), title: t.string().required() }),
    });

    expect(canonicalJson(serializeSchema(a))).toBe(canonicalJson(serializeSchema(b)));
    expect(await canonicalChecksum(serializeSchema(a))).toBe(
      await canonicalChecksum(serializeSchema(b)),
    );
  });

  it("captures model indexes and preserves enum value order", () => {
    const s = serializeSchema(
      defineSchema({
        tasks: t
          .model({ title: t.string().required(), status: t.enum(["todo", "doing", "done"]) })
          .index("status"),
      }),
    );
    expect(s.tables.tasks!.indexes).toEqual([{ columns: ["status"], unique: false }]);
    expect(s.tables.tasks!.fields.status!.enumValues).toEqual(["todo", "doing", "done"]);
  });

  it("round-trips a ref with its onDelete action", () => {
    const s = serializeSchema(
      defineSchema({
        posts: t.model({ title: t.string().required() }),
        comments: t.model({
          post: t.ref("posts", { onDelete: "cascade" }),
          body: t.string().required(),
        }),
      }),
    );
    expect(s.tables.comments!.fields.post!.ref).toEqual({ table: "posts", onDelete: "cascade" });
  });

  it("normalizes timestamp .default('now') to a now() default", () => {
    const s = serializeSchema(
      defineSchema({ events: t.model({ at: t.timestamp().default("now") }) }),
    );
    expect(s.tables.events!.fields.at!.default).toEqual({ kind: "now" });
  });
});

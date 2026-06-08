import { describe, expect, expectTypeOf, it } from "vitest";
import { defineSchema, SchemaError, serializeSchema, t, type InferSchema } from "../src/index.js";

describe("defineSchema", () => {
  it("treats a bare field map and t.model() identically", () => {
    const bare = serializeSchema(defineSchema({ notes: { title: t.string().required() } }));
    const wrapped = serializeSchema(defineSchema({ notes: t.model({ title: t.string().required() }) }));
    expect(bare).toEqual(wrapped);
  });

  it("rejects an enum default outside its declared values", () => {
    // @ts-expect-error "c" is not a member of the enum (caught at compile and runtime)
    const bad = () => defineSchema({ t1: t.model({ s: t.enum(["a", "b"]).default("c") }) });
    expect(bad).toThrow(SchemaError);
  });

  it("rejects a ref to an unknown table", () => {
    expect(() => defineSchema({ c: t.model({ p: t.ref("ghosts") }) })).toThrow(/unknown table/);
  });

  it("allows a ref to a built-in (users) and to a defined table", () => {
    expect(() =>
      defineSchema({
        posts: t.model({ title: t.string().required() }),
        comments: t.model({ post: t.ref("posts"), author: t.ref("users") }),
      }),
    ).not.toThrow();
  });

  it("rejects an index on an unknown column", () => {
    // @ts-expect-error "b" is not a column of this model (caught at compile and runtime)
    const bad = () => defineSchema({ t1: t.model({ a: t.string() }).index("b") });
    expect(bad).toThrow(/unknown column/);
  });
});

describe("type inference (enforced by check-types)", () => {
  it("infers Row and Insert with correct optionality", () => {
    const schema = defineSchema({
      tasks: t.model({
        title: t.string().required(),
        status: t.enum(["todo", "doing", "done"]).default("todo"),
        note: t.string(),
      }),
    });
    type DB = InferSchema<typeof schema>;

    expectTypeOf<DB["tasks"]["Row"]>().toMatchTypeOf<{
      id: string;
      title: string;
      status: "todo" | "doing" | "done";
    }>();
    expectTypeOf<DB["tasks"]["Insert"]>().toMatchTypeOf<{ title: string }>();

    const valid: DB["tasks"]["Insert"] = { title: "x" };
    expect(valid.title).toBe("x");

    // @ts-expect-error title is required on insert (no default)
    const invalid: DB["tasks"]["Insert"] = {};
    void invalid;
  });
});

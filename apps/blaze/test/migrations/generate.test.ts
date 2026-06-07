import { defineSchema, serializeSchema, t } from "@nublestation/blaze";
import { describe, expect, it } from "vitest";
import { generateMigrationSQL } from "../../src/migrations/generate.js";

describe("generateMigrationSQL", () => {
  it("generates CREATE TABLE with injected id and app_id for a fresh schema", async () => {
    const schema = serializeSchema(
      defineSchema({ notes: t.model({ body: t.string().required() }) }),
    );
    const sql = (await generateMigrationSQL(null, schema)).join("\n");

    expect(sql).toContain("tenant_data");
    expect(sql).toContain("notes");
    expect(sql).toContain("app_id");
    expect(sql).toContain("body");
  });

  it("includes RLS policy and grant for a new table", async () => {
    const schema = serializeSchema(
      defineSchema({ notes: t.model({ body: t.string().required() }) }),
    );
    const sql = (await generateMigrationSQL(null, schema)).join("\n");

    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("tenant_isolation");
    expect(sql).toContain("app.current_tenant");
    expect(sql).toContain("GRANT SELECT");
  });

  it("emits ALTER TABLE when adding a column to an existing schema", async () => {
    const prev = serializeSchema(
      defineSchema({ notes: t.model({ body: t.string() }) }),
    );
    const cur = serializeSchema(
      defineSchema({ notes: t.model({ body: t.string(), title: t.string() }) }),
    );
    const sql = (await generateMigrationSQL(prev, cur)).join("\n");

    expect(sql).toContain("ALTER TABLE");
    expect(sql).toContain("title");
    // RLS templates not re-emitted for tables that already existed
    expect(sql).not.toContain("ENABLE ROW LEVEL SECURITY");
  });
});

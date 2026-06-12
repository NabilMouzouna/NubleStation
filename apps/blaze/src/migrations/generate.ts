import { createRequire } from "node:module";
import { compileToDrizzle } from "@nublestation/blaze/compile";
import type { SerializedSchema } from "@nublestation/blaze";

// Load the CJS build of drizzle-kit/api to avoid its ESM bundle's broken require shim.
const { generateDrizzleJson, generateMigration } = createRequire(import.meta.url)("drizzle-kit/api") as {
  generateDrizzleJson: (imports: Record<string, unknown>) => unknown;
  generateMigration: (prev: unknown, cur: unknown) => Promise<string[]>;
};

export async function generateMigrationSQL(
  prevSchema: SerializedSchema | null,
  curSchema: SerializedSchema,
): Promise<string[]> {
  const curJson = generateDrizzleJson(compileToDrizzle(curSchema));
  const prevJson = prevSchema
    ? generateDrizzleJson(compileToDrizzle(prevSchema))
    : generateDrizzleJson({});

  const ddl = await generateMigration(prevJson, curJson);

  const newTables = Object.keys(curSchema.tables).filter(
    (t) => !(t in (prevSchema?.tables ?? {})),
  );

  const rls = newTables.flatMap((name) => [
    `ALTER TABLE "tenant_data"."${name}" ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE "tenant_data"."${name}" FORCE ROW LEVEL SECURITY`,
    `CREATE POLICY tenant_isolation ON "tenant_data"."${name}" AS PERMISSIVE FOR ALL USING (app_id = current_setting('app.current_tenant')::uuid) WITH CHECK (app_id = current_setting('app.current_tenant')::uuid)`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_data"."${name}" TO blaze_app`,
  ]);

  return [...ddl, ...rls];
}

import {
  boolean,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const platform = pgSchema("platform");

export const organizations = platform.table("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subdomainRoot: text("subdomain_root").notNull(),
  adminEmail: text("admin_email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = platform.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    role: text("role").notNull().default("end_user"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailUq: uniqueIndex("users_email_uq").on(t.email),
  }),
);

export const apps = platform.table(
  "apps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    displayName: text("display_name").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nameUq: uniqueIndex("apps_name_uq").on(t.name),
  }),
);

// ADR §4 (api_keys): keyId is the indexed plaintext lookup; secretHash is Argon2.
// Format on the wire: nbl_<key_id>.<secret>
export const apiKeys = platform.table(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    keyId: text("key_id").notNull(),
    secretHash: text("secret_hash").notNull(),
    label: text("label"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    keyIdUq: uniqueIndex("api_keys_key_id_uq").on(t.keyId),
    appIdIdx: index("api_keys_app_id_idx").on(t.appId),
  }),
);

export const userAppAccess = platform.table(
  "user_app_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("end_user"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userAppUq: uniqueIndex("user_app_access_user_app_uq").on(t.userId, t.appId),
    appIdIdx: index("user_app_access_app_id_idx").on(t.appId),
  }),
);

// ADR §4: resource names are reserved org-wide; tableName is unique across all apps.
export const appTables = platform.table(
  "app_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    tableName: text("table_name").notNull(),
    schemaJson: jsonb("schema_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tableNameUq: uniqueIndex("app_tables_table_name_uq").on(t.tableName),
    appIdIdx: index("app_tables_app_id_idx").on(t.appId),
  }),
);

export const deployments = platform.table(
  "deployments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    filePath: text("file_path").notNull(),
    deployedAt: timestamp("deployed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deployedBy: uuid("deployed_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    appIdIdx: index("deployments_app_id_idx").on(t.appId),
  }),
);

// App-developer migrations. ADR §11.
export const migrations = platform.table(
  "migrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appId: uuid("app_id")
      .notNull()
      .references(() => apps.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    checksum: text("checksum").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appliedBy: uuid("applied_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    appIdIdx: index("migrations_app_id_idx").on(t.appId),
    appFileUq: uniqueIndex("migrations_app_filename_uq").on(t.appId, t.filename),
  }),
);

// NubleStation's own platform-schema versions. ADR §11.
export const schemaVersion = platform.table(
  "schema_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version").notNull(),
    checksum: text("checksum").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    versionUq: uniqueIndex("schema_version_version_uq").on(t.version),
  }),
);

export const auditLog = platform.table(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    appId: uuid("app_id").references(() => apps.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    createdAtIdx: index("audit_log_created_at_idx").on(t.createdAt),
  }),
);

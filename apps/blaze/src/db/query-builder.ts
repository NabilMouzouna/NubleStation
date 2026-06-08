/** Safely quotes a PostgreSQL identifier (table name or column name). */
function qi(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

const TABLE_REF = (table: string) => `"tenant_data".${qi(table)}`;

export interface Query {
  sql: string;
  params: unknown[];
}

export function buildSelect(table: string, limit: number, offset: number): Query {
  return {
    sql: `SELECT * FROM ${TABLE_REF(table)} LIMIT $1 OFFSET $2`,
    params: [limit, offset],
  };
}

export function buildSelectById(table: string, id: string): Query {
  return {
    sql: `SELECT * FROM ${TABLE_REF(table)} WHERE id = $1`,
    params: [id],
  };
}

export function buildInsert(
  table: string,
  columns: string[],
  values: unknown[],
): Query {
  const colList = ["app_id", ...columns].map(qi).join(", ");
  const placeholders = [
    "current_setting('app.current_tenant')::uuid",
    ...values.map((_, i) => `$${i + 1}`),
  ].join(", ");
  return {
    sql: `INSERT INTO ${TABLE_REF(table)} (${colList}) VALUES (${placeholders}) RETURNING *`,
    params: values,
  };
}

export function buildUpdate(
  table: string,
  id: string,
  columns: string[],
  values: unknown[],
): Query {
  const setClauses = columns.map((c, i) => `${qi(c)} = $${i + 1}`).join(", ");
  return {
    sql: `UPDATE ${TABLE_REF(table)} SET ${setClauses} WHERE id = $${columns.length + 1} RETURNING *`,
    params: [...values, id],
  };
}

export function buildDelete(table: string, id: string): Query {
  return {
    sql: `DELETE FROM ${TABLE_REF(table)} WHERE id = $1 RETURNING *`,
    params: [id],
  };
}

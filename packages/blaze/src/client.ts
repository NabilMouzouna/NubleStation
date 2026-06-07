import type { ModelFields, InferRow, InferInsert } from "./builders.js";
import type { Schema } from "./define-schema.js";

type TableMap<S extends Schema<any>> = S extends Schema<infer T> ? T : never;

export interface TableClient<Row extends { id: string }, Insert> {
  list(opts?: { limit?: number; offset?: number }): Promise<Row[]>;
  get(id: string): Promise<Row>;
  create(data: Insert): Promise<Row>;
  update(id: string, data: Partial<Insert>): Promise<Row>;
  delete(id: string): Promise<void>;
}

export type BlazeClient<S extends Schema<any>> = {
  db: {
    [K in keyof TableMap<S>]: TableClient<
      InferRow<TableMap<S>[K]>,
      InferInsert<TableMap<S>[K]>
    >;
  };
};

interface BlazeConfig<S extends Schema<any>> {
  baseUrl: string;
  apiKey: string;
  schema: S;
}

async function req<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Blaze ${init.method ?? "GET"} ${url} → ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

function makeTableClient(baseUrl: string, headers: Record<string, string>, table: string) {
  const base = `${baseUrl}/v1/blaze/db/${table}`;
  return {
    async list(opts?: { limit?: number; offset?: number }) {
      const params = new URLSearchParams();
      if (opts?.limit != null) params.set("limit", String(opts.limit));
      if (opts?.offset != null) params.set("offset", String(opts.offset));
      const qs = params.toString();
      return req<unknown[]>(`${base}${qs ? `?${qs}` : ""}`, { headers });
    },
    async get(id: string) {
      return req<unknown>(`${base}/${id}`, { headers });
    },
    async create(data: unknown) {
      return req<unknown>(base, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
    },
    async update(id: string, data: unknown) {
      return req<unknown>(`${base}/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });
    },
    async delete(id: string) {
      await fetch(`${base}/${id}`, { method: "DELETE", headers });
    },
  };
}

export function createBlazeClient<S extends Schema<any>>(
  config: BlazeConfig<S>,
): BlazeClient<S> {
  const { baseUrl, apiKey } = config;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return {
    db: new Proxy({} as BlazeClient<S>["db"], {
      get(_, prop: string) {
        return makeTableClient(baseUrl, headers, prop);
      },
    }),
  };
}

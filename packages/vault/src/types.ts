export interface ClientConfig {
  /** Base URL of your NubleStation gateway, e.g. http://api.clinic.local */
  url: string;
  /** API key issued from the Console (nbl_...) */
  apiKey: string;
}

/** viewer = read/download · editor = read/download/overwrite/delete (ADR 016). */
export type GrantRole = "viewer" | "editor";

export interface FileResult {
  id: string;
  /** Identity user id of the owner, or null for communal/legacy files. */
  ownerId: string | null;
  collection: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isPublic: boolean;
  createdAt: string;
  /**
   * The caller's relationship to this file, when the endpoint reports it:
   * "owner" (listMine), the granted role (listSharedWithMe), or "public"
   * (listPublic). Absent on the generic list().
   */
  role?: GrantRole | "owner" | "public";
}

export interface Grant {
  granteeUserId: string;
  granteeEmail: string;
  granteeName: string | null;
  collection: string;
  filename: string | null;
  role: GrantRole;
  createdAt: string;
}

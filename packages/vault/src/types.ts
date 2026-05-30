export interface ClientConfig {
  /** Base URL of your NubleStation gateway, e.g. http://api.clinic.local */
  url: string;
  /** API key issued from the Console (nbl_...) */
  apiKey: string;
}

export interface FileResult {
  id: string;
  collection: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isPublic: boolean;
  createdAt: string;
}

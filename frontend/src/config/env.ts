interface AppConfig {
  apiUrl: string;
}

function normalizeApiUrl(value: string | undefined): string {
  const candidate = value?.trim() || "http://localhost:3000";

  try {
    const url = new URL(candidate);
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error(`VITE_API_URL invalida: ${candidate}`);
  }
}

export const config: AppConfig = {
  apiUrl: normalizeApiUrl(import.meta.env.VITE_API_URL)
};

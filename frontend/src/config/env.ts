interface AppConfig {
  apiUrl: string;
}

function getDefaultApiUrl(): string {
  return window.location.origin;
}

function normalizeApiUrl(value: string | undefined): string {
  const candidate = value?.trim() || getDefaultApiUrl();

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

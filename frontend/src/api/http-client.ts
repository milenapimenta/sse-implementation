import { config } from "../config/env";

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

function buildUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${config.apiUrl}${normalizedPath}`;
}

function isJsonResponse(response: Response): boolean {
  return response.headers.get("content-type")?.includes("application/json") ?? false;
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null) {
    return fallback;
  }

  const candidate = body as ApiErrorBody;
  return candidate.error?.message || candidate.message || fallback;
}

export async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
  } catch (error) {
    console.error("HTTP request failed", { path, error });
    throw new Error(
      "Nao foi possivel conectar a API. Verifique se ela esta disponivel e se o CORS permite esta origem."
    );
  }

  const hasBody = response.status !== 204;
  const body = hasBody && isJsonResponse(response) ? await response.json() : null;

  if (!response.ok) {
    throw new Error(
      extractErrorMessage(body, `Requisicao falhou com status ${response.status}`)
    );
  }

  return body as T;
}

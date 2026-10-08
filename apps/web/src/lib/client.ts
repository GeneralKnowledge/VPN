/** Parse a fetch response as JSON without throwing on empty or non-JSON bodies (e.g. a proxy error page). */
export interface ApiResponse {
  ok?: boolean;
  error?: string;
  message?: string;
  redirectTo?: string;
  url?: string;
  id?: string;
  username?: string;
  password?: string;
  devResetUrl?: string;
}

export async function safeJson<T = ApiResponse>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return { error: res.ok ? undefined : "Something went wrong. Please try again." } as T & { error?: string };
  }
}

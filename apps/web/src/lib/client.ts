/** Parse a fetch response as JSON without throwing on empty or non-JSON bodies (e.g. a proxy error page). */
export async function safeJson<T = Record<string, unknown>>(res: Response): Promise<T & { error?: string }> {
  try {
    return (await res.json()) as T & { error?: string };
  } catch {
    return { error: res.ok ? undefined : "Something went wrong. Please try again." } as T & { error?: string };
  }
}

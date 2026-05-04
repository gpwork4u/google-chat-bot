export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!r.ok) {
    const text = await r.text().catch(() => r.statusText)
    throw new ApiError(r.status, text)
  }
  // 204 No Content
  if (r.status === 204) return undefined as unknown as T
  return r.json() as Promise<T>
}

export const fetcher = <T>(url: string) => api<T>(url)

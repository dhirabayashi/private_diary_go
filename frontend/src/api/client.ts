export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || 'error' in json) {
    const code = json?.error?.code ?? 'UNKNOWN'
    const message = json?.error?.message ?? res.statusText
    throw new ApiError(code, message, res.status)
  }
  return json.data as T
}

export async function fetchJson<T>(
  url: string,
  options: RequestInit & { params?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const { params, ...init } = options
  let fullUrl = url
  if (params) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v))
    }
    const s = qs.toString()
    if (s) fullUrl += '?' + s
  }
  const res = await fetch(fullUrl, {
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  })
  return handleResponse<T>(res)
}

export async function fetchForm<T>(url: string, body: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body })
  return handleResponse<T>(res)
}

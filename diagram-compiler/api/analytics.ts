type AnalyticsRequest = {
  method?: string;
  body?: unknown;
  on: (event: 'data' | 'end', cb: (chunk: Buffer | string) => void) => void;
};

type AnalyticsResponse = {
  status: (code: number) => { json: (payload: unknown) => void };
};

const readBody = async (req: AnalyticsRequest) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return new Promise<unknown>((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : null);
      } catch {
        resolve(null);
      }
    });
  });
};

export default async function handler(req: AnalyticsRequest, res: AnalyticsResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const payload = await readBody(req);
  if (!payload) {
    res.status(400).json({ ok: false, error: 'invalid_payload' });
    return;
  }

  // Structured JSON log for downstream ingestion/log drains.
  console.log(JSON.stringify({ type: 'analytics', payload }));

  res.status(200).json({ ok: true });
}

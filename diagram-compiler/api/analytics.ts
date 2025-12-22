const readBody = async (req: any) => {
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
      data += chunk;
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

export default async function handler(req: any, res: any) {
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

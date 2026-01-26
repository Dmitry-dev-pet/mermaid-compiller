type ShareQuery = { token?: string | string[] };

type ShareRequest = AsyncIterable<Uint8Array> & {
  method?: string;
  query?: ShareQuery;
};

type ShareResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

type SharePermission = 'viewer' | 'editor';

type ShareRecord = {
  project_id: string;
  expires_at?: string | null;
  permission: SharePermission;
  wrapped_project_key?: string | null;
};

type ProjectRecord = {
  id: string;
  title: string | null;
  blob: string;
  version: number;
  updated_at: string | null;
};

const readBody = async (req: ShareRequest) => {
  const buffers: Uint8Array[] = [];
  for await (const chunk of req) {
    buffers.push(chunk);
  }
  return Buffer.concat(buffers).toString('utf8');
};

const json = (res: ShareResponse, status: number, payload: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const sha256Hex = async (value: string) => {
  const data = Buffer.from(value, 'utf8');
  const hash = await import('node:crypto').then((m) => m.createHash('sha256').update(data).digest('hex'));
  return hash;
};

const supabaseRequest = async (path: string, init: RequestInit) => {
  const baseUrl = process.env.SUPABASE_URL || '';
  if (!baseUrl) throw new Error('SUPABASE_URL not configured');
  const url = `${baseUrl.replace(/\/$/, '')}/rest/v1/${path}`;
  return fetch(url, init);
};

const supabaseHeaders = (extra?: Record<string, string>) => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
};

const getShareRecord = async (token: string) => {
  const hash = await sha256Hex(token);
  const res = await supabaseRequest(
    `share_links?token_hash=eq.${hash}&disabled=is.false`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) throw new Error(`Share lookup failed: ${res.status}`);
  const rows = (await res.json()) as ShareRecord[];
  return rows[0] ?? null;
};

const getProject = async (projectId: string) => {
  const res = await supabaseRequest(
    `projects?id=eq.${projectId}`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) throw new Error(`Project lookup failed: ${res.status}`);
  const rows = (await res.json()) as ProjectRecord[];
  return rows[0] ?? null;
};

const updateProject = async (
  projectId: string,
  payload: { blob: string },
  baseVersion: number,
) => {
  const res = await supabaseRequest(
    `projects?id=eq.${projectId}&version=eq.${baseVersion}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        ...payload,
        version: baseVersion + 1,
        updated_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) throw new Error(`Project update failed: ${res.status}`);
  const rows = (await res.json()) as ProjectRecord[];
  return rows[0] ?? null;
};

export default async function handler(req: ShareRequest, res: ShareResponse) {
  try {
    const { method, query } = req;
    const token = Array.isArray(query?.token)
      ? query?.token[0]
      : query?.token;
    if (!token) return json(res, 400, { error: 'Missing token' });

    const share = await getShareRecord(token);
    if (!share) return json(res, 404, { error: 'Share not found' });
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
      return json(res, 410, { error: 'Share expired' });
    }

    if (method === 'GET') {
      const project = await getProject(share.project_id);
      if (!project) return json(res, 404, { error: 'Project not found' });
      return json(res, 200, {
        project: {
          id: project.id,
          title: project.title,
          blob: project.blob,
          version: project.version,
          updatedAt: project.updated_at,
        },
        permission: share.permission,
        wrappedProjectKey: share.wrapped_project_key ?? null,
      });
    }

    if (method === 'POST') {
      if (share.permission !== 'editor') {
        return json(res, 403, { error: 'Forbidden' });
      }
      const body = await readBody(req);
      const payload = JSON.parse(body || '{}') as {
        blob?: unknown;
        baseVersion?: unknown;
      };
      const blob = payload?.blob;
      const baseVersion = payload?.baseVersion;
      if (typeof blob !== 'string' || typeof baseVersion !== 'number') {
        return json(res, 400, { error: 'Invalid payload' });
      }
      const project = await updateProject(share.project_id, { blob }, baseVersion);
      if (!project) return json(res, 409, { error: 'Conflict' });
      return json(res, 200, {
        project: {
          id: project.id,
          title: project.title,
          version: project.version,
          updatedAt: project.updated_at,
        },
      });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Server error';
    return json(res, 500, { error: message });
  }
}

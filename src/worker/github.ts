const API = "https://api.github.com";
const UA = "moment-by-moment";

export async function exchangeCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description ?? "OAuth token exchange failed");
  return data.access_token;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": UA,
  };
}

export async function getLogin(token: string): Promise<string> {
  const res = await fetch(`${API}/user`, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub /user failed: ${res.status}`);
  return ((await res.json()) as { login: string }).login;
}

export function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

type Repo = { token: string; owner: string; repo: string; branch: string };

async function api<T>(r: Repo, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/repos/${r.owner}/${r.repo}${path}`, {
    method,
    headers: { ...headers(r.token), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/**
 * Add files in ONE commit (so a post with an image triggers one build), via the Git Data API.
 * `base64` content is passed through untouched to keep Worker CPU time low.
 * Returns the commit's html_url.
 */
export async function commitFiles(
  r: Repo,
  message: string,
  files: { path: string; base64: string }[],
): Promise<string> {
  const ref = await api<{ object: { sha: string } }>(r, "GET", `/git/ref/heads/${r.branch}`);
  const parent = await api<{ tree: { sha: string } }>(r, "GET", `/git/commits/${ref.object.sha}`);
  const blobs = await Promise.all(
    files.map((f) => api<{ sha: string }>(r, "POST", "/git/blobs", { content: f.base64, encoding: "base64" })),
  );
  const tree = await api<{ sha: string }>(r, "POST", "/git/trees", {
    base_tree: parent.tree.sha,
    tree: files.map((f, i) => ({ path: f.path, mode: "100644", type: "blob", sha: blobs[i]!.sha })),
  });
  const commit = await api<{ sha: string; html_url: string }>(r, "POST", "/git/commits", {
    message,
    tree: tree.sha,
    parents: [ref.object.sha],
  });
  // Not forced: fails cleanly if the branch moved meanwhile.
  await api(r, "PATCH", `/git/refs/heads/${r.branch}`, { sha: commit.sha });
  return commit.html_url;
}

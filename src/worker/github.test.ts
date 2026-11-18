import { afterEach, describe, expect, it, vi } from "vitest";
import { commitFiles, utf8ToBase64 } from "./github";

describe("commitFiles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("adds all files in one commit and fast-forwards the branch", async () => {
    const calls: { method: string; url: string; body: unknown }[] = [];
    const replies: Record<string, unknown> = {
      "GET /git/ref/heads/main": { object: { sha: "parent" } },
      "GET /git/commits/parent": { tree: { sha: "basetree" } },
      "POST /git/blobs": { sha: "blob" },
      "POST /git/trees": { sha: "newtree" },
      "POST /git/commits": { sha: "newcommit", html_url: "https://github.com/o/r/commit/newcommit" },
      "PATCH /git/refs/heads/main": {},
    };
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const path = url.replace("https://api.github.com/repos/o/r", "");
      const method = init.method ?? "GET";
      calls.push({ method, url: path, body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify(replies[`${method} ${path}`]), { status: 200 });
    });

    const url = await commitFiles({ token: "t", owner: "o", repo: "r", branch: "main" }, "msg", [
      { path: "content/posts/b/x.json", base64: utf8ToBase64("{}") },
      { path: "content/images/b/x.webp", base64: "UklGRg==" },
    ]);

    expect(url).toBe("https://github.com/o/r/commit/newcommit");
    expect(calls.filter((c) => c.url === "/git/blobs")).toHaveLength(2);
    expect(calls.find((c) => c.url === "/git/trees")?.body).toMatchObject({
      base_tree: "basetree",
      tree: [{ path: "content/posts/b/x.json" }, { path: "content/images/b/x.webp" }],
    });
    expect(calls.find((c) => c.url === "/git/commits")?.body).toMatchObject({ parents: ["parent"], tree: "newtree" });
    expect(calls.at(-1)).toMatchObject({ method: "PATCH", body: { sha: "newcommit" } });
  });

  it("encodes UTF-8 text", () => {
    expect(atob(utf8ToBase64("あ"))).toBe("\xe3\x81\x82");
  });
});

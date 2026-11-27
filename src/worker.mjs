// Infrastructure acceptance v1: read-only, isolated from production releases.
const prefix = "acceptance/";
const service = "supra-reportexcel";
const hash = /^[0-9a-f]{64}$/;
function json(request, data, status = 200, extra = {}) {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(data), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff", ...extra
    }
  });
}
const noRelease = request => json(request, {error:"NO_RELEASE", updates_enabled:false}, 404);
const unavailable = request => json(request, {error:"UNAVAILABLE"}, 503);
async function authorized(request, env) {
  // Candidate design: owner-provisioned 256-bit random bearer credential.
  // Only its SHA-256 is stored in the Worker secret; not in the public repo.
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "");
  if (!token || !hash.test(env.ACCEPTANCE_ACCESS_SHA256 || "")) return false;
  const got = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token[1])));
  const expected = Uint8Array.from(env.ACCEPTANCE_ACCESS_SHA256.match(/../g), x => parseInt(x, 16));
  let diff = 0;
  for (let i=0;i<32;i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!["GET", "HEAD"].includes(request.method)) return json(request, {error:"METHOD_NOT_ALLOWED"}, 405, {allow:"GET, HEAD"});
    const enabled = env.ACCEPTANCE_ENABLED === "1" && hash.test(env.ACCEPTANCE_ACCESS_SHA256 || "");
    if (path === "/" || path === "/health") {
      if (!env.RELEASES) return json(request, {service,status:"unavailable",storage:"not_bound",updates_enabled:false}, 503);
      try {
        const m = await env.RELEASES.head(prefix + "manifest.json");
        return json(request, {service,status:"ok",storage:"ready",channel:"acceptance",worker_version:1,updates_enabled:enabled && !!m});
      } catch { return json(request, {service,status:"unavailable",storage:"error",updates_enabled:false}, 503); }
    }
    const object = /^\/objects\/([0-9a-f]{64})$/.exec(path);
    if (path !== "/manifest.json" && !object) return json(request,{error:"NOT_FOUND"},404);
    if (!enabled) return path === "/manifest.json" ? noRelease(request) : json(request,{error:"NOT_FOUND"},404);
    // Check authorization before touching R2. Never use User-Agent as authentication.
    try {
      if (!await authorized(request, env)) return json(request,{error:"UNAUTHORIZED"},401,{"www-authenticate":"Bearer"});
      if (!env.RELEASES) return unavailable(request);
      const key = prefix + (object ? "objects/" + object[1] : "manifest.json");
      const max = object ? 64*1024*1024 : 64*1024;
      const result = request.method === "HEAD" ? await env.RELEASES.head(key) : await env.RELEASES.get(key);
      if (!result) return object ? json(request,{error:"NOT_FOUND"},404) : noRelease(request);
      if (!Number.isSafeInteger(result.size) || result.size <= 0 || result.size > max) {
        if (result.body) await result.body.cancel();
        return unavailable(request);
      }
      return new Response(request.method === "HEAD" ? null : result.body, {status:200,headers:{
        "content-type":object ? "application/octet-stream" : "application/json; charset=utf-8",
        "content-length":String(result.size),"cache-control":"no-store","x-content-type-options":"nosniff"
      }});
    } catch { return unavailable(request); }
  }
};

const service = "supra-reportexcel";
function json(request, data, status = 200, extra = {}) {
  return new Response(request.method === "HEAD" ? null : JSON.stringify(data), {
    status, headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra
    }
  });
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!["GET", "HEAD"].includes(request.method))
      return json(request, {error: "METHOD_NOT_ALLOWED"}, 405, {allow: "GET, HEAD"});
    if (path === "/" || path === "/health") {
      if (!env.RELEASES)
        return json(request, {service, status: "unavailable", storage: "not_bound", updates_enabled: false}, 503);
      try {
        await env.RELEASES.head("manifest.json");
        return json(request, {service, status: "ok", storage: "ready", updates_enabled: false});
      } catch {
        return json(request, {service, status: "unavailable", storage: "error", updates_enabled: false}, 503);
      }
    }
    if (path === "/manifest.json")
      return json(request, {error: "NO_RELEASE", updates_enabled: false}, 404);
    return json(request, {error: "NOT_FOUND"}, 404);
  }
};

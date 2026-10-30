// Cloudflare Pages Function: proxy to TMDB API (keeps key server-side)
// Edge-caches TMDB responses so repeat loads don't hit TMDB every time.
function parseParams(url) {
  const p = new URLSearchParams(url.search);
  p.delete("path");
  return p;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "/trending/all/week";

  // Cache key excludes api_key (secret never part of the key).
  const cacheKey = new Request("https://api.themoviedb.org/3" + path + "?" + parseParams(url).toString());

  try {
    if (typeof caches !== "undefined") {
      const cached = await caches.default.match(cacheKey);
      if (cached) return cached;
    }
  } catch (e) {
    /* cache unavailable -> fall through to fetch */
  }

  const params = parseParams(url);
  params.set("api_key", env.TMDB_API_KEY);
  const tmdbUrl = "https://api.themoviedb.org/3" + path + "?" + params.toString();

  try {
    const resp = await fetch(tmdbUrl);
    const json = await resp.json();
    const out = Response.json(json, {
      status: resp.status,
      headers: {
        "Cache-Control": "public, s-maxage=21600, max-age=3600",
      },
    });
    if (resp.ok && typeof caches !== "undefined") {
      try { await caches.default.put(cacheKey, out.clone()); } catch (e) {}
    }
    return out;
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}

// Cloudflare Pages Function: proxy to TMDB API (keeps key server-side)
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "/trending/all/week";
  const params = new URLSearchParams(url.search);
  params.delete("path");
  params.set("api_key", env.TMDB_API_KEY);
  const tmdbUrl = "https://api.themoviedb.org/3" + path + "?" + params.toString();
  try {
    const resp = await fetch(tmdbUrl);
    const json = await resp.json();
    return Response.json(json, { status: resp.status });
  } catch (e) {
    return Response.json({ error: String(e), }, { status: 502 });
  }
}

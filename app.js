(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const IMG = "https://image.tmdb.org/t/p/";
  const state = { asal: "all", genre: "all", query: "", genres: {}, items: [] };

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  // ---- TMDB via proxy ----
  function apiUrl(path, params = {}) {
    const u = new URL("/api/tmdb", location.origin);
    u.searchParams.set("path", path);
    Object.entries(Object.assign({ language: "id-ID" }, params)).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  }
  async function tmdb(path, params = {}) {
    const r = await fetch(apiUrl(path, params));
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  const KOREAN = "ko", CHINESE = "zh";

  function discoverFor(asal, page = 1) {
    const base = asal === "film" ? "/discover/movie" : "/discover/tv";
    const p = { page, sort_by: "popularity.desc", "vote_count.gte": 50 };
    if (asal === "drakor") p["with_original_language"] = KOREAN;
    if (asal === "dracin") p["with_original_language"] = CHINESE;
    if (asal === "all") return "/trending/all/week";
    return { base, p };
  }

  // ---- rendering ----
  function posterStyle(media) {
    return media === "movie"
      ? "linear-gradient(150deg,#1a1030 0%,#3b1f5e 55%,#6b2d8f 100%)"
      : "linear-gradient(150deg,#06202a 0%,#0c4a5e 55%,#0e6f8a 100%)";
  }

  function itemPosterHTML(t) {
    const hasPoster = t.poster_path || t.backdrop_path;
    const url = hasPoster ? (t.poster_path || t.backdrop_path) : null;
    if (url) {
      return `<div class="card-poster" style="background:${posterStyle(t.media_type)}">
        <img class="poster-img" src="${IMG}w342${esc(url)}" alt="${esc(t.title || t.name)}" loading="lazy" decoding="async" onerror="this.style.display='none'">
      </div>`;
    }
    return `<div class="card-poster" style="background:${posterStyle(t.media_type)}">
      <span class="card-poster-title">${esc(t.title || t.name)}</span>
    </div>`;
  }

  function badgeHTML(media) {
    if (media === "movie") return '<span class="badge badge-dracin">Film</span>';
    return '<span class="badge badge-drakor">Drama</span>';
  }

  function cardHTML(t) {
    const title = t.title || t.name;
    const year = (t.release_date || t.first_air_date || "").slice(0, 4);
    const href = `drama.html?id=${t.id}&media=${t.media_type}`;
    return `<a class="card" href="${href}">
      ${itemPosterHTML(t)}
      <div class="card-body">
        <h3>${esc(title)}</h3>
        <div class="genre-tags">${(t.genre_ids || []).slice(0, 3).map((g) => `<span class="genre-tag">${esc(state.genres[g] || "?")}</span>`).join("")}</div>
      </div>
      <div class="card-meta"><span class="card-year">${year}</span>${badgeHTML(t.media_type)}</div>
    </a>`;
  }

  function setGenreFilter() {
    const opts = Object.entries(state.genres).sort((a, b) => a[1].localeCompare(b[1]));
    $("#genre-filter").innerHTML = '<option value="all">Semua Genre</option>' +
      opts.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join("");
  }

  function filterByGenre(list) {
    if (state.genre === "all") return list;
    return list.filter((x) => (x.genre_ids || []).includes(Number(state.genre)));
  }

  function renderItems(items) {
    const list = filterByGenre(items);
    state.items = list;
    $("#grid").innerHTML = list.map(cardHTML).join("") || '<p class="empty">Tidak ada hasil.</p>';
    $("#result-info").textContent = `Menampilkan ${list.length} judul`;
    $("#empty").hidden = list.length > 0;
  }

  async function renderHome(trend) {
    const results = trend.results || [];
    // Hero: trending all
    const hero = results.find((x) => x.backdrop_path) || results[0];
    const heroTitle = hero.title || hero.name;
    const heroYear = (hero.release_date || hero.first_air_date || "").slice(0, 4);
    $("#hero-title").textContent = heroTitle;
    $("#hero-meta").innerHTML = `${heroYear} · ${esc(hero.media_type === "movie" ? "Film" : "Drama (TV)")}`;
    $("#hero-desc").textContent = hero.overview || "";
    $("#hero-actions").innerHTML = `
      <a class="btn btn-primary" href="drama.html?id=${hero.id}&media=${hero.media_type}">▶ Nonton Trailer</a>
      <a class="btn btn-ghost" href="drama.html?id=${hero.id}&media=${hero.media_type}">Detail</a>`;

    // Featured editor picks
    const picks = results.slice(0, 8);
    $("#featured").innerHTML = picks.map((t) => cardHTML(Object.assign(t, { media_type: t.media_type || "tv" }))).join("");
    wireCarousel($("#featured"), $("#feat-prev"), $("#feat-next"));

    // Initial catalog grid reuses the same trending payload (no extra request)
    renderItems(results.filter((x) => x.media_type === "movie" || x.media_type === "tv"));
  }

  function wireCarousel(track, prevBtn, nextBtn) {
    if (!prevBtn || !nextBtn) return;
    const step = () => {
      const card = track.querySelector(".card");
      return card ? card.getBoundingClientRect().width + 14 : 220;
    };
    const update = () => {
      prevBtn.disabled = track.scrollLeft <= 0;
      nextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    };
    nextBtn.addEventListener("click", () => { track.scrollBy({ left: step(), behavior: "smooth" }); });
    prevBtn.addEventListener("click", () => { track.scrollBy({ left: -step(), behavior: "smooth" }); });
    track.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  async function renderCatalog(page = 1) {
    $("#grid").innerHTML = '<p class="empty">Memuat...</p>';
    try {
      if (state.query) {
        const q = await tmdb("/search/multi", { query: state.query });
        const items = (q.results || []).filter((x) => x.media_type === "movie" || x.media_type === "tv");
        renderItems(items);
      } else {
        const d = discoverFor(state.asal);
        const data = d.base ? await tmdb(d.base, d.p) : await tmdb(d);
        const items = (data.results || []).map((x) => Object.assign(x, { media_type: x.media_type || (state.asal === "film" ? "movie" : "tv") }));
        renderItems(items);
      }
    } catch (e) {
      $("#grid").innerHTML = '<p class="empty">Gagal memuat: ' + esc(e.message) + "</p>";
    }
  }

  async function initHome() {
    // Fire all initial network requests in parallel for the fastest first paint.
    let genresTv = {}, genresMv = {}, trend = { results: [] };
    try {
      const settled = await Promise.allSettled([
        tmdb("/genre/tv/list"),
        tmdb("/genre/movie/list"),
        tmdb("/trending/all/week"),
      ]);
      if (settled[0].status === "fulfilled") genresTv = settled[0].value;
      if (settled[1].status === "fulfilled") genresMv = settled[1].value;
      if (settled[2].status === "fulfilled") trend = settled[2].value;
    } catch (e) {}

    try {
      const g = {};
      [...(genresTv.genres || []), ...(genresMv.genres || [])].forEach((x) => { g[x.id] = x.name; });
      state.genres = g;
      setGenreFilter();
    } catch (e) {}

    // Tabs: all / drakor / dracin / film
    $$("#tab-asal .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$("#tab-asal .tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        state.asal = tab.dataset.asal;
        state.query = "";
        $("#search").value = "";
        renderCatalog();
      });
    });

    $$("[data-nav]").forEach((link) => {
      link.addEventListener("click", () => {
        const a = link.dataset.nav;
        $$("#tab-asal .tab").forEach((t) => t.classList.toggle("active", t.dataset.asal === a));
        state.asal = a; state.query = ""; $("#search").value = "";
        renderCatalog();
      });
    });

    $("#search").addEventListener("input", (e) => { state.query = e.target.value; renderCatalog(); });
    $("#genre-filter").addEventListener("change", (e) => { state.genre = e.target.value; renderCatalog(); });

    await renderHome(trend);
  }

  // ---- detail ----
  async function initDetail() {
    const id = new URLSearchParams(window.location.search).get("id");
    const media = new URLSearchParams(window.location.search).get("media") === "movie" ? "movie" : "tv";
    const d = await tmdb(`/${media}/${id}`, { append_to_response: "videos,credits,recommendations" });

    $("#detail-badge").innerHTML = badgeHTML(media);
    $("#detail-title").textContent = d.title || d.name;
    const year = (d.release_date || d.first_air_date || "").slice(0, 4);
    const country = (d.production_countries || []).map((c) => c.name).join(", ");
    const cast = (d.credits && d.credits.cast ? d.credits.cast.slice(0, 5) : []).map((c) => c.name).join(", ");
    $("#detail-meta").innerHTML = `${year} · ${esc(country)} · ${esc(cast)}`;
    $("#detail-genres").innerHTML = (d.genres || []).map((g) => `<span class="genre-tag">${esc(g.name)}</span>`).join("");
    $("#detail-sinopsis").textContent = d.overview || "";

    $("#detail-poster").style.background = posterStyle(media);
    if (d.poster_path) {
      $("#detail-poster").innerHTML = `<img class="poster-img detail-poster-img" src="${IMG}w500${esc(d.poster_path)}" alt="${esc(d.title || d.name)}">`;
    } else {
      $("#detail-poster").innerHTML = `<span class="card-poster-title">${esc(d.title || d.name)}</span>`;
    }

    document.title = (d.title || d.name) + " — DramaHub";

    // trailer (fallback to en-US request videos are often English-only)
    let vid = ((d.videos && d.videos.results) || []).find((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));
    if (!vid) {
      try {
        const vres = await tmdb(`/${media}/${id}/videos`, { language: "en-US" });
        vid = (vres.results || []).find((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));
      } catch (e) {}
    }
    if (vid) {
      $("#player").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${esc(vid.key)}?rel=0" title="Trailer" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    } else {
      $("#player").innerHTML = '<p class="empty">Trailer tidak tersedia.</p>';
    }

    // watch providers (legal links)
    let provHTML = "";
    try {
      const wp = await tmdb(`/${media}/${id}/watch/providers`);
      const pr = (wp.results && (wp.results["ID"] || wp.results["US"])) || null;
      if (pr && (pr.flatrate || pr.rent || pr.buy)) {
        const list = pr.flatrate || pr.rent || pr.buy;
        provHTML = '<div class="platform-links">' + list.slice(0, 5).map((p) => {
          const name = esc(p.provider_name);
          const icon = p.logo_path ? `<img class="prov-logo" src="${IMG}w92${esc(p.logo_path)}" alt="${name}">` : "";
          return `<a class="platform-link prov-link" href="https://www.themoviedb.org/${media}/${id}/watch" target="_blank" rel="noopener noreferrer">${icon}<span>${name}</span></a>`;
        }).join("") + '</div>';
      } else {
        provHTML = '<p class="muted">Info platform nonton tidak tersedia di TMDB.</p>';
      }
    } catch (e) {
      provHTML = '<p class="muted">Info platform nonton tidak tersedia.</p>';
    }
    $("#detail-platforms").innerHTML = provHTML;

    // related
    const rel = (d.recommendations && d.recommendations.results || []).slice(0, 6).map((x) => Object.assign(x, { media_type: media }));
    $("#related").innerHTML = rel.map(cardHTML).join("") || '<p class="empty">Tidak ada rekomendasi.</p>';

    $("#detail").hidden = false;
  }

  // ---- boot ----
  (async () => {
    $("#year").textContent = new Date().getFullYear();
    if (location.pathname.includes("drama.html") || location.search.includes("id=")) {
      await initDetail();
    } else {
      await initHome();
    }
  })();
})();

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const IMG = "https://image.tmdb.org/t/p/";
  const state = { asal: "all", genre: "all", query: "", genres: {}, items: [] };

  // ---- local persistence (favorites + history) ----
  const FAV_KEY = "dh_favs", HIST_KEY = "dh_history";
  function loadList(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
  function saveList(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getFavs() { return loadList(FAV_KEY); }
  function isFav(id, media) { return getFavs().some((f) => f.id === id && f.media === media); }
  function toggleFav(id, media, title, poster, year) {
    const favs = getFavs();
    const i = favs.findIndex((f) => f.id === id && f.media === media);
    if (i >= 0) favs.splice(i, 1); else favs.unshift({ id, media, title, poster, year });
    saveList(FAV_KEY, favs);
    renderPersonalRows();
  }
  function pushHistory(d, media) {
    const h = loadList(HIST_KEY).filter((x) => !(x.id === d.id && x.media === media));
    h.unshift({ id: d.id, media, title: d.title || d.name, poster: d.poster_path || "", year: (d.release_date || d.first_air_date || "").slice(0, 4) });
    saveList(HIST_KEY, h.slice(0, 12));
  }
  function skeletonHTML(n) {
    return Array.from({ length: n }, () =>
      '<div class="card skeleton-card"><div class="card-poster"><div class="phantom pp"></div></div>' +
      '<div class="card-body"><div class="phantom ln"></div><div class="phantom ln s"></div></div></div>'
    ).join("");
  }
  function setMeta(name, content) {
    const m = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    if (m && content) m.setAttribute("content", content);
  }

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
    return media === "movie" ? "#1d1b20" : "#1a1b20";
  }

  function itemPosterHTML(t) {
    const hasPoster = t.poster_path || t.backdrop_path;
    const url = hasPoster ? (t.poster_path || t.backdrop_path) : null;
    const overlay = '<span class="card-hover"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>Nonton</span></span>';
    const favBtn =
      '<button type="button" class="fav-btn' + (isFav(t.id, t.media_type) ? " on" : "") + '"' +
      ' data-id="' + t.id + '" data-media="' + esc(t.media_type) + '"' +
      ' data-title="' + esc(t.title || t.name) + '"' +
      ' data-poster="' + esc((t.poster_path || t.backdrop_path) || "") + '"' +
      ' data-year="' + (t.release_date || t.first_air_date || "").slice(0, 4) + '"' +
      ' aria-label="Simpan ke favorit">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.6-9.5-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 9.5 6C19 16.4 12 21 12 21z"/></svg>' +
      '</button>';
    if (url) {
      return `<div class="card-poster" style="background:${posterStyle(t.media_type)}">
        <img class="poster-img" src="${IMG}w342${esc(url)}" alt="${esc(t.title || t.name)}" loading="lazy" decoding="async" onerror="this.style.display='none'">
        ${favBtn}
        ${overlay}
      </div>`;
    }
    return `<div class="card-poster" style="background:${posterStyle(t.media_type)}">
      <span class="card-poster-title">${esc(t.title || t.name)}</span>
      ${favBtn}
      ${overlay}
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
    const box = $("#genre-chips");
    if (!box) return;
    const list = [["all", "Semua"], ...Object.entries(state.genres).sort((a, b) => a[1].localeCompare(b[1]))];
    box.innerHTML = "";
    list.forEach(([id, name]) => {
      const c = document.createElement("button");
      c.type = "button";
      c.className = "chip" + (id === "all" ? " active" : "");
      c.dataset.genre = id;
      c.textContent = name;
      c.addEventListener("click", () => {
        state.genre = id;
        box.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === c));
        renderCatalog();
      });
      box.appendChild(c);
    });
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
    if (hero.backdrop_path) {
      $("#hero-backdrop").style.backgroundImage = `url("${IMG}w1280${esc(hero.backdrop_path)}")`;
    }
    const heroTitle = hero.title || hero.name;
    const heroYear = (hero.release_date || hero.first_air_date || "").slice(0, 4);
    $("#hero-title").textContent = heroTitle;
    $("#hero-meta").innerHTML = `${heroYear} · ${esc(hero.media_type === "movie" ? "Film" : "Drama (TV)")}`;
    $("#hero-desc").textContent = hero.overview || "";
    const playIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    $("#hero-actions").innerHTML = `
      <a class="btn btn-primary" href="drama.html?id=${hero.id}&media=${hero.media_type}&autoplay=1">${playIcon}<span>Nonton Trailer</span></a>
      <a class="btn btn-ghost" href="drama.html?id=${hero.id}&media=${hero.media_type}">Detail</a>`;

    // Featured editor picks
    const picks = results.slice(0, 8);
    $("#featured").innerHTML = picks.map((t) => cardHTML(Object.assign(t, { media_type: t.media_type || "tv" }))).join("");
    wireCarousel($("#featured"), $("#feat-prev"), $("#feat-next"), $("#feat-dots"));

    // Initial catalog grid reuses the same trending payload (no extra request)
    renderItems(results.filter((x) => x.media_type === "movie" || x.media_type === "tv"));
  }

  function wireCarousel(track, prevBtn, nextBtn, dotsEl) {
    if (!prevBtn || !nextBtn) return;
    const step = () => {
      const card = track.querySelector(".card");
      return card ? card.getBoundingClientRect().width + 18 : 180;
    };
    const dots = [];
    const cards = track.querySelectorAll(".card");
    if (dotsEl) {
      if (cards.length > 1) {
        cards.forEach((_, i) => {
          const d = document.createElement("button");
          d.type = "button";
          d.className = "dot";
          d.setAttribute("aria-label", "Geser ke item " + (i + 1));
          d.addEventListener("click", () => { track.scrollTo(i * step(), 0); setActive(); });
          dotsEl.appendChild(d);
          dots.push(d);
        });
      } else {
        dotsEl.hidden = true;
      }
    }
    const setActive = () => {
      const w = step();
      const idx = track.scrollLeft <= 0 ? 0 : Math.min(dots.length - 1, Math.round(track.scrollLeft / w));
      prevBtn.disabled = track.scrollLeft <= 0;
      nextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      dots.forEach((d, i) => d.classList.toggle("active", i === idx));
    };
    nextBtn.addEventListener("click", () => { track.scrollBy(step(), 0); setActive(); });
    prevBtn.addEventListener("click", () => { track.scrollBy(-step(), 0); setActive(); });
    track.addEventListener("scroll", setActive, { passive: true });
    window.addEventListener("resize", setActive);
    setActive();
  }

  async function renderCatalog(page = 1) {
    $("#grid").innerHTML = skeletonHTML(12);
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
      $("#grid").innerHTML =
        '<p class="empty">Gagal memuat katalog.</p>' +
        '<div class="retry-wrap"><button type="button" class="btn btn-ghost btn-sm" id="retry-btn">Coba Lagi</button></div>';
      const rb = document.getElementById("retry-btn");
      if (rb) rb.addEventListener("click", () => renderCatalog());
    }
  }

  async function initHome() {
    // Prefill catalog with skeleton while data loads.
    $("#grid").innerHTML = skeletonHTML(12);
    // Fire all initial network requests in parallel for the fastest first paint.
    let genresTv = {}, genresMv = {}, trend = { results: [] }, newMovies = [], newShows = [];
    try {
      const settled = await Promise.allSettled([
        tmdb("/genre/tv/list"),
        tmdb("/genre/movie/list"),
        tmdb("/trending/all/week"),
        tmdb("/movie/now_playing", { language: "id-ID", region: "ID" }),
        tmdb("/tv/on_the_air", { language: "id-ID" }),
      ]);
      if (settled[0].status === "fulfilled") genresTv = settled[0].value;
      if (settled[1].status === "fulfilled") genresMv = settled[1].value;
      if (settled[2].status === "fulfilled") trend = settled[2].value;
      if (settled[3].status === "fulfilled") newMovies = (settled[3].value.results || []);
      if (settled[4].status === "fulfilled") newShows = (settled[4].value.results || []);
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

    await renderHome(trend);
    renderNewRow(newMovies, newShows);
    buildGenreRows([
      ...trend.results.map((x) => Object.assign({}, x, { media_type: x.media_type || (x.title ? "movie" : "tv") })),
      ...newMovies, ...newShows,
    ]);
    renderPersonalRows();
  }

  function buildGenreRows(allItems) {
    const box = $("#genre-rows");
    if (!box) return;
    box.innerHTML = "";
    const counts = {};
    allItems.forEach((t) => {
      (t.genre_ids || []).forEach((g) => { if (state.genres[g]) counts[g] = (counts[g] || 0) + 1; });
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 4).slice(0, 2);
    if (!top.length) { box.hidden = true; return; }
    box.hidden = false;
    const chev = (dir) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${dir === "l" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"}"/></svg>`;
    top.forEach(([gid], i) => {
      const gname = state.genres[gid] || gid;
      const items = allItems.filter((t) => (t.genre_ids || []).includes(Number(gid))).slice(0, 10);
      if (!items.length) return;
      const sec = document.createElement("section");
      sec.className = "row";
      sec.innerHTML =
        `<div class="row-head"><h2 class="row-title">${esc(gname)}</h2>` +
        `<div class="carousel-controls"><button type="button" class="ctrl-btn" id="g${i}-prev" aria-label="Geser ke kiri">${chev("l")}</button>` +
        `<button type="button" class="ctrl-btn" id="g${i}-next" aria-label="Geser ke kanan">${chev("r")}</button></div></div>` +
        `<div class="carousel" id="g${i}-track"></div><div class="carousel-dots" id="g${i}-dots"></div>`;
      box.appendChild(sec);
      const track = sec.querySelector(".carousel");
      track.innerHTML = items.map(cardHTML).join("");
      wireCarousel(track, document.getElementById(`g${i}-prev`), document.getElementById(`g${i}-next`), document.getElementById(`g${i}-dots`));
    });
  }

  let _rrId = 0;
  function pushRow(box, title, items, prefix) {
    if (!items.length) return;
    const i = _rrId++;
    const sec = document.createElement("section");
    sec.className = "row";
    const chev = (dir) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="${dir === "l" ? "15 18 9 12 15 6" : "9 18 15 12 9 6"}"/></svg>`;
    sec.innerHTML =
      `<div class="row-head"><h2 class="row-title">${esc(title)}</h2>` +
      `<div class="carousel-controls"><button type="button" class="ctrl-btn" id="${prefix}-${i}-prev" aria-label="Geser ke kiri">${chev("l")}</button>` +
      `<button type="button" class="ctrl-btn" id="${prefix}-${i}-next" aria-label="Geser ke kanan">${chev("r")}</button></div></div>` +
      `<div class="carousel"></div><div class="carousel-dots"></div>`;
    box.appendChild(sec);
    const track = sec.querySelector(".carousel");
    track.innerHTML = items.map(cardHTML).join("");
    wireCarousel(track, document.getElementById(`${prefix}-${i}-prev`), document.getElementById(`${prefix}-${i}-next`), sec.querySelector(".carousel-dots"));
  }

  function renderPersonalRows() {
    const box = $("#personal-rows");
    if (!box) return;
    box.innerHTML = "";
    const hist = loadList(HIST_KEY).map((h) => ({ id: h.id, media_type: h.media, title: h.title, poster_path: h.poster || null, release_date: h.year, genre_ids: [] }));
    const favs = getFavs().map((f) => ({ id: f.id, media_type: f.media, title: f.title, poster_path: f.poster || null, release_date: f.year, genre_ids: [] }));
    pushRow(box, "Lanjut Nonton", hist, "hist");
    pushRow(box, "Favoritku", favs, "fav");
    box.hidden = !box.children.length;
  }

  function renderNewRow(movies, shows) {
    const sec = $("#newrow-section");
    const track = $("#newrow");
    if (!sec || !track) return;
    const list = [
      ...movies.map((x) => Object.assign({}, x, { media_type: "movie" })),
      ...shows.map((x) => Object.assign({}, x, { media_type: "tv" })),
    ].slice(0, 10);
    if (!list.length) { sec.hidden = true; return; }
    sec.hidden = false;
    track.innerHTML = list.map(cardHTML).join("");
    wireCarousel(track, $("#new-prev"), $("#new-next"), $("#new-dots"));
  }

  // ---- detail ----
  async function initDetail() {
    const id = new URLSearchParams(window.location.search).get("id");
    const media = new URLSearchParams(window.location.search).get("media") === "movie" ? "movie" : "tv";
    const d = await tmdb(`/${media}/${id}`, { append_to_response: "videos,credits,recommendations,seasons" });

    $("#detail-badge").innerHTML = badgeHTML(media);
    $("#detail-title").textContent = d.title || d.name;
    const year = (d.release_date || d.first_air_date || "").slice(0, 4);
    const mins = media === "movie" ? d.runtime : (d.episode_run_time || [])[0];
    let runtimeStr = "";
    if (mins) {
      const h = Math.floor(mins / 60), m = mins % 60;
      runtimeStr = h ? `${h}j ${m}m` : `${m}m`;
    }
    const eps = media === "tv" && d.number_of_episodes ? `${d.number_of_episodes} episode` : "";
    const statusMap = { "Returning Series": "Masih Tayang", "Ended": "Selesai", "Planned": "Rencana", "In Production": "Produksi", "Canceled": "Dibatalkan" };
    const statusStr = statusMap[d.status] || d.status || "";
    const ratingStr = d.vote_average ? `${d.vote_average.toFixed(1)}/10` : "";
    const country = (d.production_countries || []).map((c) => c.name).join(", ");
    const cast = (d.credits && d.credits.cast ? d.credits.cast.slice(0, 5) : []).map((c) => c.name).join(", ");
    $("#detail-meta").innerHTML = [year, ratingStr, statusStr, runtimeStr, eps, country, cast]
      .filter(Boolean).map(esc).join(" · ");
    $("#detail-genres").innerHTML = (d.genres || []).map((g) => `<span class="genre-tag">${esc(g.name)}</span>`).join("");
    $("#detail-sinopsis").textContent = d.overview || "";

    $("#detail-poster").style.background = posterStyle(media);
    if (d.poster_path) {
      $("#detail-poster").innerHTML = `<img class="poster-img detail-poster-img" src="${IMG}w500${esc(d.poster_path)}" alt="${esc(d.title || d.name)}">`;
    } else {
      $("#detail-poster").innerHTML = `<span class="card-poster-title">${esc(d.title || d.name)}</span>`;
    }
    const bd = $("#detail-backdrop");
    if (bd) {
      const src = d.backdrop_path || d.poster_path;
      if (src) bd.style.backgroundImage = `url("${IMG}w780${esc(src)}")`;
    }

    document.title = (d.title || d.name) + " — DramaHub";
    pushHistory(d, media);
    setMeta("og:title", d.title || d.name);
    setMeta("og:description", (d.overview || "").slice(0, 160));
    if (d.poster_path) setMeta("og:image", `${IMG}w500${esc(d.poster_path)}`);

    // trailer (fallback to en-US request videos are often English-only)
    let vid = ((d.videos && d.videos.results) || []).find((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));
    if (!vid) {
      try {
        const vres = await tmdb(`/${media}/${id}/videos`, { language: "en-US" });
        vid = (vres.results || []).find((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));
      } catch (e) {}
    }
    // player: EmbedPlayer (ala IDLIX) — trailer sebagai sumber default, bisa ditambah via window.DRAMAHUB_SOURCES
    const playerEl = $("#player");
    const epSources = [];
    if (vid) {
      epSources.push({ label: "Trailer Resmi", kind: "iframe", src: `https://www.youtube.com/embed/${esc(vid.key)}?rel=0` });
    }
    if (window.EmbedPlayer) {
      const autoPlay = new URLSearchParams(window.location.search).get("autoplay") === "1";
      new window.EmbedPlayer(playerEl, {
        title: d.title || d.name,
        poster: d.poster_path ? `${IMG}w500${esc(d.poster_path)}` : "",
        sources: epSources,
        autoPlay: autoPlay,
      });
    } else if (vid) {
      playerEl.innerHTML = `<iframe src="https://www.youtube.com/embed/${esc(vid.key)}?rel=0" title="Trailer" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    } else {
      playerEl.innerHTML = '<p class="empty">Trailer tidak tersedia.</p>';
    }

    // Escape hatch: kalau embed diblokir browser, tetap bisa nonton via link resmi.
    if (vid) {
      const ext = $("#trailer-ext");
      if (ext) {
        const a = ext.querySelector("a");
        if (a) a.href = `https://www.youtube.com/watch?v=${esc(vid.key)}`;
        ext.hidden = false;
      }
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

    // cast grid
    const castEl = $("#detail-cast");
    if (castEl) {
      const castList = ((d.credits && d.credits.cast) || []).slice(0, 8);
      if (!castList.length) {
        castEl.hidden = true;
      } else {
        castEl.hidden = false;
        castEl.innerHTML = castList.map((c) =>
          `<a class="cast-card" href="https://www.themoviedb.org/person/${c.id}" target="_blank" rel="noopener noreferrer">` +
          `<div class="cast-photo" style="background-image:url('${IMG}w185${esc(c.profile_path)}')">${c.profile_path ? "" : esc((c.name || "?")[0])}</div>` +
          `<strong>${esc(c.name)}</strong><span>${esc(c.character || "")}</span></a>`
        ).join("");
      }
    }

    // detail favorite button
    const favBtn = $("#detail-fav-btn");
    if (favBtn) {
      const refresh = () => {
        const on = isFav(d.id, media);
        const heart = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.6-9.5-9A5.4 5.4 0 0 1 12 6a5.4 5.4 0 0 1 9.5 6C19 16.4 12 21 12 21z"/></svg>';
        favBtn.classList.toggle("on", on);
        favBtn.innerHTML = heart + " <span>" + (on ? "Tersimpan" : "Simpan") + "</span>";
      };
      refresh();
      favBtn.addEventListener("click", () => { toggleFav(d.id, media, d.title || d.name, d.poster_path || "", year); refresh(); });
    }

    await renderStreaming(d, media);

    $("#detail").hidden = false;
  }

  // ---- streaming section: episodes (legal, from TMDB) ----
  async function renderStreaming(d, media) {
    const sec = $("#episodes-section");
    if (media !== "tv" || !d) {
      sec.hidden = true;
      return;
    }
    const seasons = (d.seasons || []).filter((s) => s.season_number > 0);
    if (!seasons.length) {
      sec.hidden = true;
      return;
    }
    sec.hidden = false;

    const tabs = $("#season-tabs");
    tabs.innerHTML = seasons.map((s, i) =>
      `<button type="button" class="tab${i === 0 ? " active" : ""}" data-season="${s.season_number}">Season ${s.season_number}</button>`
    ).join("");

    const loadSeason = async (seasonNumber) => {
      const grid = $("#episodes");
      grid.innerHTML = '<p class="empty">Memuat episode...</p>';
      try {
        const se = await tmdb(`/${media}/${d.id}/season/${seasonNumber}`, { language: "id-ID" });
        const eps = se.episodes || [];
        if (!eps.length) {
          grid.innerHTML = '<p class="empty">Belum ada episode.</p>';
          return;
        }
        grid.innerHTML = eps.map((ep) => {
          const still = ep.still_path ? `${IMG}w300${esc(ep.still_path)}` : null;
          const date = (ep.air_date || "").slice(0, 10);
          const href = `https://www.themoviedb.org/${media}/${d.id}/season/${seasonNumber}/episode/${ep.episode_number}`;
          return `<a class="ep-card" href="${href}" target="_blank" rel="noopener noreferrer">
            ${still
              ? `<div class="ep-thumb" style="background-image:url('${still}')"></div>`
              : `<div class="ep-thumb ep-thumb-empty">E${ep.episode_number}</div>`}
            <div class="ep-body">
              <span class="ep-num">E${ep.episode_number}</span>
              <strong>${esc(ep.name || "Episode " + ep.episode_number)}</strong>
              <span class="muted">${esc(date || "—")}</span>
            </div>
          </a>`;
        }).join("");
      } catch (e) {
        grid.innerHTML = '<p class="empty">Gagal memuat episode.</p>';
      }
    };

    tabs.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => {
        tabs.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        loadSeason(Number(t.dataset.season));
      });
    });

    await loadSeason(seasons[0].season_number);
  }

  // ---- delegated clicks: favorite buttons ----
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".fav-btn");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const { id, media, title, poster, year } = b.dataset;
    toggleFav(Number(id), media, title, poster, year);
    b.classList.toggle("on", isFav(Number(id), media));
  });

  // ---- boot ----
  (async () => {
    $("#year").textContent = new Date().getFullYear();
    if (location.pathname.includes("drama.html") || location.search.includes("id=")) {
      await initDetail();
    } else {
      await initHome();
    }

    // back-to-top
    const tt = $("#to-top");
    if (tt) {
      const onScroll = () => { tt.hidden = window.scrollY < 600; };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      tt.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }
  })();
})();

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const IMG = "https://image.tmdb.org/t/p/";
  const state = { asal: "all", genre: "all", query: "", genres: {}, items: [], sort: "popularity", page: 1, totalPages: 1, rawItems: [] };
  let heroTimer = null;

  // ---- local persistence (favorites + history) ----
  const FAV_KEY = "dh_favs", HIST_KEY = "dh_history";
  function loadList(k) { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }
  function saveList(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function getFavs() { return loadList(FAV_KEY); }
  function isFav(id, media) { return getFavs().some((f) => f.id === id && f.media === media); }
  function toggleFav(id, media, title, poster, year) {
    const favs = getFavs();
    const i = favs.findIndex((f) => f.id === id && f.media === media);
    let removed = false;
    if (i >= 0) { favs.splice(i, 1); removed = true; }
    else favs.unshift({ id, media, title, poster, year });
    saveList(FAV_KEY, favs);
    renderPersonalRows();
    showToast(removed ? "Dihapus dari Favorit" : "Tersimpan di Favorit");
  }
  let _toastTimer = null;
  function showToast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
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
    const metaDate = t.release_date || t.first_air_date || "";
    const isNew = metaDate ? (Date.now() - new Date(metaDate).getTime()) < 90 * 864e5 : false;
    const rating = t.vote_average ? `${t.vote_average.toFixed(1)}/10` : "";
    const href = `drama.html?id=${t.id}&media=${t.media_type}`;
    return `<a class="card" href="${href}" data-id="${t.id}" data-media="${esc(t.media_type)}">
      ${itemPosterHTML(t)}
      <div class="card-body">
        <h3>${esc(title)}</h3>
        <div class="genre-tags">${(t.genre_ids || []).slice(0, 3).map((g) => `<span class="genre-tag">${esc(state.genres[g] || "?")}</span>`).join("")}</div>
      </div>
      <div class="card-meta">${isNew ? '<span class="badge badge-new">Baru</span>' : ""}<span class="card-year">${year}</span>${rating ? `<span class="card-rating">${rating}</span>` : ""}${badgeHTML(t.media_type)}</div>
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

  function sortList(list) {
    const s = state.sort || "popularity";
    const arr = list.slice();
    if (s === "rating") return arr.sort((a, b) => ((b.vote_average || 0) - (a.vote_average || 0)));
    if (s === "year") return arr.sort((a, b) => ((b.release_date || b.first_air_date || "").localeCompare(a.release_date || a.first_air_date || "")));
    return arr;
  }

  function renderItems(items) {
    const list = sortList(filterByGenre(items));
    state.items = list;
    $("#grid").innerHTML = list.map(cardHTML).join("") || '<p class="empty">Tidak ada hasil.</p>';
    $("#result-info").textContent = `Menampilkan ${list.length} judul`;
    $("#empty").hidden = list.length > 0;
  }

  const heroPlayIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  async function renderHome(trend) {
    const results = trend.results || [];

    // Hero showcase: top trending items that have art; auto-advances with video.
    const heroItems = results.filter((x) => x.backdrop_path || x.poster_path).slice(0, 5);
    const heroDots = $("#hero-dots");
    const heroVideo = $("#hero-video");
    const heroFrame = heroVideo ? heroVideo.querySelector("iframe") : null;
    const heroBackdrop = $("#hero-backdrop");

    let hidx = -1;
    const trailerCache = {};
    const tkey = (it) => `${it.media_type}-${it.id}`;

    async function loadTrailer(item) {
      const k = tkey(item);
      if (k in trailerCache) return trailerCache[k];
      try {
        const v = await tmdb(`/${item.media_type}/${item.id}/videos`, { language: "en-US" });
        const vid = (v.results || []).find((x) => x.site === "YouTube" && (x.type === "Trailer" || x.type === "Teaser"));
        trailerCache[k] = vid ? vid.key : null;
      } catch (e) { trailerCache[k] = null; }
      return trailerCache[k];
    }

    function refreshHeroMedia() {
      const item = heroItems[hidx];
      if (!item) return;
      const key = trailerCache[tkey(item)];
      if (key && heroFrame && heroVideo) {
        heroBackdrop.style.backgroundImage = "";
        heroBackdrop.style.display = "none";
        heroFrame.src = `https://www.youtube.com/embed/${key}?rel=0&autoplay=1&mute=1&loop=1&playlist=${key}&controls=0&disablekb=1&modestbranding=1&iv_load_policy=3`;
        heroVideo.style.display = "block";
      } else {
        heroVideo.style.display = "none";
        if (heroFrame) heroFrame.src = "about:blank";
        const img = item.backdrop_path || item.poster_path;
        if (img) {
          heroBackdrop.style.backgroundImage = `url("${IMG}w1280${esc(img)}")`;
          heroBackdrop.style.display = "block";
        }
      }
    }

    function setHero(i) {
      hidx = ((i % heroItems.length) + heroItems.length) % heroItems.length;
      const item = heroItems[hidx];
      const title = item.title || item.name;
      const yr = (item.release_date || item.first_air_date || "").slice(0, 4);
      const heroEl = $("#hero");
      // Crossfade: fade out, swap content, fade back in.
      if (heroEl) heroEl.classList.add("is-switching");
      setTimeout(() => {
        $("#hero-title").textContent = title;
        $("#hero-meta").innerHTML = `${yr} · ${esc(item.media_type === "movie" ? "Film" : "Drama (TV)")}`;
        $("#hero-desc").textContent = item.overview || "";
        $("#hero-actions").innerHTML =
          `<a class="btn btn-primary" href="drama.html?id=${item.id}&media=${item.media_type}&autoplay=1">${heroPlayIcon}<span>Nonton Trailer</span></a>` +
          `<a class="btn btn-ghost" href="drama.html?id=${item.id}&media=${item.media_type}">Detail</a>`;
        refreshHeroMedia();
        if (heroDots) {
          Array.from(heroDots.children).forEach((d, di) => d.classList.toggle("active", di === hidx));
        }
        if (heroEl) heroEl.classList.remove("is-switching");
      }, 300);
    }

    // Build hero indicator dots.
    if (heroDots && heroItems.length > 1) {
      heroDots.innerHTML = "";
      heroItems.forEach((_, i) => {
        const d = document.createElement("button");
        d.type = "button"; d.className = "dot";
        d.setAttribute("aria-label", "Geser ke item " + (i + 1));
        d.addEventListener("click", () => setHero(i));
        heroDots.appendChild(d);
      });
    } else if (heroDots) { heroDots.hidden = true; }

    // Start with the first hero item, prefetch trailers, auto-advance.
    if (heroItems.length) {
      setHero(0);
      heroItems.forEach((item) => loadTrailer(item).then(() => { if (hidx >= 0 && heroItems[hidx] === item) refreshHeroMedia(); }));
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        heroTimer = setInterval(() => setHero(hidx + 1), 8000);
      }
    }

    // Featured editor picks
    const picks = results.slice(0, 8);
    $("#featured").innerHTML = picks.map((t) => cardHTML(Object.assign(t, { media_type: t.media_type || "tv" }))).join("");
    wireCarousel($("#featured"), $("#feat-prev"), $("#feat-next"), $("#feat-dots"));

    // Initial catalog grid reuses the same trending payload (no extra request)
    const initial = results.filter((x) => x.media_type === "movie" || x.media_type === "tv");
    state.rawItems = initial;
    state.totalPages = trend.total_pages || 1;
    renderItems(initial);
    showLoadMore();
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

  function showLoadMore() {
    const lm = $("#load-more");
    if (!lm) return;
    lm.hidden = !(state.totalPages > state.page);
  }

  async function renderCatalog(reset = true) {
    if (reset) state.page = 1;
    $("#grid").innerHTML = skeletonHTML(12);
    try {
      let items = [], total = 1;
      if (state.query) {
        const q = await tmdb("/search/multi", { query: state.query, page: state.page });
        items = (q.results || []).filter((x) => x.media_type === "movie" || x.media_type === "tv");
        total = q.total_pages || 1;
      } else {
        const d = discoverFor(state.asal);
        const data = d.base
          ? await tmdb(d.base, Object.assign({}, d.p, { page: state.page }))
          : await tmdb(d, { page: state.page });
        items = (data.results || []).map((x) => Object.assign(x, { media_type: x.media_type || (state.asal === "film" ? "movie" : "tv") }));
        total = data.total_pages || 1;
      }
      if (reset) {
        state.rawItems = items;
      } else {
        const seen = new Set(state.rawItems.map((x) => x.id + ":" + x.media_type));
        state.rawItems = state.rawItems.concat(items.filter((x) => !seen.has(x.id + ":" + x.media_type)));
      }
      state.totalPages = total;
      renderItems(state.rawItems);
      showLoadMore();
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
    let genresTv = {}, genresMv = {}, trend = { results: [] }, newMovies = [], newShows = [], upcomingMovies = [];
    try {
      const settled = await Promise.allSettled([
        tmdb("/genre/tv/list"),
        tmdb("/genre/movie/list"),
        tmdb("/trending/all/week"),
        tmdb("/movie/now_playing", { language: "id-ID", region: "ID" }),
        tmdb("/tv/on_the_air", { language: "id-ID" }),
        tmdb("/movie/upcoming", { language: "id-ID", region: "ID" }),
      ]);
      if (settled[0].status === "fulfilled") genresTv = settled[0].value;
      if (settled[1].status === "fulfilled") genresMv = settled[1].value;
      if (settled[2].status === "fulfilled") trend = settled[2].value;
      if (settled[3].status === "fulfilled") newMovies = (settled[3].value.results || []);
      if (settled[4].status === "fulfilled") newShows = (settled[4].value.results || []);
      if (settled[5].status === "fulfilled") upcomingMovies = (settled[5].value.results || []);
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

    // Sort
    const sortSel = $("#sort-select");
    if (sortSel) {
      sortSel.addEventListener("change", (e) => {
        state.sort = e.target.value;
        if (state.rawItems && state.rawItems.length) renderItems(state.rawItems);
        else renderCatalog();
      });
    }
    // Load more
    const lm = $("#load-more");
    if (lm) {
      lm.addEventListener("click", () => { state.page += 1; renderCatalog(false); });
    }

    await renderHome(trend);
    renderNewRow(newMovies, newShows);
    // Extra rows: Sedang Tayang / Akan Datang
    const extraBox = $("#home-extra");
    if (extraBox) {
      pushRow(extraBox, "Sedang Tayang", newShows.map((x) => Object.assign({}, x, { media_type: "tv" })).slice(0, 10), "air");
      pushRow(extraBox, "Akan Datang", upcomingMovies.map((x) => Object.assign({}, x, { media_type: "movie" })).slice(0, 10), "up");
    }
    buildGenreRows([
      ...trend.results.map((x) => Object.assign({}, x, { media_type: x.media_type || (x.title ? "movie" : "tv") })),
      ...newMovies, ...newShows,
    ]);
    renderPersonalRows();
    // Deep-link dari bottom nav "Favorit" → scroll ke baris favorit.
    if (new URLSearchParams(location.search).get("fav") === "1") {
      setTimeout(() => {
        const pr = $("#personal-rows");
        const t = (pr && pr.children.length) ? pr : $("#grid");
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 350);
    }
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
    if (!hist.length && !favs.length) {
      box.innerHTML = '<div class="personal-empty"><p>Belum ada aktivitas — simpan drama ke Favorit dan langsung nonton trailer biar muncul di sini.</p></div>';
      box.hidden = false;
      return;
    }
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

    document.title = (d.title || d.name) + " — Draviel";
    pushHistory(d, media);
    setMeta("og:title", d.title || d.name);
    setMeta("og:description", (d.overview || "").slice(0, 160));
    if (d.poster_path) setMeta("og:image", `${IMG}w500${esc(d.poster_path)}`);

    // Trailers: collect ALL official YouTube trailers/teasers (multi-tab).
    let vids = ((d.videos && d.videos.results) || []).filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));
    if (!vids.length) {
      try {
        const vres = await tmdb(`/${media}/${id}/videos`, { language: "en-US" });
        vids = (vres.results || []).filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));
      } catch (e) {}
    }
    const vid = vids[0] || null;
    // player: EmbedPlayer — semua trailer resmi jadi tab sumber, bisa ditambah via window.DRAMAHUB_SOURCES
    const playerEl = $("#player");
    const epSources = vids.slice(0, 4).map((v, i) => ({
      label: v.type === "Teaser" ? "Teaser" : (i === 0 ? "Trailer Resmi" : "Trailer " + (i + 1)),
      kind: "iframe",
      src: `https://www.youtube.com/embed/${esc(v.key)}?rel=0&modestbranding=1&iv_load_policy=3`,
    }));
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

    // watch providers (legal links), grouped by access: Langganan vs Sewa/Beli
    let provHTML = "";
    try {
      const wp = await tmdb(`/${media}/${id}/watch/providers`);
      const pr = (wp.results && (wp.results["ID"] || wp.results["US"])) || null;
      const provLink = (p) => {
        const name = esc(p.provider_name);
        const icon = p.logo_path ? `<img class="prov-logo" src="${IMG}w92${esc(p.logo_path)}" alt="${name}">` : "";
        return `<a class="platform-link prov-link" href="https://www.themoviedb.org/${media}/${id}/watch" target="_blank" rel="noopener noreferrer">${icon}<span>${name}</span></a>`;
      };
      const block = (title, list) =>
        list && list.length
          ? `<div class="prov-group"><h4 class="prov-group-title">${title}</h4><div class="platform-links">${list.slice(0, 6).map(provLink).join("")}</div></div>`
          : "";
      const html = block("Langganan (Subskripsi)", pr && pr.flatrate) + block("Sewa / Beli", pr && (pr.rent || pr.buy));
      provHTML = html || '<p class="muted">Info platform nonton tidak tersedia di TMDB.</p>';
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

    // share button
    const shareBtn = $("#detail-share-btn");
    if (shareBtn) {
      const shareTitle = d.title || d.name;
      const shareUrl = location.origin + "/drama.html?id=" + d.id + "&media=" + media;
      shareBtn.addEventListener("click", async () => {
        const link = navigator.clipboard ? "ok" : "no";
        try {
          if (navigator.share) {
            await navigator.share({ title: shareTitle, text: shareTitle + " — nonton trailer di Draviel", url: shareUrl });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareUrl);
            showToast("Link disalin");
          } else {
            showToast(shareUrl);
          }
        } catch (e) {
          try { if (navigator.clipboard) { await navigator.clipboard.writeText(shareUrl); showToast("Link disalin"); } } catch (_) { showToast("Gagal membagikan"); }
        }
      });
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

  // ---- search page ----
  async function initSearch() {
    $("#year").textContent = new Date().getFullYear();
    let genresTv = {}, genresMv = {}, trend = { results: [] }, newMovies = [], newShows = [];
    try {
      const settled = await Promise.allSettled([
        tmdb("/genre/tv/list"), tmdb("/genre/movie/list"),
        tmdb("/trending/all/week"),
        tmdb("/movie/now_playing", { region: "ID" }), tmdb("/tv/on_the_air"),
      ]);
      if (settled[0].status === "fulfilled") genresTv = settled[0].value;
      if (settled[1].status === "fulfilled") genresMv = settled[1].value;
      if (settled[2].status === "fulfilled") trend = settled[2].value;
      if (settled[3].status === "fulfilled") newMovies = settled[3].value.results || [];
      if (settled[4].status === "fulfilled") newShows = settled[4].value.results || [];
    } catch (e) {}

    state.genres = {};
    [...(genresTv.genres || []), ...(genresMv.genres || [])].forEach((x) => { state.genres[x.id] = x.name; });
    state.genre = "all";

    const chipBox = $("#cari-genres");
    if (chipBox) {
      const list = [["all", "Semua"], ...Object.entries(state.genres).sort((a, b) => a[1].localeCompare(b[1]))];
      chipBox.innerHTML = "";
      list.forEach(([id, name]) => {
        const c = document.createElement("button");
        c.type = "button"; c.className = "chip" + (id === "all" ? " active" : "");
        c.dataset.genre = id; c.textContent = name;
        c.addEventListener("click", async () => {
          state.genre = id;
          chipBox.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === c));
          searchGrid();
        });
        chipBox.appendChild(c);
      });
    }

    const suggestBox = $("#cari-suggest");
    const grid = $("#search-grid");
    const info = $("#search-info");
    const empty = $("#search-empty");

    function showGrid() { suggestBox.hidden = true; grid.hidden = false; info.hidden = false; empty.hidden = true; }
    function showSuggest() { suggestBox.hidden = false; grid.hidden = true; info.hidden = true; empty.hidden = true; }

    async function renderSuggest() {
      showSuggest();
      suggestBox.innerHTML = "";
      const all = [
        ...trend.results.map((x) => Object.assign({}, x, { media_type: x.media_type || (x.title ? "movie" : "tv") })),
        ...newMovies.map((x) => Object.assign({}, x, { media_type: "movie" })),
        ...newShows.map((x) => Object.assign({}, x, { media_type: "tv" })),
      ];
      if (state.genre !== "all") {
        const filtered = all.filter((t) => (t.genre_ids || []).includes(Number(state.genre)));
        pushRow(suggestBox, state.genres[state.genre] || "Genre", filtered.slice(0, 10), "sug");
        return;
      }
      pushRow(suggestBox, "Sedang Trending", all.slice(0, 10), "sug");
      const nb = [
        ...newMovies.map((x) => Object.assign({}, x, { media_type: "movie" })),
        ...newShows.map((x) => Object.assign({}, x, { media_type: "tv" })),
      ].slice(0, 10);
      pushRow(suggestBox, "Baru Rilis", nb, "sug2");
    }

    async function searchGrid() {
      const q = $("#search-big").value.trim();
      showGrid();
      if (state.genre !== "all") {
        grid.innerHTML = skeletonHTML(12);
        try {
          const [mv, tv] = await Promise.allSettled([
            tmdb("/discover/movie", { with_genres: state.genre, sort_by: "popularity.desc" }),
            tmdb("/discover/tv", { with_genres: state.genre, sort_by: "popularity.desc" }),
          ]);
          let items = [];
          if (mv.status === "fulfilled") items = items.concat(mv.value.results.map((x) => Object.assign({}, x, { media_type: "movie" })));
          if (tv.status === "fulfilled") items = items.concat(tv.value.results.map((x) => Object.assign({}, x, { media_type: "tv" })));
          items.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
          grid.innerHTML = items.slice(0, 20).map(cardHTML).join("");
          info.textContent = `Menampilkan ${items.length} judul genre ${state.genres[state.genre]}`;
          empty.hidden = items.length > 0;
        } catch (e) { grid.innerHTML = '<p class="empty">Gagal memuat.</p>'; }
        return;
      }
      if (!q) { await renderSuggest(); return; }
      grid.innerHTML = skeletonHTML(12);
      info.textContent = "";
      try {
        const r = await tmdb("/search/multi", { query: q });
        const items = (r.results || []).filter((x) => x.media_type === "movie" || x.media_type === "tv");
        grid.innerHTML = items.map(cardHTML).join("");
        info.textContent = `Menampilkan ${items.length} hasil untuk "${q}"`;
        empty.hidden = items.length > 0;
      } catch (e) { grid.innerHTML = '<p class="empty">Gagal mencari.</p>'; }
    }

    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
    $("#search-big").addEventListener("input", debounce(() => searchGrid(), 300));
    await renderSuggest();
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

  // ---- hover trailer preview on cards ----
  const hoverTrailers = {};
  document.addEventListener("mouseover", async (e) => {
    const card = e.target.closest(".card[data-id]");
    if (!card || card.dataset.hovering) return;
    card.dataset.hovering = "1";
    const id = Number(card.dataset.id), media = card.dataset.media;
    const k = `${media}-${id}`;
    if (!(k in hoverTrailers)) {
      try {
        const v = await tmdb(`/${media}/${id}/videos`, { language: "en-US" });
        const vid = (v.results || []).find((x) => x.site === "YouTube" && (x.type === "Trailer" || x.type === "Teaser"));
        hoverTrailers[k] = vid ? vid.key : false;
      } catch (e) { hoverTrailers[k] = false; }
    }
    if (!hoverTrailers[k]) { delete card.dataset.hovering; return; }
    const p = card.querySelector(".card-poster");
    if (!p) { delete card.dataset.hovering; return; }
    let f = p.querySelector(".poster-video");
    if (!f) {
      f = document.createElement("iframe");
      f.className = "poster-video";
      f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
      f.setAttribute("frameborder", "0");
      f.tabIndex = -1;
      p.appendChild(f);
    }
    f.src = `https://www.youtube.com/embed/${hoverTrailers[k]}?rel=0&autoplay=1&mute=1&loop=1&playlist=${hoverTrailers[k]}&controls=0&disablekb=1&modestbranding=1&iv_load_policy=3`;
    p.classList.add("has-video");
  });
  document.addEventListener("mouseout", (e) => {
    const card = e.target.closest(".card[data-id]");
    if (!card) return;
    const rel = e.relatedTarget;
    if (rel && card.contains(rel)) return;
    const p = card.querySelector(".card-poster");
    const f = p && p.querySelector(".poster-video");
    if (f) f.src = "about:blank";
    if (p) p.classList.remove("has-video");
    delete card.dataset.hovering;
  });

  // ---- bottom nav (mobile) ----
  const bottomNav = $("#bottom-nav");
  if (bottomNav) {
    const isHomePage = location.pathname === "/" || location.pathname.endsWith("index.html") || location.pathname === "";
    const scrollToFav = () => {
      const pr = $("#personal-rows");
      const t = (pr && pr.children.length) ? pr : $("#grid");
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    bottomNav.querySelectorAll(".bn-item").forEach((btn) => {
      btn.type = "button";
      btn.addEventListener("click", () => {
        const kind = btn.dataset.bn;
        if (kind === "home") {
          if (isHomePage) window.scrollTo({ top: 0, behavior: "smooth" });
          else location.href = "/";
        } else if (kind === "search") {
          if (location.pathname.includes("cari")) window.scrollTo({ top: 0, behavior: "smooth" });
          else location.href = "/cari";
        } else if (kind === "fav") {
          if (isHomePage) scrollToFav();
          else location.href = "/?fav=1";
        }
      });
    });
  }

  // ---- install / download app (PWA): auto notification banner ----
  let deferredPrompt = null;
  const ibEl = document.getElementById("install-banner");
  const isStandalone = window.matchMedia && matchMedia("(display-mode: standalone)").matches;
  if (ibEl && !isStandalone) {
    const DKEY = "dh_install_dismissed";
    let dismissed = false;
    try { dismissed = localStorage.getItem(DKEY) === String(new Date().getDate()); } catch (e) {}
    const ibBtn = ibEl.querySelector(".ib-btn");
    const ibClose = ibEl.querySelector(".ib-close");
    const showBanner = () => { if (!dismissed) ibEl.hidden = false; };
    const hideBanner = () => { ibEl.hidden = true; };
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });
    if (ibBtn) {
      ibBtn.addEventListener("click", async () => {
        try {
          if (deferredPrompt) {
            const p = deferredPrompt; deferredPrompt = null;
            p.prompt(); await p.userChoice; hideBanner();
          } else {
            hideBanner();
            showToast("Install: buka menu browser lalu pilih 'Tambahkan ke Layar Utama'.");
          }
        } catch (e) { hideBanner(); showToast("Install: buka menu browser lalu pilih 'Tambahkan ke Layar Utama'."); }
      });
    }
    if (ibClose) {
      ibClose.addEventListener("click", () => {
        dismissed = true; hideBanner();
        try { localStorage.setItem(DKEY, String(new Date().getDate())); } catch (e) {}
      });
    }
    setTimeout(showBanner, 1200);
  }

  // ---- theme toggle (dark/light) ----
  const themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    const KEY = "dh_theme";
    let mode = "dark";
    try {
      mode = localStorage.getItem(KEY) || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch (e) {}
    const applyTheme = (m) => { document.documentElement.setAttribute("data-theme", m); };
    applyTheme(mode);
    themeBtn.addEventListener("click", () => {
      mode = mode === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, mode); } catch (e) {}
      applyTheme(mode);
    });
  }

  // ---- boot ----
  (async () => {
    $("#year").textContent = new Date().getFullYear();
    if (location.pathname.includes("drama.html") || location.search.includes("id=")) {
      await initDetail();
    } else if (location.pathname.includes("cari")) {
      await initSearch();
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

    // PWA: register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Pause/resume hero auto-advance when the tab is hidden.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
      } else if (!heroTimer && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        heroTimer = setInterval(() => {
          const dots = $("#hero-dots");
          if (!dots || !dots.children.length) return;
          const active = Array.from(dots.children).findIndex((d) => d.classList.contains("active"));
          const next = (active + 1) % dots.children.length;
          dots.children[next].click();
        }, 8000);
      }
    });
  })();
})();

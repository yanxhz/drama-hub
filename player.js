/* DramaHub EmbedPlayer — iframe/video embed player dengan multi-server (ala IDLIX).
 * Framework, tanpa deps. Sumber konten ditentukan oleh pemilik situs:
 *  - sumber default: trailer resmi (dari TMDB/YouTube)
 *  - tambahan: window.DRAMAHUB_SOURCES[media][id] = [{label, kind:'iframe'|'video', src, poster}]
 * Dipakai: baru window.EmbedPlayer(el, opts).
 */
(function (root, factory) {
  const P = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = P;
  if (root) root.EmbedPlayer = P;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const ICONS = {
    fs: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    fsExit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>',
    play: "▶",
    error: "",
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function isIframeKind(k) { return k === "iframe" || k === "embed" || k === "youtube"; }

  /* ===== pure helpers (testable di node) ===== */
  function normalizeSource(s, idx) {
    if (!s || typeof s !== "object") return null;
    const kind = s.kind || (isIframeKind(s.src) ? "iframe" : "video");
    const label = s.label || (kind === "video" ? "Sumber Video" : "Sumber " + (idx + 1));
    return {
      label: String(label),
      kind: kind,
      src: String(s.src || ""),
      poster: String(s.poster || ""),
    };
  }

  function normalizeSources(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach(function (s, i) {
      const n = normalizeSource(s, i);
      if (n && n.src) out.push(n);
    });
    return out;
  }

  function iframeSrc(src, autoplay) {
    // tambah autoplay kalau embed YouTube
    if (/youtu(\.be|be-nocookie|be)|player\.vimeo/.test(src)) {
      const sep = src.indexOf("?") >= 0 ? "&" : "?";
      const forced = autoplay ? "1" : "0";
      if (src.indexOf("autoplay") < 0) return src + sep + "autoplay=" + forced;
      return src.replace(/(autoplay=)\d/, "$1" + forced);
    }
    return src;
  }

  function resolveRuntimeSources(media, id, builtin) {
    // prioritas: window.DRAMAHUB_SOURCES[media][id] > builtin (trailer)
    let ext = [];
    try {
      const w = typeof window !== "undefined" ? window : null;
      if (w && w.DRAMAHUB_SOURCES && w.DRAMAHUB_SOURCES[media]) {
        const got = w.DRAMAHUB_SOURCES[media][String(id == null ? "" : id)];
        if (Array.isArray(got)) ext = got;
      }
    } catch (e) { /* abaikan */ }
    const all = ext.length ? ext.concat(builtin || []) : (builtin || []);
    return normalizeSources(all);
  }

  /* ===== component ===== */
  class EmbedPlayer {
    constructor(container, opts) {
      this.container = container;
      this.opts = opts || {};
      this.title = this.opts.title || "";
      this.poster = this.opts.poster || "";
      this.autoPlay = !!this.opts.autoPlay;
      this.sources = normalizeSources(this.opts.sources || []);
      this.active = 0;
      this.isFS = false;
      this.muted = false;
      this._bind();
      this.render();
      if (this.sources.length) this.select(0, false);
    }

    _bind() {
      this._onKey = (e) => {
        const k = (e.key || "").toLowerCase();
        if (k === "f") { e.preventDefault(); this.toggleFullscreen(); }
        else if (k === "m") { this.toggleMute(); }
        else if (k === "escape" && this.isFS) { this.exitFullscreen(); }
      };
      document.addEventListener("keydown", this._onKey);
    }

    /* ---- markup ---- */
    render() {
      const stage = this.sources.length ? "" : " ep-stage-empty";
      this.root = document.createElement("div");
      this.root.className = "ep-shell";
      this.root.innerHTML = [
        '<div class="ep-topbar">',
        '  <span class="ep-title">' + esc(this.title) + "</span>",
        '  <span class="ep-meta">' + esc(this.sources.length + " sumber") + "</span>",
        '  <button type="button" class="ep-fs" title="Fullscreen (F)">' + ICONS.fs + "</button>",
        "</div>",
        (this.sources.length > 1 ? '<div class="ep-tabs"></div>' : ""),
        '<div class="ep-stage' + stage + '">',
        '  <div class="ep-poster"></div>',
        '  <div class="ep-loading" hidden>Memuat…</div>',
        '  <div class="ep-media"></div>',
        '  <div class="ep-error" hidden></div>',
        "</div>",
      ].join("");

      this.tabsEl = this.root.querySelector(".ep-tabs");
      this.stageEl = this.root.querySelector(".ep-stage");
      this.posterEl = this.root.querySelector(".ep-poster");
      this.loadingEl = this.root.querySelector(".ep-loading");
      this.mediaEl = this.root.querySelector(".ep-media");
      this.errorEl = this.root.querySelector(".ep-error");
      this.fsBtn = this.root.querySelector(".ep-fs");

      if (this.poster) {
        this.posterEl.style.backgroundImage = "url('" + esc(this.poster) + "')";
        this.posterEl.style.backgroundSize = "cover";
        this.posterEl.style.backgroundPosition = "center";
      }
      if (this.sources.length) this.posterEl.hidden = true;

      this.fsBtn.addEventListener("click", () => this.toggleFullscreen());

      if (this.tabsEl) {
        this.sources.forEach((s, i) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "ep-tab" + (i === 0 ? " active" : "");
          b.textContent = s.label;
          b.addEventListener("click", () => this.select(i, true));
          this.tabsEl.appendChild(b);
        });
      }

      const host = this.container;
      host.innerHTML = "";
      host.appendChild(this.root);
    }

    /* ---- sumber ---- */
    select(i, userAction) {
      if (i < 0 || i >= this.sources.length) return;
      this.active = i;
      const s = this.sources[i];

      if (this.tabsEl) {
        Array.prototype.forEach.call(this.tabsEl.children, (b, bi) => {
          b.classList.toggle("active", bi === i);
        });
      }

      this.errorEl.hidden = true;
      this.mediaEl.innerHTML = "";
      this.posterEl.hidden = true;
      this.loadingEl.hidden = false;
      const play = this.autoPlay || userAction;

      if (isIframeKind(s.kind)) {
        const f = document.createElement("iframe");
        f.className = "ep-frame";
        f.src = iframeSrc(s.src, play);
        f.setAttribute("frameborder", "0");
        f.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen");
        f.setAttribute("allowfullscreen", "");
        f.setAttribute("scrolling", "no");
        f.addEventListener("load", () => { this.loadingEl.hidden = true; });
        this.mediaEl.appendChild(f);
      } else {
        const v = document.createElement("video");
        v.className = "ep-video";
        v.controls = true;
        v.preload = "auto";
        v.src = s.src;
        if (this.poster) v.poster = this.poster;
        if (play) {
          v.muted = true;
          v.autoplay = true;
          v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
        }
        v.addEventListener("loadeddata", () => { this.loadingEl.hidden = true; });
        v.addEventListener("error", () => { this.loadingEl.hidden = true; this._fail("Sumber video gagal dimuat."); });
        this.mediaEl.appendChild(v);
      }

      // timeout pengaman loading
      if (this._loadTimer) clearTimeout(this._loadTimer);
      this._loadTimer = setTimeout(() => { this.loadingEl.hidden = true; }, 8000);
    }

    _fail(msg) {
      this.errorEl.textContent = msg;
      this.errorEl.hidden = false;
    }

    /* ---- fullscreen / mute ---- */
    toggleMute() {
      const v = this.mediaEl.querySelector("video");
      if (v) { v.muted = !v.muted; this.muted = v.muted; }
    }

    toggleFullscreen() {
      if (this.isFS) return this.exitFullscreen();
      const el = this.stageEl;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) {
        const p = req.call(el);
        if (p && p.then) p.then(() => { this.isFS = true; this._syncFs(); }).catch(() => {});
      }
    }

    exitFullscreen() {
      const d = document;
      const ex = d.exitFullscreen || d.webkitExitFullscreen || d.msExitFullscreen;
      if (ex) { ex.call(d); }
      this.isFS = false;
      this._syncFs();
    }

    _syncFs() {
      if (this.fsBtn) this.fsBtn.innerHTML = this.isFS ? ICONS.fsExit : ICONS.fs;
    }

    destroy() {
      if (this._loadTimer) clearTimeout(this._loadTimer);
      document.removeEventListener("keydown", this._onKey);
      if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    }
  }

  /* expose internals untuk testing */
  EmbedPlayer.__internals = {
    normalizeSources: normalizeSources,
    normalizeSource: normalizeSource,
    iframeSrc: iframeSrc,
    resolveRuntimeSources: resolveRuntimeSources,
    isIframeKind: isIframeKind,
  };

  return EmbedPlayer;
});

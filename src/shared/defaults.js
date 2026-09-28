/*
 * Shared constants, loaded as a classic script in every context:
 *   - content scripts (listed in manifest.json)
 *   - the service worker (via importScripts)
 *   - the options and popup pages (via <script src>)
 * Everything hangs off globalThis.NV so there is no build step.
 */
var NV = globalThis.NV || (globalThis.NV = {});

/* Attributes the isolated world stamps onto the DOM and the MAIN-world
 * enforcer reads. Attributes are the simplest cross-world channel: both
 * worlds share the same DOM, so no postMessage plumbing is needed. */
NV.LOCK_ATTR = 'data-doorman-lock';
NV.LOCK_ALL_ATTR = 'data-doorman-lock-all';

NV.DEFAULTS = {
  enabled: true,

  /* A video shorter than this many seconds is blocked. */
  minSeconds: 30,

  /* Block whole pages that exist only to serve short form
   * (youtube.com/shorts/..., instagram.com/reels/..., tiktok.com, ...)
   * regardless of how long the individual clip happens to be. */
  blockShortFormPages: true,

  /* Hide Shorts shelves / Reels tabs so you never see the entry point. */
  hideShortFormUI: true,

  /* Live streams report a duration of Infinity, not a real length. */
  allowLiveStreams: true,

  /* Ignore videos rendered smaller than this (hover previews, background
   * loops, tracking pixels dressed up as <video>). */
  minVideoPx: 200,

  /* How long a solved challenge buys you, in seconds. */
  passSeconds: 90,

  /* No unlock at all. The challenge is not even offered. */
  strictMode: false,

  /* Each unlock today makes the next challenge harder. */
  escalate: true,

  /* Base length of the forced wait step. */
  baseWaitSeconds: 20,

  /* How many questions the gauntlet asks. One more is added for every
   * unlock already spent today. */
  questionCount: 7,

  /* Which steps the challenge is built from, in this order. The gauntlet
   * carries the weight; the rest are there if you want to make it worse. */
  steps: { questions: true, reflect: false, wait: true, pledge: false, math: false },

  /* Hostnames that are never gated. */
  allowlist: []
};

/* A muted video is only treated as real watching if it covers at least this
 * share of the viewport. Reels in a feed fill the column; a hover preview in
 * a thumbnail grid does not. */
NV.MUTED_VIEWPORT_SHARE = 0.15;

NV.localDay = function localDay(d) {
  const t = d || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

NV.emptyStats = function emptyStats() {
  return {
    day: NV.localDay(),
    blocked: 0,
    unlocks: 0,
    secondsWaited: 0,
    allTime: { blocked: 0, unlocks: 0, secondsWaited: 0 }
  };
};

/* Compact form for tight spaces: 45s, 4m, 1h 24m. */
NV.fmtShort = function fmtShort(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

NV.fmtDuration = function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m}m ${rest}s` : `${m} minute${m === 1 ? '' : 's'}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

/* Registered hostname -> bare hostname, so www.youtube.com and
 * m.youtube.com share one allowlist entry and one pass. */
NV.baseHost = function baseHost(hostname) {
  return String(hostname || '').replace(/^(www|m|mobile)\./, '').toLowerCase();
};

/*
 * Per-site rules for short-form surfaces.
 *
 * `pagePattern` matches location.pathname for pages that ARE short form —
 * these get blocked on sight, without waiting to measure a duration, because
 * the format is the problem rather than any individual clip's length.
 *
 * `closeTab` marks a site with nowhere useful to fall back to — its whole
 * product is the feed — so leaving means closing the tab rather than going
 * "back" into more of the same.
 *
 * `hideCss` removes the entry points (shelves, tabs, nav items). These
 * selectors are the first thing to rot when a site ships a redesign; they are
 * deliberately narrow so a stale selector fails by doing nothing.
 */
var NV = globalThis.NV || (globalThis.NV = {});

NV.SITES = [
  {
    id: 'youtube',
    label: 'YouTube Shorts',
    hosts: /(^|\.)youtube\.com$/,
    pagePattern: /^\/shorts\//,
    hideCss: `
      ytd-rich-shelf-renderer[is-shorts],
      ytd-reel-shelf-renderer,
      ytm-reel-shelf-renderer,
      ytd-guide-entry-renderer:has(a[href="/shorts"]),
      ytd-mini-guide-entry-renderer:has(a[href="/shorts"]),
      ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
      ytd-video-renderer:has(a[href^="/shorts/"]),
      ytd-compact-video-renderer:has(a[href^="/shorts/"]),
      grid-shelf-view-model:has(a[href^="/shorts/"]),
      yt-chip-cloud-chip-renderer:has([title="Shorts"]) { display: none !important; }
    `
  },
  {
    id: 'instagram',
    label: 'Instagram Reels',
    hosts: /(^|\.)instagram\.com$/,
    pagePattern: /^\/(reels?|stories)(\/|$)/,
    hideCss: `
      a[href="/reels/"],
      a[href^="/reels/audio"],
      div[role="tablist"] a[href*="/reels"] { display: none !important; }
    `
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    hosts: /(^|\.)tiktok\.com$/,
    /* The entire product is a short-form feed. */
    pagePattern: /^\//,
    closeTab: true
  },
  {
    id: 'facebook',
    label: 'Facebook Reels',
    hosts: /(^|\.)facebook\.com$/,
    pagePattern: /^\/(reel|reels)(\/|$)/,
    hideCss: `
      a[href^="/reel/"],
      div[aria-label="Reels"] { display: none !important; }
    `
  },
  {
    id: 'snapchat',
    label: 'Snapchat Spotlight',
    hosts: /(^|\.)snapchat\.com$/,
    pagePattern: /^\/spotlight(\/|$)/,
    closeTab: true
  },
  {
    id: 'youtube-kids',
    label: 'YouTube Kids Shorts',
    hosts: /(^|\.)youtubekids\.com$/,
    pagePattern: /^\/shorts\//
  }

  /* x.com, reddit.com and the rest have no dedicated short-form URL, so they
   * fall through to the generic duration check in guard.js. */
];

NV.matchSite = function matchSite(loc) {
  const host = String(loc.hostname || '').toLowerCase();
  return NV.SITES.find((s) => s.hosts && s.hosts.test(host)) || null;
};

NV.isShortFormPage = function isShortFormPage(loc) {
  const site = NV.matchSite(loc);
  if (!site || !site.pagePattern) return null;
  return site.pagePattern.test(loc.pathname) ? site : null;
};

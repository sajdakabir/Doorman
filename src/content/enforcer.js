/*
 * MAIN-world enforcer.
 *
 * Runs in the page's own JS world (manifest "world": "MAIN") so it can patch
 * HTMLMediaElement.prototype and actually refuse the page's play() calls. The
 * isolated-world guard cannot do this: prototype patches there are invisible
 * to page scripts.
 *
 * It owns no policy. It only obeys two DOM attributes the guard stamps:
 *   data-doorman-lock      on a <video>          -> that element cannot play
 *   data-doorman-lock-all  on <html>             -> nothing can play
 *
 * play() is rejected with a NotAllowedError, which is exactly what the browser
 * throws when autoplay is denied. Every serious player already handles that
 * path, so blocking looks like a condition they expect rather than a crash.
 */
(() => {
  const LOCK_ATTR = 'data-doorman-lock';
  const LOCK_ALL_ATTR = 'data-doorman-lock-all';

  const proto = HTMLMediaElement.prototype;
  const nativePlay = proto.play;
  const nativePause = proto.pause;

  /* Bail out if the script somehow runs twice in one world. */
  if (proto.play && proto.play.__doormanPatched) return;

  function locked(el) {
    try {
      if (document.documentElement.hasAttribute(LOCK_ALL_ATTR)) return true;
      return el instanceof Element && el.hasAttribute(LOCK_ATTR);
    } catch {
      return false;
    }
  }

  function halt(el) {
    try {
      nativePause.call(el);
    } catch {}
  }

  const patchedPlay = function play() {
    if (locked(this)) {
      halt(this);
      return Promise.reject(
        new DOMException('Playback blocked by Doorman', 'NotAllowedError')
      );
    }
    return nativePlay.apply(this, arguments);
  };
  patchedPlay.__doormanPatched = true;
  proto.play = patchedPlay;

  /* Some players never call play() — they set autoplay, or let the element
   * resume itself after a seek. Capture-phase listeners fire for these events
   * even though media events do not bubble. */
  const clamp = (event) => {
    const el = event.target;
    if (el instanceof HTMLMediaElement && locked(el)) halt(el);
  };
  for (const type of ['play', 'playing', 'timeupdate', 'canplay', 'loadeddata']) {
    document.addEventListener(type, clamp, true);
  }

  /* A locked element that slips past the listeners above (a player driving
   * playback through a path we did not anticipate) gets caught here. */
  setInterval(() => {
    let nodes;
    try {
      nodes = document.querySelectorAll(
        `[${LOCK_ATTR}], [${LOCK_ALL_ATTR}] video, [${LOCK_ALL_ATTR}] audio`
      );
    } catch {
      return;
    }
    for (const el of nodes) {
      if (el instanceof HTMLMediaElement && !el.paused) halt(el);
    }
  }, 250);
})();

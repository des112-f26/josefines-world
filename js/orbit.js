/*
 * Orbit: the interactions.
 * Everything that moves is a CSS animation in index.html. This script only winds those animations:
 * drag the Earth round the sun, drag the Moon round the Earth, turn the sun like a dial,
 * or press a small circle to spool time to the start of its story.
 * The hard stories are heavy: time moves through them slower than the pointer pulls.
 */
(function () {
  'use strict';

  var svg = document.querySelector('.orbit-stage svg');
  if (!svg || !document.getAnimations) { return; }

  var ROUND = 360000;          // one round of the Earth: twelve stories
  var SLOT = ROUND / 12;       // one story, as long as the long hand takes to go round once
  var RS = parseFloat(svg.getAttribute('data-rs')) || 378;   // radius of the Earth's path round the sun, as drawn
  var SUN = { x: 960, y: 540 };  // the sun, in drawing units
  var NAMES = /^(orbitTurn|orbitBack|moonOrbit|moonAim|moonPhaseD|moonPhaseL|storyVis\d+|tick\d+|s\d+_\w+)$/;

  var aurora = svg.querySelector('.orbit-aurora');
  var held = [];
  var mode = null;             // 'earth' | 'moon' | 'sun' while something is held
  var holdMs = 0;
  var holdAngle = 0;
  var spool = null;
  var sunDown = null;          // where and when the sun was pressed, to tell a tap from a turn

  // every animation that belongs to the Earth's round: its turn round the sun and the stories acted out on it
  function cycleAnims() {
    return document.getAnimations().filter(function (a) { return NAMES.test(a.animationName || ''); });
  }

  function wrap(ms) { return ((ms % ROUND) + ROUND) % ROUND; }

  function nowMs(anims) { return anims.length ? wrap(anims[0].currentTime || 0) : 0; }

  function setAll(ms) { held.forEach(function (a) { a.currentTime = ms; }); }

  // how freely time moves through each story when you wind it: the hard stories are heavy to drag through,
  // as a sign of the struggle in them (1 = free, 0.25 = it takes four times the pull)
  var WEIGHT = [0.3, 0.4, 0.25, 0.25, 1, 1, 0.3, 0.7, 1, 0.55, 0.3, 0.25];
  function ease(ms) {
    var n = WEIGHT.length, EDGE = 0.12;
    var s = ms / SLOT;                   // story i is centred on s = i
    var i = Math.floor(s + 0.5);
    var f = s + 0.5 - i;                 // 0..1 across story i
    var a = WEIGHT[((i % n) + n) % n];
    if (f < EDGE) { var b = WEIGHT[(((i - 1) % n) + n) % n]; return b + (a - b) * (0.5 + 0.5 * f / EDGE); }
    if (f > 1 - EDGE) { var c = WEIGHT[(((i + 1) % n) + n) % n]; return c + (a - c) * (0.5 + 0.5 * (1 - f) / EDGE); }
    return a;
  }

  // move time on by a pull, held back by the weight of the stories it passes through
  function wind(ms, pull) {
    var step = SLOT * 0.03, left = Math.abs(pull), dir = pull < 0 ? -1 : 1;
    while (left > 0) {
      var d = Math.min(step, left);
      ms += dir * d * ease(wrap(ms));
      left -= d;
    }
    return wrap(ms);
  }

  function playAll() { held.forEach(function (a) { a.play(); }); }

  // drawing units to screen pixels, whatever size the window is
  function toScreen(x, y) {
    var m = svg.getScreenCTM();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  // angle of the pointer round a point, from twelve o'clock clockwise
  function angleAround(e, p) {
    return Math.atan2(e.clientX - p.x, p.y - e.clientY);
  }

  function earthAt(ms) {
    var a = 2 * Math.PI * (ms / ROUND);
    return toScreen(SUN.x + RS * Math.sin(a), SUN.y - RS * Math.cos(a));
  }

  function turn(d) {
    while (d > Math.PI) { d -= 2 * Math.PI; }
    while (d < -Math.PI) { d += 2 * Math.PI; }
    return d;
  }

  // while the northern lights shine, the sun holds still and stops pulsing
  var SUN_PULSE = /^(sunBreath|rayReach|burstPulse)$/;
  function showAurora(on) {
    if (aurora) { aurora.style.opacity = on ? '1' : '0'; }
    document.getAnimations().forEach(function (a) {
      if (SUN_PULSE.test(a.animationName || '')) { if (on) { a.pause(); } else { a.play(); } }
    });
  }

  function stopSpool() {
    if (spool) { cancelAnimationFrame(spool); spool = null; }
    if (!mode) { showAurora(false); }
  }

  function grab(kind) {
    return function (e) {
      e.preventDefault();
      e.stopPropagation();
      stopSpool();
      held = cycleAnims();
      if (!held.length) { return; }
      if (e.currentTarget.setPointerCapture) { e.currentTarget.setPointerCapture(e.pointerId); }
      e.currentTarget.style.cursor = 'grabbing';
      mode = kind;
      held.forEach(function (a) { a.pause(); });
      holdMs = nowMs(held);
      if (kind === 'earth') {
        showAurora(true);
        holdAngle = angleAround(e, toScreen(SUN.x, SUN.y));
      } else if (kind === 'sun') {
        holdAngle = angleAround(e, toScreen(SUN.x, SUN.y));
        sunDown = { x: e.clientX, y: e.clientY, t: performance.now() };
      } else {
        holdAngle = angleAround(e, earthAt(holdMs));
      }
    };
  }

  function move(e) {
    if (!mode) { return; }
    e.preventDefault();
    e.stopPropagation();
    var ang, ms;
    if (mode === 'earth' || mode === 'sun') {
      // the Earth is pulled round the sun (or the sun turned like a dial): one turn is the whole round,
      // and through the hard stories it lags behind the pointer
      ang = angleAround(e, toScreen(SUN.x, SUN.y));
      ms = wind(holdMs, turn(ang - holdAngle) / (2 * Math.PI) * ROUND);
      holdAngle = ang;
    } else {
      // the Moon fine-tunes: one turn round the Earth is one story
      ang = angleAround(e, earthAt(holdMs));
      ms = wind(holdMs, turn(ang - holdAngle) / (2 * Math.PI) * SLOT);
    }
    holdMs = ms;
    setAll(ms);
    if (mode === 'moon') { holdAngle = angleAround(e, earthAt(ms)); }
  }

  function release(e) {
    if (!mode) { return; }
    e.stopPropagation();
    if (mode === 'earth') { showAurora(false); }
    var wasSun = mode === 'sun';
    mode = null;
    e.currentTarget.style.cursor = 'grab';
    playAll();
    // a tap (no turn) on the sun takes us back out through the eye to her face
    if (wasSun && e.type === 'pointerup' && sunDown && Math.hypot(e.clientX - sunDown.x, e.clientY - sunDown.y) < 6
        && performance.now() - sunDown.t < 450) { goOut(); }
  }

  function hookDrag(el, kind) {
    if (!el) { return; }
    el.addEventListener('pointerdown', grab(kind));
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', function (e) { if (mode === kind) { release(e); } });
  }

  hookDrag(svg.querySelector('[data-drag="sun"]'), 'sun');
  hookDrag(svg.querySelector('[data-drag="earth"]'), 'earth');
  hookDrag(svg.querySelector('[data-drag="moon"]'), 'moon');

  // press a small circle: time spools quickly round to the start of that story, then runs on from there
  function pickStory(i) {
    var anims = cycleAnims();
    if (!anims.length || mode) { return; }
    stopSpool();
    held = anims;
    held.forEach(function (a) { a.pause(); });
    var from = nowMs(held);
    var to = wrap((i - 0.5 + 0.04) * SLOT);
    var d = to - from;
    while (d > ROUND / 2) { d -= ROUND; }
    while (d < -ROUND / 2) { d += ROUND; }
    // the effort along the way: the hard stories cost more, so the spool slows down through them
    var N = 240, effort = [0];
    for (var j = 1; j <= N; j++) {
      effort.push(effort[j - 1] + Math.abs(d) / N / ease(wrap(from + d * (j - 0.5) / N)));
    }
    var total = effort[N] || 1;
    var dur = Math.min(4200, 700 + total / SLOT * 170);
    var t0 = performance.now();
    var at = 1;
    showAurora(true);
    var step = function (now) {
      var t = Math.min(1, (now - t0) / dur);
      var k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      var goal = k * total;
      while (at < N && effort[at] < goal) { at++; }
      var lo = effort[at - 1], hi = effort[at];
      var frac = hi > lo ? Math.min(1, Math.max(0, (goal - lo) / (hi - lo))) : 1;
      setAll(wrap(from + d * (at - 1 + frac) / N));
      if (t < 1) {
        spool = requestAnimationFrame(step);
      } else {
        spool = null;
        showAurora(false);
        playAll();
      }
    };
    spool = requestAnimationFrame(step);
  }

  // the way in (a face whose eye opens onto the orbit): press it, or Escape, to skip to the end
  function introAnims() {
    return document.getAnimations().filter(function (a) { return /^intro/.test(a.animationName || ''); });
  }
  // pressing the face: on the way in or out it jumps to the end of the way; resting on the face, it goes back in
  function skipIntro(e) {
    if (e) { e.preventDefault(); }
    var anims = introAnims();
    if (!anims.length) { return; }
    var atFace = anims.every(function (a) { return a.playbackRate < 0 && a.playState === 'finished'; });
    anims.forEach(function (a) {
      if (atFace) { a.playbackRate = 1; a.play(); } else { a.finish(); }
    });
  }
  // back out through the eye to her face: the way in, played backwards and a little faster
  function goOut() {
    var anims = introAnims();
    if (!anims.length || anims.some(function (a) { return a.playState === 'running'; })) { return; }
    anims.forEach(function (a) { a.playbackRate = -1.5; a.play(); });
  }
  var intro = svg.querySelector('[data-skip-intro]');
  if (intro) {
    intro.addEventListener('click', skipIntro);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      // Escape skips ahead on the way in, but never sends you back in from her face
      var anims = introAnims();
      if (anims.length && !anims.every(function (a) { return a.playbackRate < 0 && a.playState === 'finished'; })) { skipIntro(e); }
    });
  }

  Array.prototype.forEach.call(svg.querySelectorAll('[data-story]'), function (el) {
    var i = Number(el.getAttribute('data-story')) || 0;
    el.addEventListener('click', function (e) { e.preventDefault(); pickStory(i); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickStory(i); }
    });
  });
})();

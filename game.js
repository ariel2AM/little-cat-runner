(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const status = document.getElementById('status');
  const pauseButton = document.getElementById('pause');
  const soundButton = document.getElementById('sound');
  const duckButton = document.getElementById('duck');
  const storageNote = document.getElementById('storage-note');
  const scorePanel = document.getElementById('score-panel');
  const scoreForm = document.getElementById('score-form');
  const nameInput = document.getElementById('player-name');
  const saveScoreButton = document.getElementById('save-score');
  const saveResult = document.getElementById('save-result');
  const playerBests = document.getElementById('player-bests');
  const PLAYER_KEY = 'little-rex.players.v1';
  const MAX_RECENT_RUNS = 50;
  let players = [], submitted = false;
  const cleanName = value => value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 24);
  const nameKey = name => cleanName(name).toLowerCase();
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_KEY));
    if (saved && saved.version === 1 && Array.isArray(saved.players)) {
      for (const entry of saved.players) {
        if (!entry || typeof entry.name !== 'string' || !Number.isSafeInteger(entry.best) || entry.best < 0) continue;
        const name = cleanName(entry.name);
        if (!name) continue;
        const validAttempts = Array.isArray(entry.attempts) ? entry.attempts.filter(n => Number.isSafeInteger(n) && n >= 0) : [entry.best];
        const attempts = validAttempts.slice(-MAX_RECENT_RUNS);
        const runs = Number.isSafeInteger(entry.runs) && entry.runs >= validAttempts.length ? entry.runs : validAttempts.length;
        const best = attempts.reduce((best, value) => Math.max(best, value), entry.best);
        const existing = players.find(p => nameKey(p.name) === nameKey(name));
        if (existing) {
          existing.best = Math.max(existing.best, best);
          existing.attempts = existing.attempts.concat(attempts).slice(-MAX_RECENT_RUNS);
          existing.runs += runs;
        } else players.push({ name, best, attempts, runs });
      }
    }
  } catch { /* An unavailable or invalid save must not prevent playing. */ }
  function renderPlayers() {
    playerBests.replaceChildren();
    const ranked = [...players].sort((a, b) => b.best - a.best || a.name.localeCompare(b.name));
    for (const player of ranked) {
      const item = document.createElement('li');
      item.textContent = player.name + ' — Best: ' + player.best + ' · Saved runs: ' + player.runs;
      playerBests.append(item);
    }
    if (!ranked.length) {
      const item = document.createElement('li');
      item.textContent = 'No named scores yet.';
      playerBests.append(item);
    }
  }
  scoreForm.addEventListener('submit', event => {
    event.preventDefault();
    if (mode !== 'over' || submitted) return;
    const name = cleanName(nameInput.value);
    if (!name) { saveResult.textContent = 'Please enter a player name.'; nameInput.focus(); return; }
    nameInput.value = name;
    let player = players.find(p => nameKey(p.name) === nameKey(name));
    if (!player) { player = { name, best: score, attempts: [], runs: 0 }; players.push(player); }
    else player.best = Math.max(player.best, score);
    // Every completed run is accepted, including identical names and scores.
    // The leaderboard still has exactly one row per normalized player name.
    player.attempts.push(score);
    player.attempts = player.attempts.slice(-MAX_RECENT_RUNS);
    player.runs += 1;
    let persisted = true;
    try { localStorage.setItem(PLAYER_KEY, JSON.stringify({ version: 1, players })); }
    catch { persisted = false; }
    saveResult.textContent = persisted ? 'Saved.' : 'Session only — browser storage unavailable.';
    submitted = true;
    saveScoreButton.disabled = true;
    nameInput.disabled = true;
    renderPlayers();
    document.getElementById('play-again').focus();
  });
  document.getElementById('play-again').addEventListener('click', () => {
    clearInput(); unlockAudio(); restart(); canvas.focus();
  });
  const WIDTH = 960, HEIGHT = 320, GROUND = 242;
  function resizeCanvas() {
    const scale = Math.min(window.devicePixelRatio || 1, 3);
    const width = Math.max(1, Math.round(canvas.clientWidth * scale));
    const height = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(width / WIDTH, 0, 0, height / HEIGHT, 0, 0);
  }
  new ResizeObserver(resizeCanvas).observe(canvas);
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  const STEP = 1 / 120, SPEED = 280;
  // Choose the height and time to apex, then derive the jump physics.
  const JUMP_HEIGHT = 96, APEX_TIME = 0.34;
  const GRAVITY = 2 * JUMP_HEIGHT / (APEX_TIME * APEX_TIME);
  const JUMP_SPEED = -2 * JUMP_HEIGHT / APEX_TIME;
  const held = new Set();
  const jumpPointers = new Set(), duckPointers = new Set();
  const rex = { x: 96, y: GROUND, vy: 0, grounded: true, landing: 0 };
  let mode = 'ready', distance = 0, elapsed = 0, buffer = 0;
  let lastTime = null, accumulator = 0;
  let obstacles = [], spawnIn = 0, score = 0, runBest = 0, deadAt = 0;
  const SAVE_KEY = 'little-rex.save.v1';
  let soundEnabled = false, audioUnavailableFlag = false, audioContext = null, master = null, milestone = 0;
  let savedBest = 0, nightBlend = 0;
  const DAY = { bg: [255, 254, 251], ink: [72, 82, 74], muted: [115, 122, 115], cloud: [222, 223, 213], ground: [165, 170, 157] };
  const NIGHT = { bg: [30, 36, 43], ink: [226, 232, 216], muted: [182, 192, 180], cloud: [83, 94, 107], ground: [122, 137, 136] };
  function color(name) {
    return 'rgb(' + DAY[name].map((v, i) => Math.round(v + (NIGHT[name][i] - v) * nightBlend)).join(',') + ')';
  }
  function storageUnavailable() {
    storageNote.hidden = false;
    storageNote.textContent = 'Scores cannot be saved in this browser.';
  }
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved && saved.version === 1) {
      if (Number.isSafeInteger(saved.best) && saved.best >= 0) runBest = saved.best;
      if (typeof saved.sound === 'boolean') soundEnabled = saved.sound;
    }
    savedBest = runBest;
  } catch { storageUnavailable(); }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, best: runBest, sound: soundEnabled }));
      savedBest = runBest;
      storageNote.hidden = true;
      storageNote.textContent = '';
    } catch { storageUnavailable(); }
  }
  function syncSoundButton() {
    soundButton.textContent = audioUnavailableFlag ? 'Sound unavailable' : soundEnabled ? 'Sound: on' : 'Sound: off';
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
  }
  function audioUnavailable() {
    soundEnabled = false;
    audioUnavailableFlag = true;
    syncSoundButton();
  }
  function unlockAudio() {
    if (!soundEnabled) return;
    try {
      if (!audioContext) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) { audioUnavailable(); return; }
        audioContext = new Audio();
        master = audioContext.createGain();
        master.gain.value = Math.pow(10, -22 / 20);
        master.connect(audioContext.destination);
      }
      master.gain.value = Math.pow(10, -22 / 20);
      if (audioContext.state !== 'running') audioContext.resume().catch(audioUnavailable);
    } catch { audioUnavailable(); }
  }
  function tone(kind) {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
    try {
      const [from, to, duration] = { jump: [380, 690, 0.09], point: [740, 990, 0.14], hit: [180, 55, 0.24] }[kind];
      const oscillator = audioContext.createOscillator(), envelope = audioContext.createGain();
      const now = audioContext.currentTime;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(from, now);
      oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(1, now + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(envelope); envelope.connect(master);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(now); oscillator.stop(now + duration + 0.01);
    } catch { audioUnavailable(); }
  }
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) audioUnavailableFlag = false;
    if (soundEnabled) { unlockAudio(); tone('point'); }
    else if (master) master.gain.value = 0;
    syncSoundButton(); save();
  });
  syncSoundButton();
  const speed = () => Math.min(540, SPEED + elapsed * 5);
  function restart() {
    scorePanel.hidden = true; submitted = false;
    rex.landing = 0;
    milestone = 0; nightBlend = 0;
    obstacles = []; spawnIn = 0; score = 0; elapsed = 0; distance = 0; buffer = 0;
    rex.y = GROUND; rex.vy = 0; rex.grounded = true;
    setMode('running');
  }

  function setMode(next) {
    mode = next;
    if (next === 'paused' || next === 'over') save();
    if (next === 'over') {
      clearInput(); buffer = 0;
      scorePanel.hidden = false;
      nameInput.disabled = false;
      nameInput.value = '';
      saveScoreButton.disabled = false;
      document.getElementById('run-result').textContent = 'This run: ' + score + ' points';
      saveResult.textContent = '';
      renderPlayers();
      nameInput.focus({ preventScroll: true });
    }
    status.textContent = { ready: 'Ready', running: '', paused: 'Paused', over: 'Game over' }[mode];
    pauseButton.disabled = mode === 'ready';
    pauseButton.textContent = mode === 'over' ? 'Restart' : mode === 'paused' ? 'Resume' : 'Pause';
    lastTime = null;
    accumulator = 0;
  }
  function clearInput() { held.clear(); jumpPointers.clear(); duckPointers.clear(); }
  function togglePause() {
    if (mode === 'ready') return;
    if (mode === 'over') { clearInput(); unlockAudio(); restart(); return; }
    clearInput();
    buffer = 0;
    const next = mode === 'running' ? 'paused' : 'running';
    if (next === 'running') { releaseJump(); unlockAudio(); }
    setMode(next);
  }
  function jumpHeld() { return held.has('Space') || held.has('ArrowUp') || jumpPointers.size > 0; }
  function duckHeld() { return held.has('ArrowDown') || duckPointers.size > 0; }
  function requestJump() {
    unlockAudio();
    if (mode === 'over') {
      if (performance.now() - deadAt < 350) return;
      restart();
    }
    if (mode === 'ready') restart();
    if (mode === 'running') buffer = 0.12;
  }

  function releaseJump() {
    if (!jumpHeld() && rex.vy < 0) rex.vy *= 0.45;
  }
  window.addEventListener('keydown', event => {
    // Typing names and using form controls must never trigger game shortcuts.
    if (event.target !== canvas && event.target.closest?.('button, input, textarea, select, [contenteditable]')) return;
    if (!['Space', 'ArrowUp', 'ArrowDown', 'KeyP'].includes(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'KeyP') { togglePause(); return; }
    held.add(event.code);
    if (event.code === 'ArrowDown') buffer = 0;
    else requestJump();
  });
  window.addEventListener('keyup', event => {
    held.delete(event.code);
    if (event.code === 'Space' || event.code === 'ArrowUp') releaseJump();
  });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    canvas.focus();
    try { canvas.setPointerCapture(event.pointerId); } catch { /* Release is still handled globally. */ }
    jumpPointers.add(event.pointerId);
    requestJump();
  });
  function pointerEnd(event) { jumpPointers.delete(event.pointerId); releaseJump(); }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('lostpointercapture', pointerEnd);
  duckButton.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    try { duckButton.setPointerCapture(event.pointerId); } catch { /* Release is still handled globally. */ }
    duckPointers.add(event.pointerId);
    buffer = 0;
  });
  function duckEnd(event) { duckPointers.delete(event.pointerId); }
  duckButton.addEventListener('pointerup', duckEnd);
  duckButton.addEventListener('pointercancel', duckEnd);
  duckButton.addEventListener('lostpointercapture', duckEnd);
  window.addEventListener('pointerup', event => { pointerEnd(event); duckEnd(event); });
  window.addEventListener('pointercancel', event => { pointerEnd(event); duckEnd(event); });
  pauseButton.addEventListener('click', togglePause);
  function suspend() { clearInput(); buffer = 0; if (mode === 'running') setMode('paused'); }
  window.addEventListener('blur', suspend);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });

  function update(dt) {
    if (mode !== 'running') return;
    rex.landing = Math.max(0, rex.landing - dt);
    elapsed += dt;
    distance += speed() * dt;
    score = Math.floor(distance / 28);
    runBest = Math.max(runBest, score);
    if (runBest - savedBest >= 10) save();
    if (Math.floor(score / 100) > milestone) { milestone = Math.floor(score / 100); tone('point'); }
    const targetNight = Math.floor(score / 250) % 2;
    nightBlend += Math.max(-dt / 1.5, Math.min(dt / 1.5, targetNight - nightBlend));
    if (buffer > 0 && rex.grounded && !duckHeld()) {
      tone('jump');
      rex.vy = JUMP_SPEED * (jumpHeld() ? 1 : 0.72);
      rex.grounded = false;
      buffer = 0;
    }
    buffer = Math.max(0, buffer - dt);
    if (!rex.grounded) {
      const multiplier = duckHeld() ? 3 : rex.vy > 0 ? 1.5 : 1;
      rex.vy += GRAVITY * multiplier * dt;
      rex.y += rex.vy * dt;
      if (rex.y >= GROUND) { rex.y = GROUND; rex.vy = 0; rex.grounded = true; rex.landing = 0.18; }
    }
    spawnIn -= dt;
    if (spawnIn <= 0) {
      const bird = elapsed > 12 && Math.random() < 0.3;
      const h = bird ? 24 : 32 + Math.floor(Math.random() * 3) * 8;
      obstacles.push({ x: WIDTH + 24, y: bird ? GROUND - 48 : GROUND - h,
        w: bird ? 42 : 26, h, bird });
      // At least 1.25 seconds between obstacles, even at maximum speed.
      spawnIn = 1.25 + Math.random() * 0.7;
    }
    for (const obstacle of obstacles) obstacle.x -= speed() * dt;
    obstacles = obstacles.filter(o => o.x + o.w > -20);
    if (obstacles.some(o => playerBoxes().some(b => overlaps(b, o.bird
      ? { x: o.x + 3, y: o.y + 8, w: o.w - 6, h: 17 }
      : { x: o.x + 3, y: o.y + 3, w: o.w - 6, h: o.h - 3 })))) {
      tone('hit');
      deadAt = performance.now();
      setMode('over');
    }
  }
  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function catPose() {
    const duck = duckHeld() && rex.grounded;
    const phase = distance / 22;
    const squash = rex.grounded ? Math.sin(rex.landing / 0.18 * Math.PI) * 5 : 0;
    const bob = rex.grounded && !duck ? Math.sin(phase * 2) * 1.5 : 0;
    return { duck, phase, squash, top: rex.y - (duck ? 19 : 26) + squash + bob };
  }
  function playerBoxes() {
    const pose = catPose();
    return [
      { x: rex.x + 3, y: pose.top + 2, w: 39, h: pose.duck ? 13 : 17 },
      { x: rex.x + 35, y: pose.top - (pose.duck ? 3 : 7), w: 25, h: pose.duck ? 23 : 27 }
    ];
  }
  function drawObstacle(o) {
    ctx.fillStyle = color('ink');
    if (o.bird) {
      rect(o.x + 8, o.y + 10, 25, 10);
      rect(o.x, o.y + 8, 14, 7); rect(o.x + 31, o.y + 14, 11, 4);
      rect(o.x + 19, o.y + (Math.floor(elapsed * 9) % 2 ? 0 : 16), 8, 9);
      ctx.fillStyle = color('bg'); rect(o.x + 7, o.y + 9, 2, 2);
    } else {
      // Stepped stone silhouette, with a lit face and a small crack.
      rect(o.x + 7, o.y, o.w - 14, 5);
      rect(o.x + 3, o.y + 5, o.w - 6, o.h - 5);
      rect(o.x, o.y + 14, o.w, o.h - 14);
      ctx.fillStyle = color('ground');
      rect(o.x + 7, o.y + 6, 5, o.h - 13);
      rect(o.x + 12, o.y + 5, 6, 3);
      ctx.fillStyle = color('bg');
      rect(o.x + 17, o.y + 16, 2, 7);
      rect(o.x + 15, o.y + 21, 3, 2);
    }
  }
  function rect(x, y, w, h) { ctx.fillRect(Math.round(x), Math.round(y), w, h); }
  function drawCat() {
    const x = rex.x, y = rex.y;
    const { duck, phase, squash, top } = catPose();
    // Short pixel segments keep the limbs and flexible tail in the same art style.
    function segment(ax, ay, bx, by, thickness = 5) {
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        rect(ax + (bx - ax) * t - thickness / 2, ay + (by - ay) * t - thickness / 2, thickness, thickness);
      }
    }
    // No looping tail animation: its pose follows jump velocity, ducking, and landing.
    const airborne = !rex.grounded;
    const tailLift = duck ? 1 : airborne ? Math.max(-12, Math.min(23, rex.vy / 22 + 8)) : 13;
    const flick = Math.sin(rex.landing / 0.18 * Math.PI) * 5;
    ctx.fillStyle = color('ink');
    let tx = x + 3, ty = top + 5;
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      const nx = x + 3 - t * (duck ? 21 : 19);
      const ny = top + 5 - Math.sin(t * Math.PI / 2) * tailLift
        + flick * t * t;
      // Rounded, bushy profile with small pixel tufts and a tapered tip.
      const thickness = t < 0.25 ? 6 : t < 0.75 ? 10 : t < 0.93 ? 8 : 5;
      segment(tx, ty, nx, ny, thickness);
      if (i === 5 || i === 9) rect(nx - 2, ny - thickness / 2 - 2, 4, 3);
      tx = nx; ty = ny;
    }
    function leg(root, offset) {
      // Short, straight pixel legs; alternating lifts provide the running gait.
      const stride = Math.sin(phase + offset);
      const legX = root + (rex.grounded && !duck ? stride * 2 : 0);
      const startY = top + (duck ? 12 : 16);
      const lift = rex.grounded && !duck ? Math.max(0, Math.cos(phase + offset)) * 3 : 0;
      const footY = airborne ? startY + (rex.vy < 0 ? 5 : 8) : y - 2 - lift;
      ctx.fillStyle = color('ink');
      rect(legX - 2, startY, 5, Math.max(3, Math.round(footY - startY)));
      rect(legX - 2, footY - 1, 7, 3);
    }
    leg(x + 10, Math.PI); leg(x + 36, 0);
    ctx.fillStyle = color('ink');
    rect(x + 2, top, 37, duck ? 14 : 19);
    rect(x - 1, top + 5, 44, duck ? 8 : 10);
    rect(x + 31, top + 1, 13, 15);
    leg(x + 7, 0); leg(x + 34, Math.PI);
    // A chunky silhouette, rounded cheeks, and tiny ears in the original palette.
    const headY = top - (duck ? 3 : 7);
    ctx.fillStyle = color('ink');
    rect(x + 36, headY, 23, 22);
    rect(x + 32, headY + 4, 31, 14);
    rect(x + 38, headY + 22, 17, 2);
    // Stepped triangular ears, narrowing to single-pixel tips.
    for (const earX of [x + 38, x + 56]) {
      rect(earX, headY - 10, 1, 2);
      rect(earX - 1, headY - 8, 3, 2);
      rect(earX - 2, headY - 6, 5, 2);
      rect(earX - 3, headY - 4, 7, 2);
      rect(earX - 4, headY - 2, 9, 5);
    }
    // Simple negative-space eyes and a tiny smile, without color or shading.
    ctx.fillStyle = color('bg');
    rect(x + 39, headY + 7, 4, 5); rect(x + 52, headY + 7, 4, 5);
    rect(x + 47, headY + 14, 2, 2);
    rect(x + 44, headY + 17, 3, 1); rect(x + 49, headY + 17, 3, 1);
  }
  function draw() {
    ctx.fillStyle = color('bg'); ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (nightBlend > 0) {
      ctx.globalAlpha = nightBlend;
      ctx.fillStyle = color('ink');
      rect(748, 64, 18, 24); rect(743, 69, 28, 14);
      ctx.fillStyle = color('bg'); rect(741, 61, 17, 20);
      ctx.fillStyle = color('muted');
      for (let i = 0; i < 16; i++) rect(30 + (i * 137 % 900), 55 + (i * 41 % 125), 2, 2);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color('cloud');
    for (let i = 0; i < 5; i++) {
      const x = ((i * 241 + 180 - distance * 0.16) % 1200 + 1200) % 1200 - 100;
      const y = 70 + (i % 3) * 27;
      rect(x, y, 50, 2); rect(x + 9, y - 7, 31, 2); rect(x + 17, y - 13, 14, 2);
    }
    ctx.fillStyle = color('ground'); rect(0, GROUND + 1, WIDTH, 1);
    for (let i = 0; i < 50; i++) {
      const x = ((i * 53 - distance) % 1060 + 1060) % 1060 - 50;
      rect(x, GROUND + 8 + (i * 17 % 19), 3 + i % 7, 1);
    }
    obstacles.forEach(drawObstacle);
    drawCat();
    ctx.textAlign = 'right'; ctx.fillStyle = color('ink'); ctx.font = '30px monospace';
    ctx.fillText('BEST ' + String(runBest).padStart(5, '0') + '   ' + String(score).padStart(5, '0'), WIDTH - 28, 42);
    if (mode !== 'running') {
      ctx.textAlign = 'center'; ctx.fillStyle = color('muted'); ctx.font = '28px monospace';
      ctx.fillText(mode === 'ready' ? 'PRESS SPACE TO START' : mode === 'over' ? 'GAME OVER' : 'PAUSED', WIDTH / 2, 135);

    }
  }
  function frame(time) {
    if (lastTime === null) lastTime = time;
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    if (mode === 'running') {
      accumulator += dt;
      while (accumulator >= STEP && mode === 'running') { accumulator -= STEP; update(STEP); }
    }
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

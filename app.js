(() => {
  "use strict";

  const PUZZLE = JSON.parse(document.getElementById("puzzle-data").textContent);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ *
   * Sequence definition: 9 romantic clues, then 4 "frase final" words
   * ------------------------------------------------------------------ */
  const SEQUENCE = [
    { key: "spiderman",   display: "Spiderman",   clue: "Un personaje que creo que te gusta..." },
    { key: "fucsia",      display: "Fucsia",      clue: "Tu color favorito" },
    { key: "psicologia",  display: "Psicología",  clue: "Lo que me llamó la atención de ti desde el primer día que te escuché hablar" },
    { key: "sonrisa",     display: "Sonrisa",     clue: "Lo más lindo que puedo ver cuando estoy al frente tuyo" },
    { key: "rizos",       display: "Rizos",       clue: "Esa forma tan bonita que tiene tu cabello y que me encanta" },
    { key: "besos",       display: "Besos",       clue: "Lo que más deseo darte cada vez que te tengo cerca" },
    { key: "canonico",    display: "Canónico",    clue: "Nuestro encuentro siempre fue un evento..." },
    { key: "amor",        display: "Amor",        clue: "Lo que siento por ti cada que te veo" },
    { key: "futuro",      display: "Futuro",      clue: "Lo que quiero construir a tu lado" },
    { key: "quieres",     display: "QUIERES",     phrase: true },
    { key: "ser",         display: "SER",         phrase: true },
    { key: "mi",          display: "MI",          phrase: true },
    { key: "nubia_novia", display: "NOVIA",       phrase: true },
  ];
  const PHASE1_COUNT = 9;

  let currentIndex = 0;
  let foundCount = 0;
  let gridLetters = PUZZLE.grid.map(row => row.split(""));

  /* ------------------------------------------------------------------ *
   * Screen navigation
   * ------------------------------------------------------------------ */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
  }

  /* ------------------------------------------------------------------ *
   * Audio: tiny synth engine, no external files needed
   * ------------------------------------------------------------------ */
  const Audio_ = (() => {
    let ctx = null;
    let muted = false;
    let masterVolume = 0.7;
    let musicTimer = null;

    function getCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function tone(freq, start, dur, vol = 0.16, type = "sine") {
      if (muted) return;
      const c = getCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, c.currentTime + start);
      gain.gain.linearRampToValueAtTime(vol * masterVolume, c.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + start);
      osc.stop(c.currentTime + start + dur + 0.05);
    }

    function chime() {
      tone(880, 0, 0.22, 0.14, "triangle");
      tone(1318.5, 0.07, 0.28, 0.11, "triangle");
    }

    function success() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.11, 0.35, 0.15, "triangle"));
    }

    const MELODY = [523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 493.88, 587.33];
    function startMusic() {
      if (musicTimer || muted) return;
      let step = 0;
      const playStep = () => {
        if (muted) { step++; return scheduleNext(); }
        tone(MELODY[step % MELODY.length], 0, 1.1, 0.05, "sine");
        tone(MELODY[step % MELODY.length] / 2, 0, 1.3, 0.035, "sine");
        step++;
        scheduleNext();
      };
      function scheduleNext() { musicTimer = setTimeout(playStep, 620); }
      playStep();
    }
    function stopMusic() {
      if (musicTimer) clearTimeout(musicTimer);
      musicTimer = null;
    }

    function toggleMute() {
      muted = !muted;
      return muted;
    }

    return { chime, success, startMusic, stopMusic, toggleMute, invalid: () => tone(220, 0, 0.18, 0.08, "sawtooth"),
  setVolume: (v) => { masterVolume = v; },    };
  })();

 document.getElementById("volume-slider").addEventListener("input", (e) => {
    const v = e.target.value / 100;
    Audio_.setVolume(v);
    const bgm = document.getElementById("bgm");
    if (bgm) bgm.volume = v;
  });
  document.getElementById("volume-slider-final").addEventListener("input", (e) => {
  const v = e.target.value / 100;
  Audio_.setVolume(v);
  const bgm = document.getElementById("bgm");
  if (bgm) bgm.volume = v;
  document.getElementById("volume-slider").value = e.target.value;
});
  /* ------------------------------------------------------------------ *
   * Grid rendering
   * ------------------------------------------------------------------ */
  const gridEl = document.getElementById("grid");
  const gridWrapEl = document.getElementById("grid-wrap");
  gridEl.style.setProperty("--size", PUZZLE.size);

  function renderGrid() {
    gridEl.innerHTML = "";
    for (let r = 0; r < PUZZLE.size; r++) {
      for (let c = 0; c < PUZZLE.size; c++) {
        const div = document.createElement("div");
        div.className = "cell";
        div.dataset.row = r;
        div.dataset.col = c;
        div.id = `cell-${r}-${c}`;
        div.textContent = gridLetters[r][c];
        gridEl.appendChild(div);
      }
    }
  }
  renderGrid();

  function wordCells(key) {
    const p = PUZZLE.placements[key];
    const cells = [];
    for (let i = 0; i < p.len; i++) cells.push({ r: p.row + p.dr * i, c: p.col + p.dc * i });
    return cells;
  }

  /* ------------------------------------------------------------------ *
   * Progress dots
   * ------------------------------------------------------------------ */
  const dotsEl = document.getElementById("dots");
  for (let i = 0; i < PHASE1_COUNT; i++) {
    const d = document.createElement("div");
    d.className = "dot";
    d.id = `dot-${i}`;
    dotsEl.appendChild(d);
  }
  function refreshDots() {
    for (let i = 0; i < PHASE1_COUNT; i++) {
      const d = document.getElementById(`dot-${i}`);
      d.classList.toggle("done", i < foundCount);
      d.classList.toggle("now", i === foundCount);
    }
  }
  refreshDots();

  /* ------------------------------------------------------------------ *
   * Clue / phrase panel
   * ------------------------------------------------------------------ */
  const clueEyebrow = document.getElementById("clue-eyebrow");
  const clueText = document.getElementById("clue-text");
  const cluePista = document.getElementById("clue-mode-pista");
  const cluePhrase = document.getElementById("clue-mode-phrase");
  const phraseLine = document.getElementById("phrase-line");
  const foundStrip = document.getElementById("found-strip");

  function showPista(idx) {
    cluePista.style.display = "";
    cluePhrase.style.display = "none";
    clueEyebrow.textContent = `Pista ${idx + 1} de ${PHASE1_COUNT}`;
    clueText.textContent = SEQUENCE[idx].clue;
    startHintTimer(SEQUENCE[idx].key);
  }

  function renderPhrase() {
    cluePista.style.display = "none";
    cluePhrase.style.display = "";
    const phraseWords = SEQUENCE.slice(PHASE1_COUNT);
    const foundHere = foundCount - PHASE1_COUNT;
    const parts = phraseWords.map((w, i) =>
      i < foundHere
        ? `<span class="filled">${w.display}</span>`
        : `<span class="blank">＿＿＿</span>`
    );
    phraseLine.innerHTML = `¿ ${parts.join(" ")} ?`;
  }

  function addFoundChip(text) {
    const chip = document.createElement("div");
    chip.className = "found-chip";
    chip.textContent = "♥ " + text;
    foundStrip.appendChild(chip);
    foundStrip.scrollLeft = foundStrip.scrollWidth;
  }

  /* ------------------------------------------------------------------ *
   * Progressive hint: every 20s, light up one more letter of the
   * currently active word (first letter first, then the next, etc.)
   * Same behaviour for the 9 clue words and the 4 final-phrase words.
   * ------------------------------------------------------------------ */
  const HINT_INTERVAL_MS = 20000;
  const HINT_INTERVAL_FINAL_MS = 3000;
  let hintTimer = null;
  let hintRevealed = 0;

  function clearHints() {
    document.querySelectorAll(".cell.hint").forEach(c => c.classList.remove("hint"));
  }

  function stopHintTimer() {
    if (hintTimer) clearInterval(hintTimer);
    hintTimer = null;
    hintRevealed = 0;
    clearHints();
  }

  function startHintTimer(key, intervalMs = HINT_INTERVAL_MS) {
  stopHintTimer();
  clearHints();
  const cells = wordCells(key);
  hintTimer = setInterval(() => {
    if (hintRevealed >= cells.length) {
      clearInterval(hintTimer);
      hintTimer = null;
      return;
    }
    const { r, c } = cells[hintRevealed];
    const el = document.getElementById(`cell-${r}-${c}`);
    if (el) el.classList.add("hint");
    hintRevealed++;
  }, intervalMs);
}

  /* ------------------------------------------------------------------ *
   * Selection engine (pointer drag across the grid)
   * ------------------------------------------------------------------ */
  let dragging = false;
  let startCell = null;
  let paintedIds = new Set();

  function cellFromPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    return el && el.closest(".cell");
  }

  function computeLine(a, b) {
    const dr = b.r - a.r, dc = b.c - a.c;
    if (dr === 0 && dc === 0) return [a];
    if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return null;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    const sr = dr === 0 ? 0 : dr / Math.abs(dr);
    const sc = dc === 0 ? 0 : dc / Math.abs(dc);
    const path = [];
    for (let i = 0; i <= steps; i++) path.push({ r: a.r + sr * i, c: a.c + sc * i });
    return path;
  }

  function paint(path, cls) {
    clearPaintClass();
    path.forEach(({ r, c }) => {
      const el = document.getElementById(`cell-${r}-${c}`);
      if (el) { el.classList.add(cls); paintedIds.add(el.id); }
    });
  }
  function clearPaintClass() {
    paintedIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove("selecting"); el.classList.remove("invalid"); }
    });
    paintedIds.clear();
  }

  function pathMatchesKey(path, key) {
    const target = wordCells(key);
    if (path.length !== target.length) return false;
    const forward = target.every((t, i) => t.r === path[i].r && t.c === path[i].c);
    const reversed = target.every((t, i) => t.r === path[path.length - 1 - i].r && t.c === path[path.length - 1 - i].c);
    return forward || reversed;
  }

  gridEl.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    dragging = true;
    startCell = { r: +cell.dataset.row, c: +cell.dataset.col };
    paint([startCell], "selecting");
    gridEl.setPointerCapture(e.pointerId);
  });

  gridEl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    const r = +cell.dataset.row, c = +cell.dataset.col;
    const path = computeLine(startCell, { r, c });
    if (path) paint(path, "selecting");
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    const path = [...paintedIds].map(id => {
      const [, r, c] = id.split("-");
      return { r: +r, c: +c };
    });
    // restore original order (top-to-bottom set doesn't preserve order reliably) -> recompute from last known cell
    const lastCell = e && e.clientX ? cellFromPoint(e.clientX, e.clientY) : null;
    let finalPath = path;
    if (lastCell) {
      const r = +lastCell.dataset.row, c = +lastCell.dataset.col;
      const recomputed = computeLine(startCell, { r, c });
      if (recomputed) finalPath = recomputed;
    }
    handleAttempt(finalPath);
  }
  gridEl.addEventListener("pointerup", endDrag);
  gridEl.addEventListener("pointercancel", () => { dragging = false; clearPaintClass(); });

  function handleAttempt(path) {
    const activeKey = SEQUENCE[currentIndex].key;
    if (path.length > 1 && pathMatchesKey(path, activeKey)) {
      markFound(activeKey, path);
    } else if (path.length > 1) {
      paint(path, "invalid");
      Audio_.invalid();
      setTimeout(clearPaintClass, 260);
    } else {
      clearPaintClass();
    }
  }

  function markFound(key, path) {
    clearPaintClass();
    path.forEach(({ r, c }) => document.getElementById(`cell-${r}-${c}`).classList.add("found"));
    stopHintTimer();
    Audio_.chime();
    foundCount++;

    const entry = SEQUENCE[currentIndex];
    if (!entry.phrase) addFoundChip(entry.display);

    currentIndex++;

    if (foundCount === PHASE1_COUNT) {
      refreshDots();
      triggerTransition();
    } else if (foundCount < PHASE1_COUNT) {
      refreshDots();
      showPista(currentIndex);
    } else if (foundCount < SEQUENCE.length) {
      renderPhrase();
      startHintTimer(SEQUENCE[currentIndex].key);
      startHintTimer(SEQUENCE[currentIndex].key, HINT_INTERVAL_FINAL_MS);
    } else {
      renderPhrase();
      startProposalSequence();
    }
  }

  /* ------------------------------------------------------------------ *
   * Transition: full-screen cover + hot-swap NUBIA -> NOVIA
   * ------------------------------------------------------------------ */
  function triggerTransition() {
    const overlay = document.getElementById("transition-overlay");
    overlay.classList.add("show");
    setTimeout(() => {
      hotSwapNovia();
    }, 420);
    setTimeout(() => {
      overlay.classList.remove("show");
      renderPhrase();
      startHintTimer(SEQUENCE[currentIndex].key);
      startHintTimer(SEQUENCE[currentIndex].key, HINT_INTERVAL_FINAL_MS);
    }, 10000);
  }

  function hotSwapNovia() {
    const p = PUZZLE.placements.nubia_novia;
    // NUBIA -> NOVIA differs only at offsets 1 (U->O) and 2 (B->V)
    const changes = [[1, "O"], [2, "V"]];
    changes.forEach(([i, letter]) => {
      const r = p.row + p.dr * i, c = p.col + p.dc * i;
      gridLetters[r][c] = letter;
      const el = document.getElementById(`cell-${r}-${c}`);
      if (el) el.textContent = letter;
    });
  }

  /* ------------------------------------------------------------------ *
   * Proposal scene: simple Sí / No buttons
   * ------------------------------------------------------------------ */
  function startProposalSequence() {
    setTimeout(() => {
      showScreen("screen-proposal");
      wireProposalButtons();
    }, 700);
  }
let proposalWired = false; 
  function wireProposalButtons() {
  if (proposalWired) return;
  proposalWired = true;
  const yesBtn = document.getElementById("btn-yes");
  const noBtn = document.getElementById("btn-no");
  const scene = document.querySelector(".proposal-buttons");

  function moveRandom(el) {
  const margin = 20; // para que no quede pegado al borde
  const elRect = el.getBoundingClientRect();
  const maxX = window.innerWidth - elRect.width - margin * 2;
  const maxY = window.innerHeight - elRect.height - margin * 2;

  const x = margin + Math.random() * maxX;
  const y = margin + Math.random() * maxY;

  el.style.position = "fixed";
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.style.margin = "0";
}

  noBtn.addEventListener("click", () => moveRandom(noBtn));

  let yesMoves = 0;
  yesBtn.addEventListener("click", () => {
    if (yesMoves < 5) {
      moveRandom(yesBtn);
      yesMoves++;
      return;
    }
    document.getElementById("bgm").play().catch(() => {});
    showScreen("screen-final");
    burstConfetti();
  });
}

  /* ------------------------------------------------------------------ *
   * Confetti (lightweight canvas, no dependencies)
   * ------------------------------------------------------------------ */
  function burstConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ["#D81B72", "#E8AC3E", "#FFFFFF", "#FBD9E9", "#9C0F53"];
    const count = reduceMotion ? 0 : 140;
    const particles = Array.from({ length: count }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 60,
      y: canvas.height * 0.25,
      vx: (Math.random() - 0.5) * 9,
      vy: Math.random() * -9 - 3,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      grav: 0.28 + Math.random() * 0.12,
    }));
    let frame = 0;
    function tick() {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.vy += p.grav * 0.05;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (frame < 220) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    Audio_.success();
    tick();
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  document.getElementById("btn-play").addEventListener("click", () => {
    showScreen("screen-game");
    showPista(0);
  });

  window.addEventListener("resize", () => {
    const canvas = document.getElementById("confetti-canvas");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
})();

/**
 * CineVault — Cinematic Identity Wall
 * TMDB-powered magnetic movie poster experience
 * GPU-accelerated canvas · 60fps · Portrait 2:3 poster cells
 */

'use strict';

/* ============================================================
   TMDB CONFIGURATION
   ============================================================ */
const TMDB = {
  TOKEN: 'YOUR_TMDB_API_TOKEN_HERE',
  BASE: 'https://api.themoviedb.org/3',
  IMG: 'https://image.tmdb.org/t/p/',
  GRID_SIZE: 'w342',   /* ~342×513 for cells     */
  MODAL_SIZE: 'w500',   /* ~500×750 for modal     */
};

const LOCAL_POSTERS = [
  'images/Neutral-Portrait.png',
  'images/Woman-in-Green-Jacket.png',
  'images/Golden-Hour-Snowboarders-in-Sync.png',
  'images/Mid-Air-Majesty-Snowboarders-Flight-Against-the-Blue.png',
  'images/visualelectric-1759560770609.png',
  'images/Futuristic-Portrait.png',
  'images/Cheerful-Sunglasses-Portrait.png',
  'images/visualelectric-1771663523750.png',
  'images/visualelectric-1760165011067.png',
  'images/visualelectric-1759560765488.png',
  'images/visualelectric-1760164975617.png',
  'images/Dynamic-Snowboarder-Carving-Powder.png',
  'images/Playful-Starry-Portrait.png',
  'images/Snowboarder-Mid-Jump.png',
  'images/Skier-in-Snowy-Forest.png',
  'images/Joyful-Portrait-Outdoors.png',
  'images/Futuristic-Corridor-Walk.png',
  'images/Sunset-Serenity.png',
  'images/Man-Relaxing-Outdoors.png',
  'images/visualelectric-1759560749255.png',
  'images/visualelectric-1760165065844.jpg',
  'images/Snowboarding-Adventure.png',
  'images/Serene-Portrait-Outdoors.png',
  'images/Smiling-Man-Portrait.png',
  'images/Dynamic-Ski-Descent.png',
];

/* ============================================================
   DESIGN TOKENS — MAGNETIC FIELD
   ============================================================ */
const TOKENS = {
  grid: {
    /*
     * step = the distance between cell centres.
     * maxWD must be < stepXD to guarantee zero overlap.
     * 56 − 4 = 52 ⇒ 2 px gap each side at peak magnification.
     */
    stepXD: 112,  /* desktop column pitch px  */
    stepYD: 162,  /* desktop row pitch px     */
    stepXM: 88,   /* mobile column pitch px   */
    stepYM: 130,  /* mobile row pitch px      */
    baseWD: 54,   /* idle poster width desk.  */
    baseWM: 44,   /* idle poster width mobile */
    jitter: 25,   /* random offset for organic scatter */
  },
  field: {
    radiusFraction: 0.30, /* influence radius fraction of min(W,H) */
    radiusMin: 220,
    radiusMax: 360,
    /*
     * maxWD < stepXD ⇒ NO OVERLAP EVER.
     * Circles at max size are 52 px wide, centres 56 px apart.
     */
    maxWD: 88,  /* desktop peak poster width */
    maxWM: 70,  /* mobile peak poster width  */
    scalePower: 1.9,
  },
  motion: {
    lerp: 0.16,
    introRate: 0.035,
  },
  opacity: {
    idleMin: 0.24,
    idleRange: 0.12,
    activeBoost: 0.58,
  },
  spotlight: {
    midStop: 0.38,
    outerStop: 0.72,
    edgeAlpha: 0.50,
    idleAlpha: 0.26,
  },
  grayFade: 0.18,  /* eased threshold for full colour */
  strokeShow: 0.40,  /* eased threshold for arc ring    */
};

/* ============================================================
   ACCESSIBILITY
   ============================================================ */
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   STATE
   ============================================================ */
let movies = [];   /* TMDB movie objects             */
let images = [];   /* parallel Image[] for grid cells */
let genreMap = {};  /* id → name                      */

let cells = [];
let camera = { x: 0, y: 0, vx: 0, vy: 0 };
let gridCols = 0;
let gridRows = 0;
let width = 0;
let height = 0;
let dpr = 1;
let raf = 0;
let introProgress = 0;       /* 0 → 1 ambient fade-in */
let interacted = false;   /* first mouse move       */

const pointer = {
  x: -99999, y: -99999,  /* smooth lerped position  */
  tx: -99999, ty: -99999, /* raw target position     */
  active: false,
  strength: 0,            /* current influence strength */
  targetStrength: 0,      /* target influence strength */
  isTouch: false,
};

/* ============================================================
   DOM REFS
   ============================================================ */
const canvas = document.getElementById('magnetic-grid');
const ctx = canvas.getContext('2d', { alpha: false });
const loadingEl = document.getElementById('loading-screen');
const lsSub = document.getElementById('ls-sub');
const wordmarkEl = document.getElementById('cv-wordmark');
const hintEl = document.getElementById('cv-hint');
const modal = document.getElementById('cv-modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalPanel = document.getElementById('modal-panel');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalPoster = document.getElementById('modal-poster');
const modalGlow = document.getElementById('modal-poster-glow');
const modalTitle = document.getElementById('modal-title');
const modalSub = document.getElementById('modal-sub');
const modalScore = document.getElementById('modal-score');
const modalVotes = document.getElementById('modal-votes');
const modalGenres = document.getElementById('modal-genres');
const modalOverview = document.getElementById('modal-overview');

/* ============================================================
   UTILITIES
   ============================================================ */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function easeOut3(t) { return 1 - Math.pow(1 - t, 3); }
function lerp(a, b, t) { return a + (b - a) * t; }

/** Deterministic hash 0-1 from integer seed */
function hash(n) {
  const x = Math.sin(n * 999.91) * 10000;
  return x - Math.floor(x);
}

/** Map a cell (row, col) to a movie / image by deterministic index */
function idxForCell(row, col) {
  if (!movies.length) return 0;
  return Math.abs((row * 17 + col * 11 + row * 3) % movies.length);
}

/** Format a TMDB vote count */
function fmtVotes(n) {
  if (!n) return '';
  if (n >= 1000) return `(${(n / 1000).toFixed(1)}k votes)`;
  return `(${n} votes)`;
}

function titleFromPath(path) {
  return path
    .split('/')
    .pop()
    .replace(/\.[^.]+$/, '')
    .replace(/^visualelectric-\d+$/, 'Cinematic Memory')
    .replace(/-/g, ' ');
}

function buildLocalMovies() {
  genreMap = {
    local: 'Cinematic',
    memory: 'Vault',
    visual: 'Poster',
  };

  movies = LOCAL_POSTERS.map((path, index) => ({
    id: `local-${index}`,
    title: titleFromPath(path),
    year: '2026',
    language: 'EN',
    genreIds: ['local', index % 2 ? 'memory' : 'visual'],
    rating: (8 + (index % 14) / 10).toFixed(1),
    votes: 1200 + index * 137,
    overview: 'A saved visual from your local CineVault collection.',
    posterGrid: path,
    posterModal: path,
  }));

  images = movies.map(m => {
    const img = new Image();
    img.decoding = 'async';
    img.src = m.posterGrid;
    img.addEventListener('error', () => { img._failed = true; });
    return img;
  });
}

/* ============================================================
   TMDB API
   ============================================================ */
const tmdbHeaders = {
  'Authorization': `Bearer ${TMDB.TOKEN}`,
  'Content-Type': 'application/json',
};

async function tmdbGet(path) {
  const res = await fetch(`${TMDB.BASE}${path}`, { headers: tmdbHeaders });
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`);
  return res.json();
}

async function fetchAllMovies() {
  lsSub.textContent = 'Loading your Letterboxd vault…';

  const res = await fetch('./movies.json');
  if (!res.ok) throw new Error('Failed to load movies.json');

  const data = await res.json();

  if (data.genreMap) {
    Object.assign(genreMap, data.genreMap);
  }

  movies = data.movies.filter(m => m.posterGrid); // Ensure they have a poster

  lsSub.textContent = `${movies.length} films loaded — building your vault…`;

  /* 4 ── Preload Image objects */
  images = movies.map(m => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.src = m.posterGrid;
    return img;
  });
}

/* ============================================================
   CANVAS RESIZE
   ============================================================ */
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  buildCells();
}

/* ============================================================
   BUILD CELLS — portrait 2:3 grid
   ============================================================ */
function buildCells() {
  const totalMovies = movies.length;
  if (totalMovies === 0) {
    cells = [];
    return;
  }

  const aspect = width / height;
  gridRows = Math.ceil(Math.sqrt(totalMovies / aspect));
  gridCols = Math.ceil(totalMovies / gridRows);

  if (REDUCE_MOTION) {
    generateVisibleCells();
  }
}

function generateVisibleCells() {
  const mob = width < 720;
  const baseW = mob ? TOKENS.grid.baseWM : TOKENS.grid.baseWD;
  const maxD = mob ? TOKENS.field.maxWM : TOKENS.field.maxWD;
  const stepX = mob ? TOKENS.grid.stepXM : TOKENS.grid.stepXD;
  const stepY = mob ? TOKENS.grid.stepYM : TOKENS.grid.stepYD;
  const J = TOKENS.grid.jitter;

  const totalW = gridCols * stepX;
  const totalH = gridRows * stepY;

  if (totalW > 0) camera.x = ((camera.x % totalW) + totalW) % totalW;
  if (totalH > 0) camera.y = ((camera.y % totalH) + totalH) % totalH;

  const margin = maxD * 2;
  const startCol = Math.floor((camera.x - margin) / stepX);
  const endCol = Math.ceil((camera.x + width + margin) / stepX);
  const startRow = Math.floor((camera.y - margin) / stepY);
  const endRow = Math.ceil((camera.y + height + margin) / stepY);

  let i = 0;
  if (movies.length > 0) {
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const wrappedC = ((c % gridCols) + gridCols) % gridCols;
        const wrappedR = ((r % gridRows) + gridRows) % gridRows;
        const mIdx = (wrappedR * gridCols + wrappedC) % movies.length;

        const s1 = hash(mIdx);
        const s2 = hash(mIdx * 2.618);
        const s3 = hash(mIdx * 1.414);

        const jx = (s2 - 0.5) * J * 2;
        const jy = (s3 - 0.5) * J * 2;

        // Offset alternate rows by half a step to create an organic honeycomb/staggered layout
        const rowOffset = (Math.abs(r) % 2 === 1) ? stepX * 0.5 : 0;

        const cx = c * stepX - camera.x + jx + rowOffset;
        const cy = r * stepY - camera.y + jy;

        if (i < cells.length) {
          const cell = cells[i];
          cell.x = cx; cell.y = cy;
          cell.baseW = baseW; cell.baseH = baseW * 1.5;
          cell.seed = s1;
          cell.movie = movies[mIdx] || null;
          cell.image = images[mIdx] || null;
        } else {
          cells.push({ x: cx, y: cy, baseW, baseH: baseW * 1.5, seed: s1, movie: movies[mIdx] || null, image: images[mIdx] || null, _eased: 0, _w: baseW, _h: baseW * 1.5, _alpha: 1 });
        }
        i++;
      }
    }
  }
  cells.length = i;
}

/* ============================================================
   POINTER
   ============================================================ */
let scrollTimeout;

let touchDown = false;
let lastTouchX = null;
let lastTouchY = null;
let touchVelX = 0;
let touchVelY = 0;

function onPointerDown(e) {
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  pointer.active = true;
  pointer.targetStrength = 1.0;
  pointer.isTouch = e.pointerType === 'touch';
  
  if (pointer.isTouch) {
    touchDown = true;
    lastTouchX = e.clientX;
    lastTouchY = e.clientY;
    touchVelX = 0;
    touchVelY = 0;
    camera.vx = 0;
    camera.vy = 0;
  }
  
  if (!interacted) {
    interacted = true;
    wordmarkEl.classList.add('is-hidden');
    hintEl.classList.add('is-hidden');
  }
}

function onPointerMove(e) {
  pointer.tx = e.clientX;
  pointer.ty = e.clientY;
  pointer.active = true;
  pointer.targetStrength = 1.0;
  pointer.isTouch = e.pointerType === 'touch';

  if (pointer.isTouch && touchDown) {
    if (lastTouchX !== null && lastTouchY !== null) {
      const dx = e.clientX - lastTouchX;
      const dy = e.clientY - lastTouchY;
      camera.x -= dx;
      camera.y -= dy;
      touchVelX = -dx;
      touchVelY = -dy;
    }
    lastTouchX = e.clientX;
    lastTouchY = e.clientY;
  }

  if (!interacted) {
    interacted = true;
    wordmarkEl.classList.add('is-hidden');
    hintEl.classList.add('is-hidden');
  }
}

function onPointerUp(e) {
  if (e.pointerType === 'touch') {
    pointer.active = false;
    pointer.targetStrength = 0.0;
    touchDown = false;
    lastTouchX = null;
    lastTouchY = null;
    camera.vx = touchVelX;
    camera.vy = touchVelY;
  }
}

function onPointerLeave(e) {
  if (e.pointerType !== 'touch') {
    pointer.active = false;
    pointer.targetStrength = 0.0;
  }
}

function onScroll() {
  if (!pointer.active && width < 720) {
    pointer.tx = width / 2;
    pointer.ty = height / 2;
    pointer.targetStrength = 0.3;
    pointer.isTouch = true;
    
    if (!interacted) {
      interacted = true;
      wordmarkEl.classList.add('is-hidden');
      hintEl.classList.add('is-hidden');
    }
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (!pointer.active) {
        pointer.targetStrength = 0.0;
      }
    }, 150);
  }
}

/* ============================================================
   DRAW CELL — portrait 2:3 poster tile
   ============================================================ */
function roundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCell(cell, eased, w, h, alpha) {
  const x = Math.round(cell.x - w * 0.5);
  const y = Math.round(cell.y - h * 0.5);
  const rw = Math.round(w);
  const rh = Math.round(h);

  ctx.save();
  ctx.globalAlpha = alpha;

  roundedRect(x, y, rw, rh, Math.max(5, rw * 0.08));
  ctx.clip();

  const { image } = cell;

  if (image && image.complete && image.naturalWidth > 0) {

    /* Cache source crop once per image to fill the 2:3 tile cleanly. */
    if (!image._c) {
      const iW = image.naturalWidth;
      const iH = image.naturalHeight;
      const target = 2 / 3;
      const source = iW / iH;
      if (source > target) {
        const sw = iH * target;
        image._c = { sx: (iW - sw) * 0.5, sy: 0, sw, sh: iH };
      } else {
        const sh = iW / target;
        image._c = { sx: 0, sy: (iH - sh) * 0.5, sw: iW, sh };
      }
    }
    const { sx, sy, sw, sh } = image._c;

    ctx.drawImage(image, sx, sy, sw, sh, x, y, rw, rh);

    if (eased < TOKENS.grayFade) {
      const t = 1 - eased / TOKENS.grayFade;  /* 1 = full grey, 0 = full colour */
      ctx.fillStyle = `rgba(8,8,8,${(t * 0.46).toFixed(2)})`;
      ctx.fillRect(x, y, rw, rh);
    }

  } else {
    const shade = Math.round(28 + cell.seed * 26);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(x, y, rw, rh);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x, y + rh - 18, rw, 18);

  ctx.restore();
}

/* ============================================================
   RENDER LOOP
   ============================================================ */
let _lastCursor = 'crosshair';

function render() {
  /* ── Ambient intro fade-in ───────────────────────── */
  if (introProgress < 1) {
    introProgress = Math.min(1, introProgress + TOKENS.motion.introRate);
  }
  const introEased = easeOut3(introProgress);

  /* ── Smooth pointer & Camera Panning ─────────────── */
  pointer.x = lerp(pointer.x, pointer.tx, TOKENS.motion.lerp);
  pointer.y = lerp(pointer.y, pointer.ty, TOKENS.motion.lerp);
  pointer.strength = lerp(pointer.strength, pointer.targetStrength, TOKENS.motion.lerp * 0.5);

  if (pointer.active && interacted) {
    if (!pointer.isTouch) {
      const panZoneX = Math.min(250, width * 0.15);
      const panZoneY = Math.min(250, height * 0.15);
      const accel = 0.15;
      const maxSpeed = 5;

      // X Axis panning
      if (pointer.tx < panZoneX) camera.vx -= accel;
      else if (pointer.tx > width - panZoneX) camera.vx += accel;
      else camera.vx *= 0.95;

      // Y Axis panning
      if (pointer.ty < panZoneY) camera.vy -= accel;
      else if (pointer.ty > height - panZoneY) camera.vy += accel;
      else camera.vy *= 0.95;

      camera.vx = clamp(camera.vx, -maxSpeed, maxSpeed);
      camera.vy = clamp(camera.vy, -maxSpeed, maxSpeed);
    } else {
      camera.vx *= 0.95;
      camera.vy *= 0.95;
    }
  } else {
    camera.vx *= 0.96;
    camera.vy *= 0.96;
  }

  camera.x += camera.vx;
  camera.y += camera.vy;

  /* ── Clear to near-black ─────────────────────────── */
  ctx.fillStyle = '#030303';
  ctx.fillRect(0, 0, width, height);

  /* ── Field params ────────────────────────────────── */
  const mob = width < 720;
  const radius = clamp(
    Math.min(width, height) * TOKENS.field.radiusFraction,
    TOKENS.field.radiusMin,
    TOKENS.field.radiusMax
  );
  const base = mob ? TOKENS.grid.baseWM : TOKENS.grid.baseWD;
  const maxD = mob ? TOKENS.field.maxWM : TOKENS.field.maxWD;

  /* ══════════════════════════════════════════════════
   * INFINITE GRID GENERATOR & PHYSICS PASS
   * ══════════════════════════════════════════════════ */
  generateVisibleCells();

  let overCell = false;

  for (const cell of cells) {
    const dx = pointer.x - cell.x;
    const dy = pointer.y - cell.y;
    const d = Math.sqrt(dx * dx + dy * dy);

    const distFactor = clamp(1 - d / radius, 0, 1);
    const magnet = distFactor * pointer.strength;
    const eased = easeOut3(magnet);
    const scaleP = Math.pow(eased, TOKENS.field.scalePower);
    const w = base + (maxD - base) * scaleP;
    const h = w * 1.5;

    const idleA = TOKENS.opacity.idleMin + cell.seed * TOKENS.opacity.idleRange;
    const alpha = clamp((idleA + eased * TOKENS.opacity.activeBoost) * introEased, 0, 1);

    cell._eased = eased;
    cell._w = w;
    cell._h = h;
    cell._alpha = alpha;

    if (!overCell && eased > 0.10) {
      const dcx = pointer.tx - cell.x;
      const dcy = pointer.ty - cell.y;
      if (Math.abs(dcx) <= w * 0.5 && Math.abs(dcy) <= h * 0.5) overCell = true;
    }
  }

  /* ── Cursor style ────────────────────────────────── */
  const wantCursor = overCell ? 'pointer' : 'crosshair';
  if (wantCursor !== _lastCursor) {
    canvas.className = overCell ? 'cursor-pointer' : '';
    _lastCursor = wantCursor;
  }

  /* ══════════════════════════════════════════════════
   * DRAW PASS — Draw all cells
   * ══════════════════════════════════════════════════ */
  for (const cell of cells) {
    if (cell._alpha <= 0.02) continue;
    drawCell(cell, cell._eased, cell._w, cell._h, cell._alpha);
  }

  /* ── Arc rings on peak-magnified cells ───────────── */
  for (const cell of cells) {
    if (cell._eased < TOKENS.strokeShow) continue;
    const t = (cell._eased - TOKENS.strokeShow) / (1 - TOKENS.strokeShow);
    const sA = (0.06 + t * 0.22).toFixed(3);
    const w = Math.round(cell._w);
    const h = Math.round(cell._h);
    roundedRect(
      Math.round(cell.x - w * 0.5) + 0.5,
      Math.round(cell.y - h * 0.5) + 0.5,
      w - 1,
      h - 1,
      Math.max(5, w * 0.08)
    );
    ctx.strokeStyle = `rgba(255,255,255,${sA})`;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  }

  /* ══════════════════════════════════════════════════
   * SPOTLIGHT OVERLAY
   * Radial gradient: transparent torch at cursor,
   * deep cinematic black at viewport edges.
   * Drawn LAST so it darkens everything uniformly.
   * ══════════════════════════════════════════════════ */
  const sp = TOKENS.spotlight;
  if (pointer.strength > 0.01) {
    if (mob) {
      // Massive mobile optimization: gradients covering the entire screen drop FPS significantly.
      // Use a flat dimmed background with a very subtle global opacity reduction.
      const alpha = lerp(sp.idleAlpha, sp.outerStop * 0.8, pointer.strength);
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, 0, width, height);
    } else {
      const spotR = radius * 1.65;
      const grad = ctx.createRadialGradient(
        pointer.x, pointer.y, 0,
        pointer.x, pointer.y, spotR
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(sp.midStop, 'rgba(0,0,0,0.10)');
      grad.addColorStop(sp.outerStop, 'rgba(0,0,0,0.80)');
      grad.addColorStop(1, `rgba(0,0,0,${sp.edgeAlpha})`);
      
      ctx.globalAlpha = pointer.strength;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      
      ctx.globalAlpha = 1 - pointer.strength;
      ctx.fillStyle = `rgba(0,0,0,${sp.idleAlpha})`;
      ctx.fillRect(0, 0, width, height);
      
      ctx.globalAlpha = 1.0;
    }
  } else {
    ctx.fillStyle = `rgba(0,0,0,${sp.idleAlpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  raf = requestAnimationFrame(render);
}


/* ============================================================
   REDUCED-MOTION FALLBACK — static snapshot
   ============================================================ */
function renderStatic() {
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);
  for (const cell of cells) {
    const { baseW: w, baseH: h, image, seed } = cell;
    const alpha = TOKENS.opacity.idleMin + seed * TOKENS.opacity.idleRange;
    ctx.save();
    ctx.globalAlpha = alpha;
    const x = Math.round(cell.x - w * 0.5);
    const y = Math.round(cell.y - h * 0.5);
    roundedRect(x, y, Math.round(w), Math.round(h), Math.max(5, w * 0.08));
    ctx.clip();
    if (image && image.complete && image.naturalWidth > 0) {
      if (!image._c) {
        const iW = image.naturalWidth;
        const iH = image.naturalHeight;
        const target = 2 / 3;
        const source = iW / iH;
        if (source > target) {
          const sw = iH * target;
          image._c = { sx: (iW - sw) * 0.5, sy: 0, sw, sh: iH };
        } else {
          const sh = iW / target;
          image._c = { sx: 0, sy: (iH - sh) * 0.5, sw: iW, sh };
        }
      }
      const { sx, sy, sw, sh } = image._c;
      ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
    } else {
      const shade = Math.round(22 + seed * 22);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }
}

/* ============================================================
   CLICK → OPEN MODAL
   ============================================================ */
canvas.addEventListener('click', e => {
  if (modal && !modal.hasAttribute('hidden')) return; /* modal already open */

  const cx = e.clientX;
  const cy = e.clientY;

  /*
   * CORRECT CLICK DETECTION
   * ─────────────────────────────────────────────────────────────
   * Problem: magnetic drift moves all nearby cells toward the cursor,
   * so many cells' rendered bounds overlap the same region.
   * Finding "max eased within click bounds" picks the wrong cell
   * because the visually topmost poster isn't always the max-eased one.
   *
   * Fix: score each magnified cell by BOTH eased value AND how close
   * its rendered centre is to the actual click point. The cell whose
   * centre is nearest to the cursor IS the dominant visual poster.
   * ─────────────────────────────────────────────────────────────
   */
  let best = null;
  let bestScore = -Infinity;

  for (const cell of cells) {
    if (!cell.movie || cell._eased < 0.04) continue;

    /* Cell anchor IS the rendered centre (no drift) */
    const dist = Math.sqrt((cx - cell.x) ** 2 + (cy - cell.y) ** 2);

    /* Score: magnification dominates, distance breaks ties */
    const score = cell._eased * 1000 - dist;

    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }

  /* Fallback: nearest cell anchor to click */
  if (!best) {
    let minD = Infinity;
    for (const cell of cells) {
      if (!cell.movie) continue;
      const dx = Math.abs(cx - cell.x);
      const dy = Math.abs(cy - cell.y);
      if (dx > cell._w * 0.65 || dy > cell._h * 0.65) continue;
      const d = Math.sqrt(dx ** 2 + dy ** 2);
      if (d < minD) { minD = d; best = cell; }
    }
  }

  if (best && best.movie) openModal(best.movie);
});

/* ============================================================
   MODAL — OPEN
   ============================================================ */
function openModal(movie) {
  /* Populate content */
  modalTitle.textContent = movie.title;
  modalScore.textContent = movie.rating;
  modalVotes.textContent = fmtVotes(movie.votes);

  /* Year · Language */
  const parts = [movie.year];
  if (movie.language && movie.language !== 'EN') parts.push(movie.language);
  modalSub.textContent = parts.join(' · ');

  /* Overview */
  modalOverview.textContent = movie.overview || 'No overview available.';

  /* Genres */
  modalGenres.innerHTML = '';
  const genres = (movie.genreIds || [])
    .map(id => genreMap[id])
    .filter(Boolean)
    .slice(0, 5);
  for (const g of genres) {
    const span = document.createElement('span');
    span.className = 'genre-pill';
    span.textContent = g;
    modalGenres.appendChild(span);
  }

  /* Poster */
  modalPoster.alt = `${movie.title} poster`;
  modalPoster.src = movie.posterModal;

  /* Subtle glow (gold accent) */
  modalGlow.style.background = 'var(--c-gold)';

  /* Show modal */
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    modal.classList.add('is-open');
    modalCloseBtn.focus({ preventScroll: true });
  });
}

/* ============================================================
   MODAL — CLOSE
   ============================================================ */
function closeModal() {
  modal.classList.remove('is-open');
  document.body.style.overflow = '';

  /* Wait for panel transition to finish before hiding */
  modalPanel.addEventListener('transitionend', function onEnd() {
    modal.setAttribute('hidden', '');
    modalPoster.src = '';  /* release memory */
    modalPanel.removeEventListener('transitionend', onEnd);
  }, { once: true });
}

modalCloseBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modal.hasAttribute('hidden')) closeModal();
});

/* ============================================================
   EVENTS
   ============================================================ */
window.addEventListener('resize', () => {
  cancelAnimationFrame(raf);
  resize();
  if (!REDUCE_MOTION) raf = requestAnimationFrame(render);
  else renderStatic();
}, { passive: true });

window.addEventListener('pointermove', onPointerMove, { passive: true });
window.addEventListener('pointerdown', onPointerDown, { passive: true });
window.addEventListener('pointerup', onPointerUp, { passive: true });
window.addEventListener('pointercancel', onPointerUp, { passive: true });
canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
window.addEventListener('scroll', onScroll, { passive: true });

/* ============================================================
   BOOT
   ============================================================ */
(async function boot() {
  buildLocalMovies();
  lsSub.textContent = `${movies.length} local posters loaded`;

  /* Size canvas and start immediately so the page never waits on network. */
  resize();
  loadingEl.classList.add('is-hidden');

  if (REDUCE_MOTION) {
    renderStatic();
    for (const img of images) img.addEventListener('load', renderStatic, { once: true });
  } else {
    raf = requestAnimationFrame(render);
  }

  try {
    await fetchAllMovies();

    /* Swap to remote posters only if TMDB succeeds. */
    resize();
    for (const img of images) {
      img.addEventListener('error', () => { img._failed = true; });
      if (REDUCE_MOTION) img.addEventListener('load', renderStatic, { once: true });
    }

  } catch (err) {
    console.warn('[CineVault] TMDB unavailable, using local posters.', err);
  }
})();

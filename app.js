/**
 * PixelLab / DOMPainter - Editor de Pixel Art
 * Canvas + ImageData, Quantização, Dithering, Export, Undo/Redo
 */

// ============ CONFIGURAÇÃO ============
const FILTERS = [
  { id: 'brightness', label: 'Brilho', min: 0, max: 200, default: 100, unit: '%' },
  { id: 'contrast', label: 'Contraste', min: 0, max: 200, default: 100, unit: '%' },
  { id: 'saturation', label: 'Saturação', min: 0, max: 200, default: 100, unit: '%' },
  { id: 'blur', label: 'Desfoque', min: 0, max: 10, default: 0, unit: 'px' },
  { id: 'grayscale', label: 'Escala de Cinza', min: 0, max: 100, default: 0, unit: '%' },
  { id: 'sepia', label: 'Sépia', min: 0, max: 100, default: 0, unit: '%' },
  { id: 'hueRotate', label: 'Matiz', min: 0, max: 360, default: 0, unit: 'deg' },
  { id: 'invert', label: 'Inverter', min: 0, max: 100, default: 0, unit: '%' },
];

const MOSAIC_ZOOM_MIN = 0.25;
const MOSAIC_ZOOM_MAX = 4;
const MOSAIC_ZOOM_STEP = 0.1;
const FPS_SAMPLE_INTERVAL = 500;
const HISTORY_MAX = 50;

const $ = {};
let state = {
  image: null,
  filters: {},
  mode: 'canvas',
  mosaicSize: 40,
  pixelData: null,
  pixelWidth: 0,
  pixelHeight: 0,
  tool: 'paint',
  paintColor: '#7c3aed',
  rafId: null,
  lastFpsUpdate: 0,
  frameCount: 0,
  mosaicZoom: 1,
  mosaicPanX: 0,
  mosaicPanY: 0,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panStartOffsetX: 0,
  panStartOffsetY: 0,
  useCanvas: true,
  ditherType: null,
  history: [],
  historyIndex: -1,
};

// ============ UTILITÁRIOS ============
function throttle(fn, delay) {
  let last = 0;
  return function (...args) {
    const now = performance.now();
    if (now - last >= delay) {
      last = now;
      fn.apply(this, args);
    }
  };
}

function debounce(fn, delay) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

const raf = window.requestAnimationFrame || window.setTimeout;

// Cache de contexto e canvas reutilizáveis
let _tempCanvas = null;
let _tempCtx = null;
let _mainCtx = null;
let _pixelCtx = null;

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

const _hexCache = { hex: '', rgb: [0, 0, 0] };
function hexToRgb(hex) {
  if (_hexCache.hex === hex) return _hexCache.rgb;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  _hexCache.hex = hex;
  _hexCache.rgb = result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
  return _hexCache.rgb;
}

// ============ CACHE E INICIALIZAÇÃO DOM ============
function cacheElements() {
  ['uploadZone', 'fileInput', 'filterControls', 'modeButtons', 'resetBtn',
   'canvasContainer', 'canvasPlaceholder', 'mainCanvas', 'mosaicGrid', 'mosaicViewport',
   'pixelCanvas', 'pixelTooltip', 'statusBar', 'fpsCounter', 'domCount', 'zoomHint',
   'sidebar', 'sidebarToggle', 'toast', 'colorPicker', 'colorHex'].forEach(id => {
    $[id] = document.getElementById(id);
  });
}

function createFilterControls() {
  const fragment = document.createDocumentFragment();
  FILTERS.forEach(filter => {
    state.filters[filter.id] = filter.default;
    const group = document.createElement('div');
    group.className = 'control-group';
    group.dataset.filter = filter.id;
    const label = document.createElement('label');
    label.htmlFor = `filter-${filter.id}`;
    label.innerHTML = `${filter.label} <span data-value>${filter.default}${filter.unit}</span>`;
    const input = document.createElement('input');
    input.type = 'range';
    input.id = `filter-${filter.id}`;
    input.min = filter.min;
    input.max = filter.max;
    input.value = filter.default;
    group.appendChild(label);
    group.appendChild(input);
    fragment.appendChild(group);
  });
  $.filterControls.appendChild(fragment);
}

// ============ EVENTOS ============
function setupEventDelegation() {
  $.filterControls.addEventListener('input', (e) => {
    const input = e.target;
    if (input.type !== 'range') return;
    const filterId = input.closest('.control-group')?.dataset.filter;
    if (!filterId) return;
    const filter = FILTERS.find(f => f.id === filterId);
    const value = Number(input.value);
    state.filters[filterId] = value;
    const valueSpan = input.previousElementSibling?.querySelector('[data-value]');
    if (valueSpan) valueSpan.textContent = `${value}${filter.unit}`;
    scheduleFilterUpdate();
  });

  $.modeButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    $.modeButtons.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    if (state.image) {
      if (state.mode === 'mosaic') {
        buildMosaic();
        $.zoomHint?.classList.add('visible');
        document.getElementById('undoHint')?.classList.add('visible');
      } else {
        $.mosaicViewport?.classList.remove('visible');
        $.mosaicViewport?.style.setProperty('visibility', 'hidden');
        $.zoomHint?.classList.remove('visible');
        document.getElementById('undoHint')?.classList.remove('visible');
      }
    }
  });

  $.resetBtn.addEventListener('click', () => {
    resetFilters();
    showToast('Filtros resetados');
  });
}

function setupUpload() {
  $.uploadZone.addEventListener('click', () => $.fileInput.click());
  $.fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  document.getElementById('sampleBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    loadSampleImage();
    showToast('Imagem de exemplo carregada');
  });
  $.uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); $.uploadZone.classList.add('dragover'); });
  $.uploadZone.addEventListener('dragleave', () => $.uploadZone.classList.remove('dragover'));
  $.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    $.uploadZone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
    showToast('Imagem carregada');
  });
}

function setupRipple() {
  document.querySelectorAll('.btn, .mode-btn, .size-btn, .tool-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const rect = this.getBoundingClientRect();
      this.style.setProperty('--x', `${((e.clientX - rect.left) / rect.width) * 100}%`);
      this.style.setProperty('--y', `${((e.clientY - rect.top) / rect.height) * 100}%`);
    });
  });
}

function setupSidebarToggle() {
  $.sidebarToggle?.addEventListener('click', () => {
    $.sidebar?.classList.toggle('collapsed');
    $.sidebarToggle?.classList.toggle('active', $.sidebar?.classList.contains('collapsed'));
  });
}

function setupSizeButtons() {
  document.getElementById('sizeButtons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.size-btn');
    if (!btn) return;
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.mosaicSize = parseInt(btn.dataset.size, 10);
    if (state.image && state.mode === 'mosaic') buildMosaic();
  });
}

function setupToolButtons() {
  document.getElementById('toolButtons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tool-btn');
    if (!btn) return;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tool = btn.dataset.tool;
    $.mosaicViewport?.style.setProperty('cursor', state.tool === 'eyedropper' ? 'crosshair' : state.tool === 'paint' ? 'crosshair' : 'crosshair');
  });
}

function setupColorPicker() {
  $.colorPicker?.addEventListener('input', (e) => {
    state.paintColor = e.target.value;
    $.colorHex.textContent = e.target.value;
  });
}

function setupQuantizeButtons() {
  document.getElementById('quantizeButtons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.quantize-btn');
    if (!btn || !state.pixelData) return;
    document.querySelectorAll('.quantize-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyQuantization(parseInt(btn.dataset.colors, 10));
  });
}

function setupDitherButtons() {
  document.getElementById('ditherButtons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.dither-btn');
    if (!btn || !state.image) return;
    document.querySelectorAll('.dither-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.ditherType = btn.dataset.dither;
    if (state.mode === 'mosaic') buildMosaic(state.ditherType);
  });
}

function setupExport() {
  document.getElementById('exportPng')?.addEventListener('click', exportPng);
  document.getElementById('exportJson')?.addEventListener('click', exportJson);
}

function setupUndoRedo() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      redo();
    }
  });
}

// ============ TOAST E PLACEHOLDER ============
function showToast(msg) {
  if (!$.toast) return;
  $.toast.textContent = msg;
  $.toast.classList.add('visible');
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => $.toast.classList.remove('visible'), 2500);
}

function updatePlaceholder() {
  $.canvasPlaceholder?.classList.toggle('hidden', !!state.image);
}

// ============ IMAGEM ============
function loadSampleImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 400, 300);
  grad.addColorStop(0, '#667eea');
  grad.addColorStop(0.5, '#764ba2');
  grad.addColorStop(1, '#f093fb');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 300);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(200, 150, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#7c3aed';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PixelLab', 200, 160);
  const img = new Image();
  img.onload = () => { state.image = img; updatePlaceholder(); drawCanvas(); if (state.mode === 'mosaic') buildMosaic(); };
  img.src = canvas.toDataURL('image/png');
}

function handleFile(file) {
  if (!file?.type.startsWith('image/')) return;
  const img = new Image();
  img.onload = () => { state.image = img; updatePlaceholder(); drawCanvas(); if (state.mode === 'mosaic') buildMosaic(); };
  img.src = URL.createObjectURL(file);
}

function getFilterCSS() {
  const f = state.filters;
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) blur(${f.blur}px) grayscale(${f.grayscale}%) sepia(${f.sepia}%) hue-rotate(${f.hueRotate}deg) invert(${f.invert}%)`;
}

let filterUpdateScheduled = false;
let paintRenderScheduled = false;
function scheduleFilterUpdate() {
  if (filterUpdateScheduled) return;
  filterUpdateScheduled = true;
  raf(() => {
    filterUpdateScheduled = false;
    drawCanvas();
    if (state.mode === 'mosaic') buildMosaic();
  });
}

function drawCanvas() {
  if (!state.image || !$.mainCanvas) return;
  if (!_mainCtx) _mainCtx = $.mainCanvas.getContext('2d');
  const ctx = _mainCtx;
  const maxW = $.canvasContainer.clientWidth;
  const maxH = $.canvasContainer.clientHeight;
  const scale = Math.min(maxW / state.image.width, maxH / state.image.height, 1);
  const w = Math.floor(state.image.width * scale);
  const h = Math.floor(state.image.height * scale);
  $.mainCanvas.width = w;
  $.mainCanvas.height = h;
  ctx.filter = getFilterCSS();
  ctx.drawImage(state.image, 0, 0, w, h);
  ctx.filter = 'none';
}

// ============ QUANTIZAÇÃO (k-means simplificado, amostragem) ============
function getPalette(data, numColors) {
  const step = Math.max(1, Math.floor(data.length / (numColors * 500)));
  const pixels = [];
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] > 128) pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [[0, 0, 0]];
  const centroids = [];
  for (let i = 0; i < numColors; i++) {
    centroids.push([...pixels[Math.floor(Math.random() * pixels.length)]]);
  }
  const maxIter = pixels.length > 10000 ? 5 : 10;
  for (let iter = 0; iter < maxIter; iter++) {
    const clusters = centroids.map(() => []);
    for (const p of pixels) {
      let minD = Infinity, idx = 0;
      centroids.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < minD) { minD = d; idx = i; }
      });
      clusters[idx].push(p);
    }
    for (let i = 0; i < centroids.length; i++) {
      if (clusters[i].length === 0) continue;
      centroids[i] = clusters[i].reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0])
        .map((v, j) => Math.round(v / clusters[i].length));
    }
  }
  return centroids;
}

function applyQuantization(numColors) {
  if (!state.pixelData) return;
  const data = state.pixelData.data;
  const palette = getPalette(data, numColors);
  for (let i = 0; i < data.length; i += 4) {
    let minD = Infinity;
    let best = [0, 0, 0];
    for (const c of palette) {
      const d = (data[i] - c[0]) ** 2 + (data[i + 1] - c[1]) ** 2 + (data[i + 2] - c[2]) ** 2;
      if (d < minD) { minD = d; best = c; }
    }
    data[i] = best[0];
    data[i + 1] = best[1];
    data[i + 2] = best[2];
  }
  pushHistory();
  renderPixelCanvas();
  showToast(`${numColors} cores aplicadas`);
}

// ============ DITHERING ============
function floydSteinbergDither(imageData, palette) {
  const data = new Uint8ClampedArray(imageData.data);
  const w = imageData.width;
  const h = imageData.height;
  const findNearest = (r, g, b) => {
    let minD = Infinity;
    let best = [0, 0, 0];
    for (const c of palette) {
      const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
      if (d < minD) { minD = d; best = c; }
    }
    return best;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const nearest = findNearest(r, g, b);
      const er = r - nearest[0], eg = g - nearest[1], eb = b - nearest[2];
      data[i] = nearest[0];
      data[i + 1] = nearest[1];
      data[i + 2] = nearest[2];
      const push = (dx, dy, k) => {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          const j = (ny * w + nx) * 4;
          data[j] = Math.max(0, Math.min(255, data[j] + er * k));
          data[j + 1] = Math.max(0, Math.min(255, data[j + 1] + eg * k));
          data[j + 2] = Math.max(0, Math.min(255, data[j + 2] + eb * k));
        }
      };
      push(1, 0, 7 / 16);
      push(-1, 1, 3 / 16);
      push(0, 1, 5 / 16);
      push(1, 1, 1 / 16);
    }
  }
  return data;
}

function orderedDither(imageData, palette) {
  const data = new Uint8ClampedArray(imageData.data);
  const w = imageData.width;
  const h = imageData.height;
  const m = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const findNearest = (r, g, b) => {
    let minD = Infinity;
    let best = [0, 0, 0];
    for (const c of palette) {
      const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
      if (d < minD) { minD = d; best = c; }
    }
    return best;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const threshold = (m[y % 4][x % 4] / 16 - 0.5) * 32;
      const r = Math.max(0, Math.min(255, data[i] + threshold));
      const g = Math.max(0, Math.min(255, data[i + 1] + threshold));
      const b = Math.max(0, Math.min(255, data[i + 2] + threshold));
      const nearest = findNearest(r, g, b);
      data[i] = nearest[0];
      data[i + 1] = nearest[1];
      data[i + 2] = nearest[2];
    }
  }
  return data;
}

// ============ MOSAICO / PIXEL CANVAS ============
function getPixelDataFromImage(ditherType) {
  if (!_tempCanvas) {
    _tempCanvas = document.createElement('canvas');
    _tempCtx = _tempCanvas.getContext('2d');
  }
  _tempCanvas.width = state.mosaicSize;
  _tempCanvas.height = state.mosaicSize;
  const ctx = _tempCtx;
  ctx.filter = getFilterCSS();
  ctx.drawImage(state.image, 0, 0, state.mosaicSize, state.mosaicSize);
  const imageData = ctx.getImageData(0, 0, state.mosaicSize, state.mosaicSize);
  if (ditherType === 'floyd') {
    const palette = getPalette(imageData.data, 4);
    const data = floydSteinbergDither(imageData, palette);
    return new ImageData(data, state.mosaicSize, state.mosaicSize);
  }
  if (ditherType === 'ordered') {
    const palette = getPalette(imageData.data, 4);
    const data = orderedDither(imageData, palette);
    return new ImageData(data, state.mosaicSize, state.mosaicSize);
  }
  return imageData;
}

function buildMosaic(ditherType) {
  if (!state.image) return;
  const dither = ditherType ?? state.ditherType;
  $.mainCanvas.style.visibility = 'hidden';
  state.mosaicZoom = 1;
  state.mosaicPanX = 0;
  state.mosaicPanY = 0;
  state.pixelData = getPixelDataFromImage(dither);
  state.pixelWidth = state.mosaicSize;
  state.pixelHeight = state.mosaicSize;
  state.history = [new Uint8ClampedArray(state.pixelData.data)];
  state.historyIndex = 0;
  $.mosaicGrid.innerHTML = '';
  $.mosaicGrid.style.display = 'none';
  $.pixelCanvas.style.display = 'block';
  renderPixelCanvas();
  $.mosaicViewport.style.visibility = 'visible';
  $.mosaicViewport.classList.add('visible');
  applyMosaicTransform();
  $.mainCanvas.style.visibility = '';
  updateDomCount();
}

function renderPixelCanvas() {
  if (!state.pixelData || !$.pixelCanvas) return;
  const { width, height } = state.pixelData;
  if ($.pixelCanvas.width !== width || $.pixelCanvas.height !== height) {
    $.pixelCanvas.width = width;
    $.pixelCanvas.height = height;
  }
  if (!_pixelCtx) _pixelCtx = $.pixelCanvas.getContext('2d');
  _pixelCtx.putImageData(state.pixelData, 0, 0);
  const size = Math.min($.canvasContainer.clientWidth, $.canvasContainer.clientHeight, 512);
  const cellSize = size / width;
  $.pixelCanvas.style.width = `${width * cellSize}px`;
  $.pixelCanvas.style.height = `${height * cellSize}px`;
  $.pixelCanvas.style.transform = `translate(-50%, -50%) translate(${state.mosaicPanX}px, ${state.mosaicPanY}px) scale(${state.mosaicZoom})`;
}

function applyMosaicTransform() {
  if (!$.pixelCanvas || !state.pixelData) return;
  const size = Math.min($.canvasContainer.clientWidth, $.canvasContainer.clientHeight, 512);
  const cellSize = size / state.pixelWidth;
  $.pixelCanvas.style.transform = `translate(-50%, -50%) translate(${state.mosaicPanX}px, ${state.mosaicPanY}px) scale(${state.mosaicZoom})`;
}

function getPixelAtScreen(x, y) {
  if (!state.pixelData || !$.pixelCanvas) return null;
  const rect = $.pixelCanvas.getBoundingClientRect();
  const scaleX = state.pixelWidth / rect.width;
  const scaleY = state.pixelHeight / rect.height;
  const px = Math.floor((x - rect.left) * scaleX);
  const py = Math.floor((y - rect.top) * scaleY);
  if (px < 0 || px >= state.pixelWidth || py < 0 || py >= state.pixelHeight) return null;
  const i = (py * state.pixelWidth + px) * 4;
  const d = state.pixelData.data;
  return { x: px, y: py, r: d[i], g: d[i + 1], b: d[i + 2], hex: rgbToHex(d[i], d[i + 1], d[i + 2]) };
}

let _lastTooltipInfo = '';
const showPixelTooltipThrottled = throttle((x, y, info) => {
  if (!$.pixelTooltip) return;
  const key = info ? `${info.x},${info.y},${info.hex}` : '';
  if (_lastTooltipInfo === key) return;
  _lastTooltipInfo = key;
  if (!info) {
    $.pixelTooltip.classList.remove('visible');
    return;
  }
  $.pixelTooltip.style.left = `${x}px`;
  $.pixelTooltip.style.top = `${y}px`;
  $.pixelTooltip.querySelector('.tooltip-x').textContent = `x: ${info.x}`;
  $.pixelTooltip.querySelector('.tooltip-y').textContent = `y: ${info.y}`;
  $.pixelTooltip.querySelector('.tooltip-color').textContent = info.hex;
  $.pixelTooltip.classList.add('visible');
}, 32);

function showPixelTooltip(x, y, info) {
  if (!info && $.pixelTooltip) {
    _lastTooltipInfo = '';
    $.pixelTooltip.classList.remove('visible');
    return;
  }
  showPixelTooltipThrottled(x, y, info);
}

function schedulePaintRender() {
  if (paintRenderScheduled) return;
  paintRenderScheduled = true;
  raf(() => {
    paintRenderScheduled = false;
    renderPixelCanvas();
  });
}

function setPixel(px, py, r, g, b, a = 255) {
  if (!state.pixelData || px < 0 || px >= state.pixelWidth || py < 0 || py >= state.pixelHeight) return;
  const i = (py * state.pixelWidth + px) * 4;
  state.pixelData.data[i] = r;
  state.pixelData.data[i + 1] = g;
  state.pixelData.data[i + 2] = b;
  state.pixelData.data[i + 3] = a;
}

function pushHistory() {
  state.history = state.history.slice(0, state.historyIndex + 1);
  if (state.history.length >= HISTORY_MAX) state.history.shift();
  state.history.push(new Uint8ClampedArray(state.pixelData.data));
  state.historyIndex = state.history.length - 1;
}

function undo() {
  if (state.historyIndex <= 0 || !state.pixelData) return;
  state.historyIndex--;
  state.pixelData.data.set(state.history[state.historyIndex]);
  renderPixelCanvas();
  showToast('Desfeito');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1 || !state.pixelData) return;
  state.historyIndex++;
  state.pixelData.data.set(state.history[state.historyIndex]);
  renderPixelCanvas();
  showToast('Refeito');
}

// ============ ZOOM, PAN, INTERAÇÃO ============
function setupMosaicZoomPan() {
  if (!$.mosaicViewport) return;

  $.mosaicViewport.addEventListener('wheel', (e) => {
    if (state.mode !== 'mosaic' || !state.image) return;
    e.preventDefault();
    const rect = $.mosaicViewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    const delta = e.deltaY > 0 ? -MOSAIC_ZOOM_STEP : MOSAIC_ZOOM_STEP;
    const oldZoom = state.mosaicZoom;
    const newZoom = Math.min(MOSAIC_ZOOM_MAX, Math.max(MOSAIC_ZOOM_MIN, state.mosaicZoom + delta));
    if (newZoom === oldZoom) return;
    state.mosaicPanX = mouseX - (mouseX - state.mosaicPanX) * (newZoom / oldZoom);
    state.mosaicPanY = mouseY - (mouseY - state.mosaicPanY) * (newZoom / oldZoom);
    state.mosaicZoom = newZoom;
    applyMosaicTransform();
  }, { passive: false });

  $.mosaicViewport.addEventListener('mousedown', (e) => {
    if (state.mode !== 'mosaic' || e.button !== 0) return;
    const info = getPixelAtScreen(e.clientX, e.clientY);
    if (state.tool === 'eyedropper' && info) {
      state.paintColor = info.hex;
      $.colorPicker.value = info.hex;
      $.colorHex.textContent = info.hex;
      showToast(`Cor: ${info.hex}`);
      return;
    }
    if (state.tool === 'paint' && info) {
      pushHistory();
      const [r, g, b] = hexToRgb(state.paintColor);
      setPixel(info.x, info.y, r, g, b);
      renderPixelCanvas();
      return;
    }
    if (state.tool === 'eraser' && info) {
      pushHistory();
      setPixel(info.x, info.y, 0, 0, 0, 0);
      renderPixelCanvas();
      return;
    }
    state.isPanning = true;
    state.panStartX = e.clientX;
    state.panStartY = e.clientY;
    state.panStartOffsetX = state.mosaicPanX;
    state.panStartOffsetY = state.mosaicPanY;
    $.mosaicViewport.style.cursor = 'grabbing';
  });

  $.mosaicViewport.addEventListener('mousemove', (e) => {
    const info = getPixelAtScreen(e.clientX, e.clientY);
    showPixelTooltip(e.clientX + 15, e.clientY + 15, info);
    if (state.isPanning) {
      state.mosaicPanX = state.panStartOffsetX + (e.clientX - state.panStartX);
      state.mosaicPanY = state.panStartOffsetY + (e.clientY - state.panStartY);
      applyMosaicTransform();
    } else if (state.mode === 'mosaic' && e.buttons === 1 && state.pixelData && !state.isPanning) {
      if (state.tool === 'paint' && info) {
        const [r, g, b] = hexToRgb(state.paintColor);
        setPixel(info.x, info.y, r, g, b);
        schedulePaintRender();
      } else if (state.tool === 'eraser' && info) {
        setPixel(info.x, info.y, 0, 0, 0, 0);
        schedulePaintRender();
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (state.isPanning) {
      state.isPanning = false;
      $.mosaicViewport.style.cursor = '';
    }
  });

  $.mosaicViewport.addEventListener('mouseleave', () => {
    _lastTooltipInfo = '';
    $.pixelTooltip?.classList.remove('visible');
  });
}

// ============ EXPORT ============
function exportPng() {
  if (!state.pixelData || !$.pixelCanvas) return;
  const link = document.createElement('a');
  link.download = 'pixelart.png';
  link.href = $.pixelCanvas.toDataURL('image/png');
  link.click();
  showToast('PNG exportado');
}

function exportJson() {
  if (!state.pixelData) return;
  const data = state.pixelData.data;
  const w = state.pixelWidth;
  const h = state.pixelHeight;
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const hex = rgbToHex(data[i], data[i + 1], data[i + 2]);
      row.push(hex);
    }
    grid.push(row);
  }
  const blob = new Blob([JSON.stringify(grid, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.download = 'pixelart.json';
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('JSON exportado');
}

// ============ RESET, FPS, RESIZE ============
function resetFilters() {
  FILTERS.forEach(filter => {
    state.filters[filter.id] = filter.default;
    const input = document.getElementById(`filter-${filter.id}`);
    if (input) {
      input.value = filter.default;
      const vs = input.previousElementSibling?.querySelector('[data-value]');
      if (vs) vs.textContent = `${filter.default}${filter.unit}`;
    }
  });
  if (state.image) {
    drawCanvas();
    if (state.mode === 'mosaic') buildMosaic();
  }
}

function updateDomCount() {
  if (!$.domCount) return;
  const count = state.pixelData ? state.pixelWidth * state.pixelHeight : 0;
  $.domCount.textContent = `Pixels: ${count.toLocaleString()}`;
}

function initFpsCounter() {
  function measureFps() {
    state.frameCount++;
    const now = performance.now();
    if (now - state.lastFpsUpdate >= FPS_SAMPLE_INTERVAL) {
      const elapsed = (now - state.lastFpsUpdate) / 1000;
      if ($.fpsCounter) $.fpsCounter.textContent = `FPS: ${Math.round(state.frameCount / elapsed)}`;
      state.frameCount = 0;
      state.lastFpsUpdate = now;
    }
    state.rafId = raf(measureFps);
  }
  measureFps();
}

const handleResize = throttle(() => {
  if (state.image) {
    drawCanvas();
    if (state.mode === 'mosaic' && state.pixelData) {
      renderPixelCanvas();
      applyMosaicTransform();
    }
  }
}, 150);

// ============ INIT ============
function init() {
  cacheElements();
  createFilterControls();
  setupEventDelegation();
  setupUpload();
  setupRipple();
  setupSidebarToggle();
  setupSizeButtons();
  setupToolButtons();
  setupColorPicker();
  setupQuantizeButtons();
  setupDitherButtons();
  setupExport();
  setupUndoRedo();
  setupMosaicZoomPan();
  initFpsCounter();
  updatePlaceholder();
  window.addEventListener('resize', handleResize);
  FILTERS.forEach(f => { state.filters[f.id] = f.default; });
}

document.addEventListener('DOMContentLoaded', init);

/**
 * DOMPainter - Ferramenta de Manipulação de Imagens
 * Demonstra: DOM avançado, performance, manipulação em tempo real
 */

// ============ CONFIGURAÇÃO E ESTADO ============
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

const MOSAIC_CELLS = 40; // Número de células por lado (DOM elements)
const FPS_SAMPLE_INTERVAL = 500;

// Cache de elementos DOM (evita querySelector repetidos)
const $ = {
  uploadZone: null,
  fileInput: null,
  filterControls: null,
  modeButtons: null,
  resetBtn: null,
  canvasContainer: null,
  canvasPlaceholder: null,
  mainCanvas: null,
  mosaicGrid: null,
  statusBar: null,
  fpsCounter: null,
  domCount: null,
  sidebar: null,
  sidebarToggle: null,
  toast: null,
};

let state = {
  image: null,
  filters: {},
  mode: 'canvas',
  rafId: null,
  lastFpsUpdate: 0,
  frameCount: 0,
};

// ============ UTILITÁRIOS DE PERFORMANCE ============

/** Throttle: limita execução a 1x por intervalo */
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

/** Debounce: executa apenas após parar de chamar por X ms */
function debounce(fn, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** requestAnimationFrame com fallback */
const raf = window.requestAnimationFrame || window.setTimeout;

// ============ INICIALIZAÇÃO DO DOM ============

function cacheElements() {
  const ids = [
    'uploadZone', 'fileInput', 'filterControls', 'modeButtons', 'resetBtn',
    'canvasContainer', 'canvasPlaceholder', 'mainCanvas', 'mosaicGrid',
    'statusBar', 'fpsCounter', 'domCount', 'sidebar', 'sidebarToggle', 'toast'
  ];
  ids.forEach(id => {
    $[id] = document.getElementById(id);
  });
}

/**
 * Cria controles de filtro usando DocumentFragment
 * Reduz reflows: uma única inserção em vez de N
 */
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

/**
 * Event Delegation: um único listener para todos os controles
 * Evita N listeners individuais
 */
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
      if (state.mode === 'mosaic') buildMosaic();
      else $.mosaicGrid.classList.remove('visible');
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

  const sampleBtn = document.getElementById('sampleBtn');
  if (sampleBtn) {
    sampleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadSampleImage();
      showToast('Imagem de exemplo carregada');
    });
  }

  $.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    $.uploadZone.classList.add('dragover');
  });
  $.uploadZone.addEventListener('dragleave', () => $.uploadZone.classList.remove('dragover'));
  $.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    $.uploadZone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
    showToast('Imagem carregada');
  });
}

function setupRipple() {
  document.querySelectorAll('.btn, .mode-btn').forEach(btn => {
    btn.addEventListener('click', function (e) {
      const rect = this.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      this.style.setProperty('--x', `${x}%`);
      this.style.setProperty('--y', `${y}%`);
    });
  });
}

function setupSidebarToggle() {
  if (!$.sidebarToggle || !$.sidebar) return;
  $.sidebarToggle.addEventListener('click', () => {
    $.sidebar.classList.toggle('collapsed');
    $.sidebarToggle.classList.toggle('active', $.sidebar.classList.contains('collapsed'));
  });
}

function showToast(message) {
  if (!$.toast) return;
  $.toast.textContent = message;
  $.toast.classList.add('visible');
  clearTimeout(window._toastTimeout);
  window._toastTimeout = setTimeout(() => {
    $.toast.classList.remove('visible');
  }, 2500);
}

function updatePlaceholder() {
  if (!$.canvasPlaceholder) return;
  $.canvasPlaceholder.classList.toggle('hidden', !!state.image);
}

// ============ MANIPULAÇÃO DE IMAGEM ============

/** Imagem de exemplo via canvas (gradiente + formas) */
function loadSampleImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 400, 300);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(0.5, '#764ba2');
  gradient.addColorStop(1, '#f093fb');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 400, 300);

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(200, 150, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#e8c547';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DOMPainter', 200, 160);

  const img = new Image();
  img.onload = () => {
    state.image = img;
    updatePlaceholder();
    drawCanvas();
    if (state.mode === 'mosaic') buildMosaic();
  };
  img.src = canvas.toDataURL('image/png');
}

function handleFile(file) {
  if (!file?.type.startsWith('image/')) return;

  const img = new Image();
  img.onload = () => {
    state.image = img;
    updatePlaceholder();
    drawCanvas();
    if (state.mode === 'mosaic') buildMosaic();
  };
  img.src = URL.createObjectURL(file);
}

function getFilterCSS() {
  const { brightness, contrast, saturation, blur, grayscale, sepia, hueRotate, invert } = state.filters;
  return [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`,
    `blur(${blur}px)`,
    `grayscale(${grayscale}%)`,
    `sepia(${sepia}%)`,
    `hue-rotate(${hueRotate}deg)`,
    `invert(${invert}%)`,
  ].join(' ');
}

let filterUpdateScheduled = false;

function scheduleFilterUpdate() {
  if (filterUpdateScheduled) return;
  filterUpdateScheduled = true;

  raf(() => {
    filterUpdateScheduled = false;
    drawCanvas();
    if (state.mode === 'mosaic') updateMosaicColors();
  });
}

function drawCanvas() {
  if (!state.image || !$.mainCanvas) return;

  const ctx = $.mainCanvas.getContext('2d');
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

// ============ MODO MOSAICO - DOM INTENSIVO ============

/**
 * Constrói grid de células DOM representando a imagem
 * Usa DocumentFragment para inserção em lote
 */
function buildMosaic() {
  if (!state.image) return;

  $.mainCanvas.style.visibility = 'hidden';
  $.mosaicGrid.innerHTML = '';
  $.mosaicGrid.style.visibility = 'visible';
  $.mosaicGrid.classList.add('visible');

  const size = Math.min($.canvasContainer.clientWidth, $.canvasContainer.clientHeight, 500);
  const cellSize = size / MOSAIC_CELLS;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = MOSAIC_CELLS;
  tempCanvas.height = MOSAIC_CELLS;
  const ctx = tempCanvas.getContext('2d');
  ctx.filter = getFilterCSS();
  ctx.drawImage(state.image, 0, 0, MOSAIC_CELLS, MOSAIC_CELLS);

  const imageData = ctx.getImageData(0, 0, MOSAIC_CELLS, MOSAIC_CELLS);
  const data = imageData.data;

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < MOSAIC_CELLS * MOSAIC_CELLS; i++) {
    const cell = document.createElement('div');
    cell.className = 'mosaic-cell';

    const idx = i * 4; // ImageData: (y * width + x) * 4, onde i = y * width + x
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3] / 255;

    cell.style.backgroundColor = `rgba(${r},${g},${b},${a})`;
    fragment.appendChild(cell);
  }

  $.mosaicGrid.style.width = `${size}px`;
  $.mosaicGrid.style.height = `${size}px`;
  $.mosaicGrid.style.gridTemplateColumns = `repeat(${MOSAIC_CELLS}, ${cellSize}px)`;
  $.mosaicGrid.style.gridTemplateRows = `repeat(${MOSAIC_CELLS}, ${cellSize}px)`;
  $.mosaicGrid.appendChild(fragment);

  $.mainCanvas.style.visibility = '';
  updateDomCount();
}

function updateMosaicColors() {
  if (!state.image || state.mode !== 'mosaic') return;

  const cells = $.mosaicGrid.querySelectorAll('.mosaic-cell');
  if (cells.length === 0) return;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = MOSAIC_CELLS;
  tempCanvas.height = MOSAIC_CELLS;
  const ctx = tempCanvas.getContext('2d');
  ctx.filter = getFilterCSS();
  ctx.drawImage(state.image, 0, 0, MOSAIC_CELLS, MOSAIC_CELLS);

  const imageData = ctx.getImageData(0, 0, MOSAIC_CELLS, MOSAIC_CELLS);
  const data = imageData.data;

  // Batch read/write: agrupa leituras antes de writes (evita reflow)
  requestAnimationFrame(() => {
    for (let i = 0; i < cells.length; i++) {
      const idx = i * 4; // ImageData: RGBA por pixel
      cells[i].style.backgroundColor = `rgba(${data[idx]},${data[idx + 1]},${data[idx + 2]},${data[idx + 3] / 255})`;
    }
  });
}

// ============ RESET E STATUS ============

function resetFilters() {
  FILTERS.forEach(filter => {
    state.filters[filter.id] = filter.default;
    const input = document.getElementById(`filter-${filter.id}`);
    if (input) {
      input.value = filter.default;
      const valueSpan = input.previousElementSibling?.querySelector('[data-value]');
      if (valueSpan) valueSpan.textContent = `${filter.default}${filter.unit}`;
    }
  });
  if (state.image) {
    drawCanvas();
    if (state.mode === 'mosaic') buildMosaic();
  }
}

function updateDomCount() {
  if (!$.domCount) return;
  const count = document.querySelectorAll('.mosaic-cell').length;
  $.domCount.textContent = `DOM: ${count.toLocaleString()}`;
}

// ============ FPS COUNTER ============

function initFpsCounter() {
  let lastTime = performance.now();

  function measureFps() {
    state.frameCount++;
    const now = performance.now();
    if (now - state.lastFpsUpdate >= FPS_SAMPLE_INTERVAL) {
      const elapsed = (now - state.lastFpsUpdate) / 1000;
      const fps = Math.round(state.frameCount / elapsed);
      if ($.fpsCounter) $.fpsCounter.textContent = `FPS: ${fps}`;
      state.frameCount = 0;
      state.lastFpsUpdate = now;
    }
    state.rafId = raf(measureFps);
  }
  measureFps();
}

// ============ RESIZE (THROTTLED) ============

const handleResize = throttle(() => {
  if (state.image) {
    drawCanvas();
    if (state.mode === 'mosaic') buildMosaic();
  }
}, 150);

// ============ INICIALIZAÇÃO ============

function init() {
  cacheElements();
  createFilterControls();
  setupEventDelegation();
  setupUpload();
  setupRipple();
  setupSidebarToggle();
  initFpsCounter();
  updatePlaceholder();
  window.addEventListener('resize', handleResize);

  // Valores iniciais dos filtros
  FILTERS.forEach(f => { state.filters[f.id] = f.default; });
}

document.addEventListener('DOMContentLoaded', init);

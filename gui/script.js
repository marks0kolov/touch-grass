/*
Although this script was generated with the help of AI,
it required significant time and effort to create and refine.
Thank you for understanding.
*/


// model paths and global sessions
const GRASS_MODEL_PATH = '../models/grassNet/model.onnx';
const POSE_MODEL_PATH  = '../models/poseNet/model.onnx';
const LABELS_PATH      = '../models/grassNet/labels.txt';

let grassSession, poseSession, labels;

/* =================================================================
   DOM References
================================================================= */
const c         = document.getElementById('c');
const ctx       = c.getContext('2d');
const fileInput = document.getElementById('fileInput');

/* =================================================================
   Geometry / Layout
================================================================= */
let W, H; // canvas width / height (set in resizeCanvas)

/* outer rounded rectangle (container) */
const outer = {
  x      : 0,
  y      : 0,
  w      : 960,
  h      : 800,
  r      : 40,
  border : 12,
  bg     : '#A8E68F',
  stroke : '#1E5F24',
};
/* inner rounded rectangle (content panel) */
const inner = {
  x      : 0,
  y      : 0,
  w      : 0,      // recalculated in updateLayout
  h      : 480,
  r      : 28,
  border : 10,
  bg     : '#7FCC60',
  stroke : '#1E5F24',
};

/* other constants */
const ARROW_SIZE = 48;          // up/down triangle size
const SUFFIX     = ['h', 'm', 's']; // timer unit labels

/* processing animation */
let processingStart = 0;

/* =================================================================
   State
================================================================= */
let hVal = 0;          // hour value
let mVal = 0;          // minute value
let sVal = 0;          // second value

let state     = 'select'; // 'select' | 'count' | 'done' | 'processing' | 'success' | 'failure'
let remaining = 0;        // seconds left while counting
let timerID   = null;     // setInterval handle

/* clickable rectangles (null when inactive) */
let submitRect      = null;
let uploadRect      = null;
let submitProofRect = null;

/* alarm related */
let blinkStart = 0;      // start time of blinking overlay
let audioCtx   = null;   // WebAudio context
let osc        = null;   // oscillator node

/* uploaded proof image */
let previewImg = null;

/* helper: pad single digit with leading zero */
const pad = n => String(n).padStart(2, '0');

/* =================================================================
   Canvas resize handling
================================================================= */
function resizeCanvas() {
  c.width  = window.innerWidth;
  c.height = window.innerHeight;
  W        = c.width;
  H        = c.height;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* =================================================================
   Layout calculations
================================================================= */
function updateLayout() {
  outer.w = Math.min(960, W - 40);
  
  // Dynamic height calculations
  if (state === 'select') {
    outer.h = Math.min(680, H - 40); // Further reduced for tighter h/m/s spacing
  } else if (state === 'count') {
    outer.h = Math.min(600, H - 40);
  } else if (state === 'processing') {
    outer.h = Math.min(400, H - 40); // Compact for processing
  } else if (state === 'success') {
    outer.h = Math.min(350, H - 40); // Compact for success
  } else if (state === 'failure') {
    outer.h = Math.min(350, H - 40); // Compact for failure
  } else { // 'done'
    // Dynamic sizing based on image
    if (previewImg) {
      const btnH = 70;
      const headerSpace = 150; // Space for header
      const instructionSpace = 60; // Space for instruction text
      const buttonSpace = 100; // Space for buttons at bottom
      const minImageSpace = 200; // Minimum space for image
      
      // Calculate available space
      const availableH = H - 80; // Total minus margins
      const maxOuterH = availableH;
      
      // Calculate required height for image
      const maxImageW = Math.min(800, W - 280); // Max image width
      const maxImageH = Math.max(minImageSpace, availableH - headerSpace - instructionSpace - buttonSpace);
      
      const scale = Math.min(
        maxImageW / previewImg.width,
        maxImageH / previewImg.height,
        1
      );
      
      const scaledImageH = previewImg.height * scale;
      const requiredOuterH = headerSpace + instructionSpace + scaledImageH + buttonSpace;
      
      outer.h = Math.min(requiredOuterH, maxOuterH);
    } else {
      outer.h = Math.min(440, H - 40); // Taller outer rect to accommodate inner rect
    }
  }
  
  outer.x = (W - outer.w) / 2;
  outer.y = (H - outer.h) / 2;

  inner.w = outer.w - 120;

  if (state === 'select') {
    inner.h = 380; // Increased to balance arrow spacing
  } else if (state === 'count') {
    inner.h = 320;
  } else if (state === 'processing') {
    inner.h = 200; // Compact size for processing screen
  } else if (state === 'success') {
    inner.h = 150; // Compact size for success message
  } else if (state === 'failure') {
    inner.h = 150; // Compact size for failure message
  } else { // 'done'
    if (previewImg) {
      // Dynamic inner height based on outer height
      inner.h = outer.h - 220; // Leave space for header and margins
    } else {
      inner.h = 200; // Taller inner rect for proper button placement
    }
  }

  inner.x = outer.x + 60;
  inner.y = outer.y + 150;
}

/* =================================================================
   Drawing helpers
================================================================= */
/**
 * build a rounded-rectangle path in the current ctx
 * @param {object} r rectangle {x, y, w, h, r}
 */
function rr(r) {
  ctx.beginPath();
  ctx.moveTo(r.x + r.r, r.y);
  ctx.arcTo(r.x + r.w, r.y,         r.x + r.w, r.y + r.h, r.r);
  ctx.arcTo(r.x + r.w, r.y + r.h,   r.x,       r.y + r.h, r.r);
  ctx.arcTo(r.x,       r.y + r.h,   r.x,       r.y,       r.r);
  ctx.arcTo(r.x,       r.y,         r.x + r.w, r.y,       r.r);
}

function drawOuter() {
  rr(outer);
  ctx.fillStyle   = outer.bg;
  ctx.lineWidth   = outer.border;
  ctx.strokeStyle = outer.stroke;
  ctx.fill();
  ctx.stroke();
}

function drawInner() {
  rr(inner);
  ctx.fillStyle   = inner.bg;
  ctx.lineWidth   = inner.border;
  ctx.strokeStyle = inner.stroke;
  ctx.fill();
  ctx.stroke();
}

/* ---- header -------------------------------------------------- */
function drawHeader() {
  ctx.fillStyle     = '#3D2B1F';
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';

  if (state === 'select') {
    ctx.font = 'bold 76px Arial';
    ctx.fillText('Set a timer!', W / 2, outer.y + 80);
  } else if (state === 'count') {
    ctx.font = 'bold 68px Arial';
    ctx.fillText('You have', W / 2, outer.y + 80);
    ctx.fillText('Left',     W / 2, inner.y + inner.h + 70);
  } else if (state === 'processing') {
    ctx.font = 'bold 64px Arial';
    ctx.fillText('Processing...', W / 2, outer.y + 80);
  } else if (state === 'success') {
    ctx.font = 'bold 64px Arial';
    ctx.fillText('You touched grass!', W / 2, outer.y + 80);
  } else if (state === 'failure') {
    ctx.font = 'bold 60px Arial';
    ctx.fillText('You didn\'t touch grass!', W / 2, outer.y + 80);
  } else { // 'done'
    ctx.font = 'bold 74px Arial';
    ctx.fillText('Time to touch grass!', W / 2, outer.y + 80);
  }
}

/* ---- arrow controls ----------------------------------------- */
function drawArrows() {
  if (state !== 'select') return;

  const col  = inner.w / 3;
  const bx   = inner.x + col / 2;
  const upY  = inner.y + 27; // Reduced space above upper arrows (was 55, now ~half)
  const dnY  = inner.y + inner.h - 15 - ARROW_SIZE; // Less space above lower arrows
  ctx.fillStyle = '#1E5F24';

  for (let i = 0; i < 3; i++) {
    const cx = bx + i * col;

    /* up triangle */
    ctx.beginPath();
    ctx.moveTo(cx,               upY);
    ctx.lineTo(cx - ARROW_SIZE,  upY + ARROW_SIZE);
    ctx.lineTo(cx + ARROW_SIZE,  upY + ARROW_SIZE);
    ctx.closePath();
    ctx.fill();

    /* down triangle */
    ctx.beginPath();
    ctx.moveTo(cx,               dnY + ARROW_SIZE);
    ctx.lineTo(cx - ARROW_SIZE,  dnY);
    ctx.lineTo(cx + ARROW_SIZE,  dnY);
    ctx.closePath();
    ctx.fill();
  }
}

/* ---- numbers ------------------------------------------------- */
function drawNumbers() {
  const col  = inner.w / 3;
  const bx   = inner.x + col / 2;
  const cy   = inner.y + inner.h / 2;
  const vals = [hVal, mVal, sVal];

  if (state === 'select') {
    ctx.textAlign    = 'center';
    ctx.fillStyle    = '#000';
    ctx.font         = 'bold 128px Arial';

    for (let i = 0; i < 3; i++) {
      /* main number */
      ctx.fillText(pad(vals[i]), bx + i * col, cy + 5); // Moved 5px up from cy + 10

      /* colon between groups (not after seconds) */
      if (i < 2) ctx.fillText(':', inner.x + col * (i + 1), cy + 5); // Moved 5px up from cy + 10

      /* unit suffix - better balance with new arrow positions */
      ctx.font = 'bold 48px Arial';
      ctx.fillText(SUFFIX[i], bx + i * col, cy + 70); // Adjusted to match number position
      ctx.font = 'bold 128px Arial'; // restore
    }
    return;
  }

  if (state === 'count') {
    const txt = `${pad(hVal)}:${pad(mVal)}:${pad(sVal)}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';

    /* scale font until it fits */
    let fs = inner.h * 0.8;
    while (fs > 10) {
      ctx.font = `bold ${fs}px Arial`;
      if (ctx.measureText(txt).width <= inner.w - 80) break;
      fs -= 2;
    }
    ctx.fillText(txt, inner.x + inner.w / 2, cy);
  }
}

/* ---- start button ------------------------------------------- */
function drawSubmit() {
  if (state !== 'select') {
    submitRect = null;
    return;
  }

  const btnText = 'Start';
  ctx.font      = 'bold 52px Arial';
  const textW   = ctx.measureText(btnText).width;

  const btn = {
    w : textW + 120,
    h : 90,
    x : outer.x + outer.w / 2 - (textW + 120) / 2,
    y : inner.y + inner.h + 40, // Moved up by 20px from 60
    r : 22,
  };

  rr(btn);
  ctx.fillStyle = '#1E5F24';
  ctx.fill();
  ctx.fillStyle   = '#fff';
  ctx.textAlign   = 'center';
  ctx.textBaseline= 'middle';
  ctx.fillText(btnText, btn.x + btn.w / 2, btn.y + btn.h / 2);

  submitRect = btn; // remember clickable area
}

/* ---- upload / submit buttons ------------------------------- */
function drawUpload() {
  uploadRect      = null;
  submitProofRect = null;
  if (state !== 'done') return;

  /* instruction */
  ctx.font         = 'bold 28px Arial';
  ctx.fillStyle    = '#000';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  const instructionY = inner.y + 20;
  ctx.fillText(
    'Upload a photo of you touching grass',
    W / 2,
    instructionY
  );

  /* button texts */
  ctx.font = 'bold 32px Arial'; // Reduced font size for better spacing
  const upText   = previewImg ? 'Upload Another' : 'Upload Image';
  const sbText   = 'Submit';
  const upTextW  = ctx.measureText(upText).width;
  const sbTextW  = ctx.measureText(sbText).width;

  const BTN_H = 70;
  const GAP   = 40;
  const upW   = upTextW + 100;
  const sbW   = sbTextW + 100;

  if (!previewImg) {
    /* only upload button visible - better centering in larger inner rect */
    const bx  = inner.x + inner.w / 2 - upW / 2;
    // Center the button properly in the available space
    const availableSpace = inner.h - 60; // Subtract instruction space
    const by  = inner.y + 60 + (availableSpace - BTN_H) / 2; // Center in remaining space
    const btn = { w: upW, h: BTN_H, x: bx, y: by, r: 20 };

    rr(btn);
    ctx.fillStyle = '#1E5F24';
    ctx.fill();
    ctx.fillStyle   = '#fff';
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'middle';
    ctx.fillText(upText, bx + upW / 2, by + BTN_H / 2);

    uploadRect = btn;
    return;
  }

  /* both upload and submit buttons visible */
  const total  = upW + GAP + sbW;
  const startX = inner.x + (inner.w - total) / 2;
  const by     = inner.y + inner.h - BTN_H - 15; // Minimal spacing from bottom

  const uBtn = { w: upW, h: BTN_H, x: startX,         y: by, r: 20 };
  const sBtn = { w: sbW, h: BTN_H, x: startX + upW + GAP, y: by, r: 20 };

  /* upload button */
  rr(uBtn);
  ctx.fillStyle = '#1E5F24';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(upText, uBtn.x + uBtn.w / 2, uBtn.y + BTN_H / 2);
  uploadRect = uBtn;

  /* submit button */
  rr(sBtn);
  ctx.fillStyle = '#1E5F24';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sbText, sBtn.x + sBtn.w / 2, sBtn.y + BTN_H / 2);
  submitProofRect = sBtn;

  /* preview image - dynamic sizing */
  ctx.save();
  const maxW  = inner.w - 40; // Margins
  const maxH  = by - instructionY - 70; // Space between instruction and buttons
  const scale = Math.min(
    maxW / previewImg.width,
    maxH / previewImg.height,
    1
  );
  const dw = previewImg.width  * scale;
  const dh = previewImg.height * scale;
  const px = inner.x + inner.w / 2 - dw / 2;
  const py = instructionY + 50; // Just below instruction

  const imgRect = { x: px, y: py, w: dw, h: dh, r: 26 };
  rr(imgRect);
  ctx.clip();
  ctx.drawImage(previewImg, px, py, dw, dh);
  ctx.restore();

  /* outline around preview */
  ctx.lineWidth   = 6;
  ctx.strokeStyle = '#1E5F24';
  rr({ ...imgRect });
  ctx.stroke();
}

/* ---- processing animation --------------------------------- */
function drawProcessing() {
  if (state === 'processing') {
    // Show spinning dots during processing
    const centerX = inner.x + inner.w / 2;
    const centerY = inner.y + inner.h / 2;
    
    const time = Date.now() - processingStart;
    const numDots = 8;
    const radius = 40;
    const dotSize = 8;
    
    ctx.fillStyle = '#1E5F24';
    
    for (let i = 0; i < numDots; i++) {
      const angle = (i / numDots) * Math.PI * 2 + (time / 1000) * Math.PI;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      const opacity = (i / numDots) * 0.8 + 0.2;
      
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1.0; // Reset opacity
  } else if (state === 'success') {
    // Show checkmark tick during success
    const centerX = inner.x + inner.w / 2;
    const centerY = inner.y + inner.h / 2;
    
    ctx.strokeStyle = '#1E5F24';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const size = 60;
    
    ctx.beginPath();
    // Left part of checkmark
    ctx.moveTo(centerX - size * 0.3, centerY);
    ctx.lineTo(centerX - size * 0.1, centerY + size * 0.2);
    // Right part of checkmark
    ctx.lineTo(centerX + size * 0.4, centerY - size * 0.3);
    ctx.stroke();
  } else if (state === 'failure') {
    // Show cross/X during failure
    const centerX = inner.x + inner.w / 2;
    const centerY = inner.y + inner.h / 2;
    
    ctx.strokeStyle = '#1E5F24';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const size = 60;
    
    ctx.beginPath();
    // Left diagonal of X
    ctx.moveTo(centerX - size * 0.3, centerY - size * 0.3);
    ctx.lineTo(centerX + size * 0.3, centerY + size * 0.3);
    // Right diagonal of X
    ctx.moveTo(centerX + size * 0.3, centerY - size * 0.3);
    ctx.lineTo(centerX - size * 0.3, centerY + size * 0.3);
    ctx.stroke();
  }
}

function drawAlarmOverlay() {
  if (state !== 'done' && state !== 'failure') return;
  const alpha = 0.35 + 0.25 * Math.sin((Date.now() - blinkStart) / 180);
  ctx.fillStyle = `rgba(255,0,0,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

/* ---- document title ---------------------------------------- */
function updateTitle() {
  if (state === 'select') {
    document.title = 'Set a Timer!';
  } else if (state === 'count') {
    document.title = `${pad(hVal)}:${pad(mVal)}:${pad(sVal)} left`;
  } else if (state === 'processing') {
    document.title = 'Processing...';
  } else if (state === 'success') {
    document.title = 'Success!';
  } else if (state === 'failure') {
    document.title = 'Failed!';
  } else { // 'done'
    document.title = 'Touch Grass!';
  }
}

/* ---- render loop ------------------------------------------- */
function render() {
  updateLayout();
  updateTitle();

  ctx.clearRect(0, 0, W, H);
  drawOuter();
  drawInner();
  drawHeader();
  drawArrows();
  drawNumbers();
  drawSubmit();
  drawUpload();
  drawProcessing();
  drawAlarmOverlay();

  requestAnimationFrame(render);
}

/* =================================================================
   Interaction
================================================================= */
const between = (x, y, r) =>
  r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/* canvas click handler --------------------------------------- */
c.addEventListener('click', e => {
  const rect = c.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;

  if (state === 'select') {
    handleSelectClick(x, y);
    return;
  }
  if (state === 'done') handleDoneClick(x, y);
});

/** handle clicks while in 'select' state */
function handleSelectClick(x, y) {
  const col  = inner.w / 3;
  const bx   = inner.x + col / 2;
  const upY  = inner.y + 27; // Updated to match drawArrows (reduced space)
  const dnY  = inner.y + inner.h - 15 - ARROW_SIZE; // Updated to match drawArrows

  /* arrow triangles */
  for (let i = 0; i < 3; i++) {
    const cx = bx + i * col;

    /* up */
    if (between(x, y, {
      x: cx - ARROW_SIZE,
      y: upY,
      w: ARROW_SIZE * 2,
      h: ARROW_SIZE
    })) return changeVal(i, +1);

    /* down */
    if (between(x, y, {
      x: cx - ARROW_SIZE,
      y: dnY,
      w: ARROW_SIZE * 2,
      h: ARROW_SIZE
    })) return changeVal(i, -1);
  }

  /* start button */
  if (between(x, y, submitRect)) startTimer();
}

/** handle clicks while in 'done' state */
function handleDoneClick(x, y) {
  if (between(x, y, uploadRect)) {
    fileInput.click();
    return;
  }
  if (between(x, y, submitProofRect) && previewImg) submitProof();
}


/* file input change (load preview) --------------------------- */
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    previewImg = img;
    stopAlarm(); // stop alarm once photo provided
  };
  img.src = URL.createObjectURL(file);
});

/* adjust selected values (wrap around) ----------------------- */
function changeVal(i, d) {
  if (i === 0) hVal = (hVal + d + 24) % 24;
  if (i === 1) mVal = (mVal + d + 60) % 60;
  if (i === 2) sVal = (sVal + d + 60) % 60;
}

/* ---- countdown -------------------------------------------- */
function startTimer() {
  remaining = hVal * 3600 + mVal * 60 + sVal;
  if (remaining <= 0) return; // nothing to count

  state = 'count';
  timerID = setInterval(() => {
    remaining--;
    hVal = Math.floor(remaining / 3600);
    mVal = Math.floor((remaining % 3600) / 60);
    sVal = remaining % 60;

    if (remaining <= 0) {
      clearInterval(timerID);
      timerFinished();
    }
  }, 1000);
}

/* ---- timer finished --------------------------------------- */
function timerFinished() {
  state      = 'done';
  blinkStart = Date.now();
  playAlarm();
  hVal = mVal = sVal = 0; // reset for next run
}

/* ---- alarm tone ------------------------------------------- */
function playAlarm() {
  stopAlarm(); // ensure only one oscillator

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    osc      = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);

    osc.start();
    osc.stop(audioCtx.currentTime + 1);

    /* loop with pause while still on 'done' or 'failure' screen */
    osc.onended = () => {
      if (state === 'done' || state === 'failure') setTimeout(playAlarm, 300);
    };
  } catch (_e) {
    /* silent fail on older browsers */
  }
}

/* ---- stop alarm ------------------------------------------- */
function stopAlarm() {
  if (osc) {
    osc.stop();
    osc.disconnect();
    osc = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
}

/* ---- reset ------------------------------------------------ */
function resetToSelect() {
  stopAlarm();
  state           = 'select';
  previewImg      = null;
  fileInput.value = '';
  hVal = mVal = sVal = 0;
}

/* =================================================================
   Model Integration
================================================================= */

/* ---------- initialise ONNX models & labels once at startup ---------- */
async function initModels() {
  grassSession = await ort.InferenceSession.create(await (await fetch(GRASS_MODEL_PATH)).arrayBuffer());
  poseSession  = await ort.InferenceSession.create(await (await fetch(POSE_MODEL_PATH)).arrayBuffer());
  labels       = (await (await fetch(LABELS_PATH)).text()).trim().split(/\r?\n/);
}
initModels();

function loadImage(path) {
  return new Promise(res => { const img = new Image(); img.onload = () => res(img); img.src = path; });
}

function imageToTensor(img, w, h, norm = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  const d = c.getContext('2d').getImageData(0, 0, w, h).data;
  const sz = w * h, t = new Float32Array(3 * sz);
  const m = [0.485, 0.456, 0.406], s = [0.229, 0.224, 0.225];
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    t[j]         = norm ? (r - m[0]) / s[0] : r * 2 - 1;
    t[j + sz]    = norm ? (g - m[1]) / s[1] : g * 2 - 1;
    t[j + 2 * sz] = norm ? (b - m[2]) / s[2] : b * 2 - 1;
  }
  return new ort.Tensor('float32', t, [1, 3, h, w]);
}

async function testGrass(path) {
  const img = await loadImage(path);
  const probs = (await grassSession.run({ [grassSession.inputNames[0]]: imageToTensor(img, 224, 224, true) }))[grassSession.outputNames[0]].data;
  const idx = labels.findIndex(l => l.toLowerCase() === 'grass');
  return idx >= 0 && probs[idx] > 0.1;
}

async function testPose(path) {
  const img = await loadImage(path);
  const out = await poseSession.run({ [poseSession.inputNames[0]]: imageToTensor(img, 224, 224, false) });
  const heat = Object.values(out)[0]; const [, ch, h, w] = heat.dims;
  const dat = heat.data, sz = h * w;
  let cnt = 0;
  for (let c = 0; c < ch; c++) {
    let max = -Infinity, start = c * sz, end = start + sz;
    for (let i = start; i < end; i++) if (dat[i] > max) max = dat[i];
    if (max > 0.1) cnt++;
  }
  return cnt > 3;
}

async function testTouchingGrass(path) {
  const [g, p] = await Promise.all([testGrass(path), testPose(path)]);
  return g && p;
}

async function checkTouchingGrass(imgEl) {
  return (await testTouchingGrass(imgEl.src)) ? 'true' : 'false';
}

/* ---------- wire into submitProof ---------- */
async function submitProof() {
  state = 'processing';
  processingStart = Date.now();
  stopAlarm();
  try {
    const verdict = await checkTouchingGrass(previewImg);
    if (verdict === 'true') {
      state = 'success';
      setTimeout(resetToSelect, 2000);
    } else {
      state = 'failure';
      blinkStart = Date.now();
      playAlarm();
      setTimeout(() => { state = 'done'; }, 3000);
    }
  } catch (_) {
    state = 'success';
    setTimeout(resetToSelect, 2000);
  }
}
render();
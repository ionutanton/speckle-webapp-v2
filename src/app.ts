// Single-file TypeScript app: AR overlay using QR top-left as origin

// This file expects the following globals to be loaded by index.html via <script> tags:
// - jsQR (global function)
// - OpenCV.js (global `cv`)
// - numeric.js (global `numeric`) - optional (for SVD)
// - three.js and OBJExporter available on window.THREE / window.OBJExporter
// - Speckle overlay function available as `window.overlayObj` and camera getter as `window.getSpeckleCameraPosition`

type QRCorner = { x: number; y: number };
type Colour = { name: string; rgb: string; height: number };
type ColourMap = Record<string, Colour>;

document.addEventListener("DOMContentLoaded", () => {
  // DOM elements
  const video = document.getElementById("webcam") as HTMLVideoElement;
  const canvas = document.getElementById("qrCanvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const statusText = document.getElementById("qr-status") as HTMLElement;
  const cameraSelect = document.getElementById("cameraSelect") as HTMLSelectElement;

  // State
  let currentStream: MediaStream | null = null;
  let currentCameraId: string | null = null;
  let lastDetectedQR: QRCorner[] | null = null;
  const detectionInterval = 100;
  let lastDetectionTime = 0;
  let qrCodeCorners: QRCorner[] = [];
  const qrSize = 100;
  const rectWidth = 280;
  const rectHeight = 200;

  const colour: ColourMap = {
    Red: { name: "red", rgb: "rgb(190, 60, 40)", height: 16 },
    Blue: { name: "blue", rgb: "rgb(50, 150, 180)", height: 28 },
    Green: { name: "green", rgb: "rgb(100, 180, 70)", height: 4 },
  };

  // ---------- Helpers ----------

  // Compute homography using DLT + SVD (numeric.svd if present)
  function computeHomographyMatrix(src: number[][], dst: number[][]): number[][] {
    const A: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i];
      const [u, v] = dst[i];
      A.push([-x, -y, -1, 0, 0, 0, x * u, y * u, u]);
      A.push([0, 0, 0, -x, -y, -1, x * v, y * v, v]);
    }
    const numericGlobal = (window as any).numeric;
    if (numericGlobal && typeof numericGlobal.svd === "function") {
      const svd = numericGlobal.svd(A);
      const V = svd.V;
      const cols = V[0].length;
      const rows = V.length;
      const lastCol: number[] = [];
      for (let r = 0; r < rows; r++) lastCol.push(V[r][cols - 1]);
      return [
        [lastCol[0], lastCol[1], lastCol[2]],
        [lastCol[3], lastCol[4], lastCol[5]],
        [lastCol[6], lastCol[7], lastCol[8]],
      ];
    }
    // fallback identity
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }

  function transformPoint(H: number[][], pt: number[]): QRCorner {
    const [x, y] = pt;
    const w = H[2][0] * x + H[2][1] * y + H[2][2];
    const nx = (H[0][0] * x + H[0][1] * y + H[0][2]) / w;
    const ny = (H[1][0] * x + H[1][1] * y + H[1][2]) / w;
    return { x: nx, y: ny };
  }

  function transformPoints(H: number[][], pts: number[][]): QRCorner[] {
    return pts.map((p) => transformPoint(H, p));
  }

  function drawPolygon(points: QRCorner[], color = "red") {
    if (!points || points.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.stroke();
  }

  function extendQRCodeQuadrilateral(corners: QRCorner[]): QRCorner[] {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    const dstPoints = [
      [0, 0],
      [qrSize, 0],
      [qrSize, -qrSize],
      [0, -qrSize],
    ];
    const extendedDstPoints = [
      [0, 0],
      [rectWidth, 0],
      [rectWidth, -rectHeight],
      [0, -rectHeight],
    ];
    const srcPoints = [
      [topLeft.x, topLeft.y],
      [topRight.x, topRight.y],
      [bottomRight.x, bottomRight.y],
      [bottomLeft.x, bottomLeft.y],
    ];
    const H = computeHomographyMatrix(dstPoints, srcPoints); // model->image
    return transformPoints(H, extendedDstPoints);
  }

  function filterPixels(imageData: ImageData, targetColor: number[], tolerance = 50) {
    const data = imageData.data;
    const out = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const dr = Math.abs(r - targetColor[0]);
      const dg = Math.abs(g - targetColor[1]);
      const db = Math.abs(b - targetColor[2]);
      if (dr <= tolerance && dg <= tolerance && db <= tolerance) {
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = data[i + 3];
      } else {
        out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
      }
    }
    return out;
  }

  function detectAndSimplifyBoundaries(imageData: ImageData): any[] {
    const cv = (window as any).cv;
    if (!cv) return [];
    const mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
    const data = imageData.data;
    for (let i = 0; i < imageData.height; i++) {
      for (let j = 0; j < imageData.width; j++) {
        const idx = (i * imageData.width + j) * 4;
        mat.ucharPtr(i, j)[0] = data[idx];
        mat.ucharPtr(i, j)[1] = data[idx + 1];
        mat.ucharPtr(i, j)[2] = data[idx + 2];
        mat.ucharPtr(i, j)[3] = data[idx + 3];
      }
    }
    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.Canny(gray, edges, 80, 160, 3);
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const results: any[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const eps = 0.02 * cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, eps, true);
      results.push(approx);
    }
    mat.delete(); gray.delete(); edges.delete(); contours.delete(); hierarchy.delete();
    return results;
  }

  function transformBoundaries(boundaries: any[], H: number[][]): QRCorner[][] {
    const out: QRCorner[][] = [];
    for (const b of boundaries) {
      const pts: QRCorner[] = [];
      for (let i = 0; i < b.rows; i++) {
        const p = b.data32S.slice(i * 2, i * 2 + 2);
        pts.push(transformPoint(H, p));
      }
      out.push(pts);
    }
    return out;
  }

  function buildOBJ(boundaries: QRCorner[][], colourName: keyof ColourMap) {
    const THREE = (window as any).THREE;
    const material = new THREE.MeshBasicMaterial({ color: colour[colourName].name });
    const group = new THREE.Group();
    for (const b of boundaries) {
      const points = b.map((p) => new THREE.Vector3(p.x, p.y, 0));
      const shape = new THREE.Shape(points);
      const extrudeSettings = { steps: 1, depth: colour[colourName].height, bevelEnabled: false };
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const mesh = new THREE.Mesh(geom, material);
      group.add(mesh);
    }
    const OBJExporterCtor = (window as any).OBJExporter || (window as any).THREE?.OBJExporter;
    const exporter = new OBJExporterCtor();
    const objData = exporter.parse(group);
    return { objData };
  }

  function overlayOBJOnSpeckle(objData: string, id: string, colourrgb: string) {
    const overlay = (window as any).overlayObj || ((window as any).overlayObj = undefined);
    // Speckle overlay expects a string colour in some builds — keep passing the rgb string.
    if (typeof overlay === "function") overlay(objData, id, colourrgb);
    else console.warn("overlayObj is not available on window");
  }

  // ---------- Camera + QR detection ----------
  async function getCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");
    cameraSelect.innerHTML = "";
    videoDevices.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.text = d.label || `Camera ${i + 1}`;
      cameraSelect.appendChild(opt);
    });
    if (videoDevices.length === 1) startWebcam(videoDevices[0].deviceId);
    cameraSelect.addEventListener("change", switchCamera);
  }

  async function startWebcam(deviceId: string | null = null) {
    if (currentStream) currentStream.getTracks().forEach((t) => t.stop());
    const constraints: MediaStreamConstraints = { video: { deviceId: deviceId ? { exact: deviceId } : undefined, facingMode: "environment" } };
    try {
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = s;
      currentStream = s; currentCameraId = deviceId;
      video.addEventListener("loadeddata", detectQR);
    } catch (e) {
      console.error(e); statusText.innerText = "Error accessing camera";
    }
  }

  function switchCamera() { const sel = cameraSelect.value; if (sel !== currentCameraId) startWebcam(sel); }

  function detectQR() {
    const now = Date.now();
    if (now - lastDetectionTime < detectionInterval) { requestAnimationFrame(detectQR); return; }
    lastDetectionTime = now;

    if (!video.videoWidth || !video.videoHeight) { requestAnimationFrame(detectQR); return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const jsQRglobal = (window as any).jsQR;
    if (!jsQRglobal) { requestAnimationFrame(detectQR); return; }
    const qr = jsQRglobal(imageData.data, imageData.width, imageData.height);
    if (qr) {
      lastDetectedQR = [qr.location.topLeftCorner, qr.location.topRightCorner, qr.location.bottomRightCorner, qr.location.bottomLeftCorner];
      statusText.innerText = `QR Code Detected: ${qr.data}`;
      qrCodeCorners = lastDetectedQR ? [...lastDetectedQR] : [];
      drawPolygon(qrCodeCorners, "red");
      const ext = extendQRCodeQuadrilateral(qrCodeCorners);
      drawPolygon(ext, "blue");
    } else {
      statusText.innerText = "Detecting QR codes...";
      lastDetectedQR = null; qrCodeCorners = [];
    }
    requestAnimationFrame(detectQR);
  }

  // ---------- Processing and overlay ----------
  function detectAndProcessBoundaries(colourName: keyof ColourMap) {
    if (!lastDetectedQR) { statusText.innerText = "No QR detected"; return; }
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgb = colour[colourName].rgb.match(/\d+/g)!.map(Number);
    const filtered = filterPixels(imageData, rgb);
    const filteredImageData = new ImageData(filtered, canvas.width, canvas.height);
    const boundaries = detectAndSimplifyBoundaries(filteredImageData);
    if (boundaries.length === 0) { statusText.innerText = `No ${colourName} boundaries found`; return; }

    const [tl, tr, br, bl] = lastDetectedQR!;
    const srcPoints = [[tl.x, tl.y], [tr.x, tr.y], [br.x, br.y], [bl.x, bl.y]];
    const dstPoints = [[0, 0], [qrSize, 0], [qrSize, -qrSize], [0, -qrSize]];
    const H = computeHomographyMatrix(srcPoints, dstPoints); // image->model

    const transformed = transformBoundaries(boundaries, H);
    const obj = buildOBJ(transformed, colourName);
    overlayOBJOnSpeckle(obj.objData, `atelier-34-${colour[colourName].name}`, colour[colourName].rgb);
  }

  function detectAndProcessAllBoundaries() { detectAndProcessBoundaries("Red"); detectAndProcessBoundaries("Blue"); detectAndProcessBoundaries("Green"); }

  // ---------- UI ----------
  function toggleSettings() { const panel = document.getElementById("settingsPanel") as HTMLElement; panel.style.display = panel.style.display === "block" ? "none" : "block"; }
  function updateSettings(key: string) {
    const colorInput = document.getElementById(`color${key}`) as HTMLInputElement;
    const heightInput = document.getElementById(`height${key}`) as HTMLInputElement;
    const label = document.getElementById(`label${key}`) as HTMLElement;
    const hex = colorInput.value; const rgb = hexToRgb(hex);
    colour[key].rgb = rgb; colour[key].height = Number(heightInput.value); label.textContent = `Height: ${heightInput.value}`;
  }

  function getSpeckleCamera() { const getter = (window as any).getSpeckleCameraPosition; if (typeof getter === "function") getter(); }

  function initializeUI() {
    document.getElementById("settings-btn")!.addEventListener("click", toggleSettings);
    document.getElementById("capture")!.addEventListener("click", detectAndProcessAllBoundaries);
    document.getElementById("get-camera-btn")!.addEventListener("click", getSpeckleCamera);
    for (const key in colour) {
      const el = document.getElementById(`color${key}`) as HTMLInputElement;
      const hEl = document.getElementById(`height${key}`) as HTMLInputElement;
      const label = document.getElementById(`label${key}`) as HTMLElement;
      el.value = rgbToHex(colour[key].rgb);
      hEl.value = String(colour[key].height);
      label.textContent = `Height: ${colour[key].height}`;
      el.addEventListener("input", () => updateSettings(key));
      hEl.addEventListener("input", () => updateSettings(key));
    }
  }

  function hexToRgb(hex: string) { hex = hex.replace(/^#/, ""); const bigint = parseInt(hex, 16); const r = (bigint >> 16) & 255; const g = (bigint >> 8) & 255; const b = bigint & 255; return `rgb(${r}, ${g}, ${b})`; }
  function rgbToHex(rgb: string) { const vals = rgb.match(/\d+/g)!.map(Number); return `#${vals.map((v) => v.toString(16).padStart(2, "0")).join("")}`; }

  // ---------- Init ----------
  async function initApp() { await getCameras(); initializeUI(); }
  initApp();
});
  

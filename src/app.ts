// src/app.ts

import { SpeckleViewer } from "./lib/speckle-viewer";

import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";


declare const jsQR: any;
declare const cv: any;
declare const numeric: any;

type QRCorner = { x: number; y: number };
type Colour = { name: string; rgb: string; height: number };
type ColourMap = Record<string, Colour>;

document.addEventListener("DOMContentLoaded", () => {
  const video = document.getElementById("webcam") as HTMLVideoElement;
  const canvas = document.getElementById("qrCanvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const statusText = document.getElementById("qr-status") as HTMLElement;
  const cameraSelect = document.getElementById("cameraSelect") as HTMLSelectElement;

  let currentStream: MediaStream | null = null;
  let currentCameraId: string | null = null;
  let lastDetectedQR: QRCorner[] | null = null;
  const detectionInterval = 100;
  let lastDetectionTime = 0;
  let qrCodeCorners: QRCorner[] = [];
  const qrSize = 100;
  const rectWidth = 280;
  const rectHeight = 200;
  let speckleViewer: SpeckleViewer | null = null;

  const colour: ColourMap = {
    Red: { name: "red", rgb: "rgb(190, 60, 40)", height: 16 },
    Blue: { name: "blue", rgb: "rgb(50, 150, 180)", height: 28 },
    Green: { name: "green", rgb: "rgb(100, 180, 70)", height: 4 },
  };

  if (typeof cv !== "undefined") {
    cv["onRuntimeInitialized"] = () => {
      console.log("OpenCV is ready");
    };
  } else {
    console.error("OpenCV is not loaded");
  }

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
    if (videoDevices.length > 0) {
      startWebcam(videoDevices[0].deviceId);
    }
    cameraSelect.addEventListener("change", switchCamera);
  }

  async function startWebcam(deviceId: string | null = null) {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: "environment",
      },
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      currentStream = stream;
      currentCameraId = deviceId;
      video.addEventListener("loadeddata", detectQR);
    } catch (error) {
      console.error("Error accessing camera:", error);
      statusText.innerText = "Error accessing camera.";
    }
  }

  function switchCamera() {
    const selectedCamera = cameraSelect.value;
    if (selectedCamera !== currentCameraId) {
      startWebcam(selectedCamera);
    }
  }

  function detectQR() {
    const now = Date.now();
    if (now - lastDetectionTime < detectionInterval) {
      requestAnimationFrame(detectQR);
      return;
    }
    lastDetectionTime = now;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      requestAnimationFrame(detectQR);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qrCode = jsQR(imageData.data, imageData.width, imageData.height);

    if (qrCode) {
      lastDetectedQR = [
        qrCode.location.topLeftCorner,
        qrCode.location.topRightCorner,
        qrCode.location.bottomRightCorner,
        qrCode.location.bottomLeftCorner,
      ];
      statusText.innerText = "QR Code Detected: " + qrCode.data;
      qrCodeCorners = lastDetectedQR;
      drawPolygon(qrCodeCorners, "red");

      const extendedCorners = extendQRCodeQuadrilateral(qrCodeCorners);
      drawPolygon(extendedCorners, "blue");
    } else {
      statusText.innerText = "Detecting QR codes...";
      lastDetectedQR = null;
    }
    requestAnimationFrame(detectQR);
  }

  function drawPolygon(points: QRCorner[], color = "red") {
    if (!points || points.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  function computeHomographyMatrix(src: number[][], dst: number[][]): number[][] {
    const A: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i];
      const [u, v] = dst[i];
      A.push([-x, -y, -1, 0, 0, 0, x * u, y * u, u]);
      A.push([0, 0, 0, -x, -y, -1, x * v, y * v, v]);
    }

    // Pad A with a row of zeros to make it a 9x9 matrix, as numeric.js SVD requires rows >= cols
    if (A.length < A[0].length) {
        A.push(new Array(A[0].length).fill(0));
    }

    const numericGlobal = (window as any).numeric;
    if (numericGlobal && typeof numericGlobal.svd === "function") {
      try {
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
      } catch (e) {
        console.error("Error during SVD computation:", e);
        // fallback to identity matrix
        return [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ];
      }
    }
    // fallback to identity matrix
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

  function extendQRCodeQuadrilateral(corners: QRCorner[]): QRCorner[] {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;

    const srcPoints = [
      [topLeft.x, topLeft.y],
      [topRight.x, topRight.y],
      [bottomRight.x, bottomRight.y],
      [bottomLeft.x, bottomLeft.y],
    ];

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

    const homographyMatrix = computeHomographyMatrix(dstPoints, srcPoints);
    return transformPoints(homographyMatrix, extendedDstPoints);
  }

  function filterPixels(imageData: ImageData, targetColor: number[], tolerance = 50) {
    const data = imageData.data;
    const filteredPixels = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const diffR = Math.abs(r - targetColor[0]);
      const diffG = Math.abs(g - targetColor[1]);
      const diffB = Math.abs(b - targetColor[2]);

      if (diffR <= tolerance && diffG <= tolerance && diffB <= tolerance) {
        filteredPixels[i] = r;
        filteredPixels[i + 1] = g;
        filteredPixels[i + 2] = b;
        filteredPixels[i + 3] = data[i + 3];
      } else {
        filteredPixels[i] = 0;
        filteredPixels[i + 1] = 0;
        filteredPixels[i + 2] = 0;
        filteredPixels[i + 3] = 0;
      }
    }
    return filteredPixels;
  }

  function detectAndSimplifyBoundaries(imageData: ImageData) {
    const mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
    const data = imageData.data;

    for (let i = 0; i < imageData.height; i++) {
      for (let j = 0; j < imageData.width; j++) {
        const index = (i * imageData.width + j) * 4;
        mat.ucharPtr(i, j)[0] = data[index];
        mat.ucharPtr(i, j)[1] = data[index + 1];
        mat.ucharPtr(i, j)[2] = data[index + 2];
        mat.ucharPtr(i, j)[3] = data[index + 3];
      }
    }

    const gray = new cv.Mat();
    const edges = new cv.Mat();
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();

    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.Canny(gray, edges, 100, 200, 3);
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    const simplifiedContours = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const epsilon = 0.02 * cv.arcLength(contour, true);
      const simplifiedContour = new cv.Mat();
      cv.approxPolyDP(contour, simplifiedContour, epsilon, true);
      simplifiedContours.push(simplifiedContour);
    }

    mat.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return simplifiedContours;
  }

  function transformBoundaries(boundaries: any[], homographyMatrix: number[][]) {
    const transformedBoundaries = [];
    for (const boundary of boundaries) {
      const points = [];
      for (let i = 0; i < boundary.rows; i++) {
        const point = boundary.data32S.slice(i * 2, i * 2 + 2);
        const transformedPoint = transformPoint(homographyMatrix, point);
        points.push(transformedPoint);
      }
      transformedBoundaries.push(points);
    }
    return transformedBoundaries;
  }

  function buildOBJ(boundaries: QRCorner[][], colourName: keyof ColourMap) {
    const material = new THREE.MeshBasicMaterial({ color: colour[colourName].name });
    const group = new THREE.Group();

    for (const boundary of boundaries) {
      const points = boundary.map(
        (point) => new THREE.Vector3(point.x, point.y, 0)
      );

      const boundaryShape = new THREE.Shape(points);
      const extrudeSettings = {
        steps: 1,
        depth: colour[colourName].height,
        bevelEnabled: false,
      };

      const extrudedShape = new THREE.ExtrudeGeometry(
        boundaryShape,
        extrudeSettings
      );
      const mesh = new THREE.Mesh(extrudedShape, material);
      group.add(mesh);
    }

    const exporter = new OBJExporter();
    const objData = exporter.parse(group);

    return { objData };
  }

  function overlayOBJOnSpeckle(objData: string, id: string, colourrgb: string) {
    if (speckleViewer) {
      const hexColor = parseInt(colourrgb.replace("rgb(", "").replace(")", "").split(',').map(c => parseInt(c).toString(16).padStart(2, '0')).join(""), 16);
      speckleViewer.overlayObj(objData, id, hexColor);
    } else {
      console.warn("SpeckleViewer not initialized");
    }
  }

  function detectAndProcessBoundaries(colourname: keyof ColourMap) {
    if (!lastDetectedQR) {
      statusText.innerText = "No QR detected";
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const rgbArray = colour[colourname].rgb.match(/\d+/g)!.map(Number);
    const redPixels = filterPixels(imageData, rgbArray);

    const redImageData = new ImageData(redPixels, canvas.width, canvas.height);
    const boundaries = detectAndSimplifyBoundaries(redImageData);

    if (boundaries.length > 0) {
      const [topLeft, topRight, bottomRight, bottomLeft] = lastDetectedQR;
      const srcPoints = [
        [topLeft.x, topLeft.y],
        [topRight.x, topRight.y],
        [bottomRight.x, bottomRight.y],
        [bottomLeft.x, bottomLeft.y],
      ];
      const dstPoints = [
        [0, 0],
        [qrSize, 0],
        [qrSize, -qrSize],
        [0, -qrSize],
      ];

      const homographyMatrix = computeHomographyMatrix(srcPoints, dstPoints);
      const transformedBoundaries = transformBoundaries(
        boundaries,
        homographyMatrix
      );

      const { objData } = buildOBJ(transformedBoundaries, colourname);
      overlayOBJOnSpeckle(
        objData,
        "atelier-34-" + colour[colourname].name,
        colour[colourname].rgb
      );
    }
  }

  function detectAndProcessAllBoundaries() {
    detectAndProcessBoundaries("Red");
    detectAndProcessBoundaries("Blue");
    detectAndProcessBoundaries("Green");
  }

  function toggleSettings() {
    const panel = document.getElementById("settingsPanel") as HTMLElement;
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  }

  function updateSettings(colorKey: string) {
    const colorInput = document.getElementById(`color${colorKey}`) as HTMLInputElement;
    const heightInput = document.getElementById(`height${colorKey}`) as HTMLInputElement;
    const heightLabel = document.getElementById(`label${colorKey}`) as HTMLElement;

    const rgbcolour = hexToRgb(colorInput.value);
    colour[colorKey as keyof ColourMap].rgb = rgbcolour;
    colour[colorKey as keyof ColourMap].height = Number(heightInput.value);

    heightLabel.textContent = `Height: ${heightInput.value}`;
  }

  function getSpeckleCamera() {
    if (speckleViewer) {
      speckleViewer.getSpeckleCameraPosition();
    }
  }

  function initializeUI() {
    document.getElementById("settings-btn")!.addEventListener("click", toggleSettings);
    document.getElementById("capture")!.addEventListener("click", detectAndProcessAllBoundaries);
    document.getElementById("get-camera-btn")!.addEventListener("click", getSpeckleCamera);

    for (const key in colour) {
      (document.getElementById(`color${key}`) as HTMLInputElement).value = rgbToHex(colour[key as keyof ColourMap].rgb);
      (document.getElementById(`height${key}`) as HTMLInputElement).value = colour[key as keyof ColourMap].height.toString();
      document.getElementById(`label${key}`)!.textContent = `Height: ${colour[key as keyof ColourMap].height}`;
      document.getElementById(`color${key}`)!.addEventListener("input", () => updateSettings(key));
      document.getElementById(`height${key}`)!.addEventListener("input", () => updateSettings(key));
    }
  }

  function hexToRgb(hex: string) {
    hex = hex.replace(/^#/, "");
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgb(${r}, ${g}, ${b})`;
  }

  function rgbToHex(rgb: string) {
    const values = rgb.match(/\d+/g)!.map(Number);
    return `#${values.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  async function initApp() {
    console.log("Initialising app...");
    const container = document.getElementById("speckle-model");
    if (container) {
      console.log("Speckle container found. Initialising viewer...");
      speckleViewer = new SpeckleViewer(container);
      try {
        await speckleViewer.init("https://app.speckle.systems/projects/6293f7974f/models/3e77e04b05");
        console.log("Speckle viewer initialised and model loaded.");
      } catch (error) {
        console.error("Error initialising Speckle viewer:", error);
      }
    } else {
      console.error("Container for speckle model not found");
    }
    await getCameras();
    initializeUI();
  }

  initApp();
});

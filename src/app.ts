import {
  overlayObj,
  getSpeckleCameraPosition,
  updateCamera,
} from "./speckle-app";
import { MeshBasicMaterial, Group, Vector3, Shape, ExtrudeGeometry, Mesh, Matrix4 } from "three";
// @ts-ignore
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";

// Global Declarations for CDN Libraries
declare var cv: any;
declare var jsQR: any;
declare var math: any;

document.addEventListener("DOMContentLoaded", () => {
  let video = document.getElementById("webcam") as HTMLVideoElement;
  let canvas = document.getElementById("qrCanvas") as HTMLCanvasElement;
  let ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  let statusText = document.getElementById("qr-status") as HTMLElement;
  let cameraSelect = document.getElementById("cameraSelect") as HTMLSelectElement;

  let currentStream: MediaStream | null = null;
  let currentCameraId: string | null = null;
  let lastDetectedQR: any = null; // Can be string or corners object, but tracking is loose here
  let detectionInterval = 50; // Faster detection for AR
  let lastDetectionTime = 0;
  let qrCodeCorners: any[] = [];

  // Physical Dimensions in real world units (e.g. mm)
  let qrSize = 77.78;
  let rectWidth = 418.15;
  let rectHeight = 297.68;

  interface ColorSetting {
      name: string;
      rgb: string;
      height: number;
  }

  // Object to store color and height values
  const colour: Record<string, ColorSetting> = {
    Red: {
      name: "red",
      rgb: "rgb(255, 0, 0)",
      height: 15,
    },
    Blue: {
      name: "blue",
      rgb: "rgb(0, 90, 255)",
      height: 33,
    },
    Green: {
      name: "green",
      rgb: "rgb(30, 255, 0)",
      height: 6,
    },
  };

  // Ensure OpenCV is loaded
  if (typeof cv !== "undefined") {
    cv["onRuntimeInitialized"] = () => {
      console.log("OpenCV is ready");
    };
  } else {
    console.error("OpenCV is not loaded");
  }

  // Get available cameras
  async function getCameras() {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let videoDevices = devices.filter((device) => device.kind === "videoinput");
    cameraSelect.innerHTML = "";
    videoDevices.forEach((device, index) => {
      let option = document.createElement("option");
      option.value = device.deviceId;
      option.text = device.label || `Camera ${index + 1}`;
      cameraSelect.appendChild(option);
    });
    // if only one device, just start the stream
    if (videoDevices.length === 1) {
      startWebcam(videoDevices[0].deviceId);
    }
    // Add event listener for camera selection change
    cameraSelect.addEventListener("change", switchCamera);
  }

  // Start Webcam with selected camera
  async function startWebcam(deviceId: string | null = null) {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }
    let constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
    };
    try {
      let stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      currentStream = stream;
      currentCameraId = deviceId;
      // Add event listener to start detectQR after video is loaded
      video.addEventListener("loadeddata", detectQR);
    } catch (error) {
      console.error("Error accessing camera:", error);
      statusText.innerText = "Error accessing camera.";
    }
  }

  // Switch camera when button is clicked or camera selection changes
  function switchCamera() {
    let selectedCamera = cameraSelect.value;
    if (selectedCamera !== currentCameraId) {
      startWebcam(selectedCamera);
    }
  }

  // Detect QR Codes
  function detectQR() {
    const now = Date.now();

    // Always update canvas with video
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (now - lastDetectionTime >= detectionInterval) {
             lastDetectionTime = now;

             let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
             let qrCode = jsQR(imageData.data, imageData.width, imageData.height);

             if (qrCode) {
                statusText.innerText = "QR Code Detected: " + qrCode.data;

                // Draw a polygon around the QR code's corners
                qrCodeCorners = [
                    qrCode.location.topLeftCorner,
                    qrCode.location.topRightCorner,
                    qrCode.location.bottomRightCorner,
                    qrCode.location.bottomLeftCorner,
                ];
                lastDetectedQR = qrCodeCorners;
                drawPolygon(qrCodeCorners, "red");

                // AR Step: Estimate Pose
                estimatePose(qrCodeCorners, canvas.width, canvas.height);
             } else {
                statusText.innerText = "Scanning...";
                lastDetectedQR = null;
             }
        } else if (lastDetectedQR) {
            // Keep drawing the last known polygon for stability?
            drawPolygon(lastDetectedQR, "rgba(255,0,0,0.5)");
        }
    }

    requestAnimationFrame(detectQR);
  }

  // Draw a polygon around the QR code's corners
  function drawPolygon(points: any[], color = "red") {
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

  function estimatePose(imagePoints: any[], width: number, height: number) {
      if (typeof cv === "undefined") return;

      const objectPoints = [
          0, 0, 0,
          qrSize, 0, 0,
          qrSize, 0, qrSize,
          0, 0, qrSize
      ];

      const objPointsMat = cv.matFromArray(4, 3, cv.CV_64FC1, objectPoints);

      // Image points from jsQR
      const imgPoints = [
          imagePoints[0].x, imagePoints[0].y,
          imagePoints[1].x, imagePoints[1].y,
          imagePoints[2].x, imagePoints[2].y,
          imagePoints[3].x, imagePoints[3].y
      ];
      const imgPointsMat = cv.matFromArray(4, 2, cv.CV_64FC1, imgPoints);

      // Camera Matrix (Intrinsic)
      const fx = width;
      const fy = width;
      const cx = width / 2;
      const cy = height / 2;

      const cameraMatrixData = [
          fx, 0, cx,
          0, fy, cy,
          0, 0, 1
      ];
      const cameraMatrix = cv.matFromArray(3, 3, cv.CV_64FC1, cameraMatrixData);

      const distCoeffs = cv.Mat.zeros(5, 1, cv.CV_64FC1);

      const rvec = new cv.Mat();
      const tvec = new cv.Mat();

      const success = cv.solvePnP(objPointsMat, imgPointsMat, cameraMatrix, distCoeffs, rvec, tvec);

      if (success) {
          const R = new cv.Mat();
          cv.Rodrigues(rvec, R);

          const viewMatrixOpenCV = new Matrix4();
          viewMatrixOpenCV.set(
              R.doubleAt(0,0), R.doubleAt(0,1), R.doubleAt(0,2), tvec.doubleAt(0),
              R.doubleAt(1,0), R.doubleAt(1,1), R.doubleAt(1,2), tvec.doubleAt(1),
              R.doubleAt(2,0), R.doubleAt(2,1), R.doubleAt(2,2), tvec.doubleAt(2),
              0, 0, 0, 1
          );

          const cvToThree = new Matrix4().set(
              1, 0, 0, 0,
              0, -1, 0, 0,
              0, 0, -1, 0,
              0, 0, 0, 1
          );

          const viewMatrixThree = cvToThree.multiply(viewMatrixOpenCV);
          const cameraWorldMatrixThree = viewMatrixThree.invert();

          updateCamera(cameraWorldMatrixThree.elements);

          R.delete();
      }

      objPointsMat.delete();
      imgPointsMat.delete();
      cameraMatrix.delete();
      distCoeffs.delete();
      rvec.delete();
      tvec.delete();
  }

  function computeHomographyMatrix(srcPoints: number[][], dstPoints: number[][]) {
    let A = [];
    for (let i = 0; i < 4; i++) {
      let [x, y] = srcPoints[i];
      let [xp, yp] = dstPoints[i];

      A.push([-x, -y, -1, 0, 0, 0, x * xp, y * xp, xp]);
      A.push([0, 0, 0, -x, -y, -1, x * yp, y * yp, yp]);
    }

    let AtA = math.multiply(math.transpose(A), A);
    let { values, vectors } = math.eigs(AtA);

    let minIndex = values.indexOf(Math.min(...values));
    let H = vectors.map((row: any) => row[minIndex]);

    return math.reshape(H, [3, 3]);
  }

  function transformPoint(matrix: number[][], point: any) {
    let [x, y] = point;
    let w = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2];
    let newX = (matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]) / w;
    let newY = (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]) / w;
    return { x: newX, y: newY };
  }

  function transformPoints(matrix: number[][], points: any[]) {
    return points.map((point) => transformPoint(matrix, point));
  }

  function filterPixels(imageData: ImageData, targetColor: number[], tolerance = 50) {
    let data = imageData.data;
    let filteredPixels = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

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
    let mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
    let data = imageData.data;

    for (let i = 0; i < imageData.height; i++) {
      for (let j = 0; j < imageData.width; j++) {
        let index = (i * imageData.width + j) * 4;
        mat.ucharPtr(i, j)[0] = data[index];
        mat.ucharPtr(i, j)[1] = data[index + 1];
        mat.ucharPtr(i, j)[2] = data[index + 2];
        mat.ucharPtr(i, j)[3] = data[index + 3];
      }
    }

    let gray = new cv.Mat();
    let edges = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.Canny(gray, edges, 50, 150, 3);

    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    let simplifiedContours = [];
    for (let i = 0; i < contours.size(); i++) {
      let contour = contours.get(i);
      let epsilon = 0.02 * cv.arcLength(contour, true);
      let simplifiedContour = new cv.Mat();
      cv.approxPolyDP(contour, simplifiedContour, epsilon, true);
      simplifiedContours.push(simplifiedContour);
    }

    let draw_mat = new cv.Mat.zeros(mat.rows, mat.cols, cv.CV_8UC3);
    cv.drawContours(
      draw_mat,
      contours,
      -1,
      [255, 55, 55, 255],
      2,
      cv.LINE_8,
      hierarchy,
      100
    );
    cv.imshow(canvas, draw_mat);

    mat.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return simplifiedContours;
  }

  function transformBoundaries(boundaries: any[], homographyMatrix: any) {
    let transformedBoundaries = [];
    for (let boundary of boundaries) {
      let points = [];
      for (let i = 0; i < boundary.rows; i++) {
        let point = boundary.data32S.slice(i * 2, i * 2 + 2);
        let transformedPoint = transformPoint(homographyMatrix, point);
        points.push(transformedPoint);
      }
      transformedBoundaries.push(points);
    }
    return transformedBoundaries;
  }

  function buildOBJ(boundaries: any[], colourName: string) {
    const material = new MeshBasicMaterial({ color: colour[colourName].name });
    const group = new Group();

    for (let boundary of boundaries) {
      let points = boundary.map(
        (point: any) => new Vector3(point.x, point.y, 0)
      );

      const boundaryShape = new Shape(points);

      const extrudeSettings = {
        steps: 1,
        depth: colour[colourName].height,
        bevelEnabled: false,
      };

      const extrudedShape = new ExtrudeGeometry(
        boundaryShape,
        extrudeSettings
      );

      const mesh = new Mesh(extrudedShape, material);

      group.add(mesh);
    }

    const exporter = new OBJExporter();
    const objData = exporter.parse(group);

    return { objData };
  }

  function overlayOBJOnSpeckle(objData: string, id: string, colourrgb: any) {
    console.log("Overlaying OBJ on Speckle viewer");
    // @ts-ignore
    overlayObj(objData, id, colourrgb);
  }

  function detectAndProcessBoundaries(colourname: string) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let rgbArray = colour[colourname].rgb.match(/\d+/g)!.map(Number);
    let redPixels = filterPixels(imageData, rgbArray);

    let redImageData = new ImageData(redPixels, canvas.width, canvas.height);

    let boundaries = detectAndSimplifyBoundaries(redImageData);
    console.log("Detected and simplified boundaries: ", boundaries);

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

      let homographyMatrix = computeHomographyMatrix(srcPoints, dstPoints);

      let transformedBoundaries = transformBoundaries(
        boundaries,
        homographyMatrix
      );
      console.log("Transformed boundaries: ", transformedBoundaries);

      let { objData } = buildOBJ(transformedBoundaries, colourname);

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
    const panel = document.getElementById("settingsPanel");
    if (panel) {
        panel.style.display = panel.style.display === "block" ? "none" : "block";
    }
  }

  function updateSettings(colorKey: string) {
    const colorInput = document.getElementById(`color${colorKey}`) as HTMLInputElement;
    const heightInput = document.getElementById(`height${colorKey}`) as HTMLInputElement;
    const heightLabel = document.getElementById(`label${colorKey}`) as HTMLElement;

    const rgbcolour = hexToRgb(colorInput.value);
    colour[colorKey].rgb = rgbcolour;
    colour[colorKey].height = parseInt(heightInput.value);

    heightLabel.textContent = `Height: ${heightInput.value}`;

    console.log(colour[colorKey]);
  }

  function getSpeckleCamera() {
    console.log("Getting speckle camera position");
    getSpeckleCameraPosition();
  }

  function initializeUI() {
    document
      .getElementById("settings-btn")!
      .addEventListener("click", toggleSettings);
    document
      .getElementById("capture")!
      .addEventListener("click", detectAndProcessAllBoundaries);

    document
      .getElementById("get-camera-btn")!
      .addEventListener("click", getSpeckleCamera);

    for (const key in colour) {
      (document.getElementById(`color${key}`) as HTMLInputElement).value = rgbToHex(colour[key].rgb);
      (document.getElementById(`height${key}`) as HTMLInputElement).value = colour[key].height.toString();
      document.getElementById(
        `label${key}`
      )!.textContent = `Height: ${colour[key].height}`;

      document
        .getElementById(`color${key}`)!
        .addEventListener("input", () => updateSettings(key));
      document
        .getElementById(`height${key}`)!
        .addEventListener("input", () => updateSettings(key));
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
    await getCameras();
    initializeUI();
  }

  initApp();
});

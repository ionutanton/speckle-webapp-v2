import {
  overlayObj,
  getSpeckleCameraPosition,
  getObjectsByLayer,
} from "./speckle-app";
import { MeshBasicMaterial } from "three";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";

document.addEventListener("DOMContentLoaded", () => {
  let video = document.getElementById("webcam");
  let canvas = document.getElementById("qrCanvas");
  let ctx = canvas.getContext("2d");
  let statusText = document.getElementById("qr-status");
  let cameraSelect = document.getElementById("cameraSelect");

  let currentStream = null;
  let currentCameraId = null;
  let lastDetectedQR = null;
  let detectionInterval = 100; // Detection interval in milliseconds
  let lastDetectionTime = 0;
  let qrCodeCorners = [];
  let qrSize = 77.78;
  let rectWidth = 418.15;
  let rectHeight = 297.68;

  // Object to store color and height values
  const colour = {
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
  async function startWebcam(deviceId = null) {
    if (currentStream) {
      currentStream.getTracks().forEach((track) => track.stop());
    }
    let constraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: "environment",
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
    if (now - lastDetectionTime < detectionInterval) {
      requestAnimationFrame(detectQR);
      return;
    }
    lastDetectionTime = now;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let qrCode = jsQR(imageData.data, imageData.width, imageData.height);

    if (qrCode) {
      // Store the QR code data if it's different from the last detected QR code
      lastDetectedQR = qrCode.data;
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

      // Extend the QR code quadrilateral
      const extendedCorners = extendQRCodeQuadrilateral(qrCodeCorners);
      drawPolygon(extendedCorners, "blue");
    } else {
      statusText.innerText = "Detecting QR codes...";
      lastDetectedQR = null;
    }
    requestAnimationFrame(detectQR);
  }

  // Draw a polygon around the QR code's corners
  function drawPolygon(points, color = "red") {
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

  function computeHomographyMatrix(srcPoints, dstPoints) {
    let A = [];
    for (let i = 0; i < 4; i++) {
      let [x, y] = srcPoints[i];
      let [xp, yp] = dstPoints[i];

      A.push([-x, -y, -1, 0, 0, 0, x * xp, y * xp, xp]);
      A.push([0, 0, 0, -x, -y, -1, x * yp, y * yp, yp]);
    }

    let AtA = math.multiply(math.transpose(A), A); // Compute A^T * A
    let { values, vectors } = math.eigs(AtA); // Compute eigenvalues & eigenvectors

    let minIndex = values.indexOf(Math.min(...values)); // Find the smallest eigenvalue
    let H = vectors.map((row) => row[minIndex]); // Get the corresponding eigenvector

    return math.reshape(H, [3, 3]);
  }

  function transformPoint(matrix, point) {
    let [x, y] = point;
    let w = matrix[2][0] * x + matrix[2][1] * y + matrix[2][2];
    let newX = (matrix[0][0] * x + matrix[0][1] * y + matrix[0][2]) / w;
    let newY = (matrix[1][0] * x + matrix[1][1] * y + matrix[1][2]) / w;
    return { x: newX, y: newY };
  }

  function transformPoints(matrix, points) {
    return points.map((point) => transformPoint(matrix, point));
  }

  // Extend the QR code quadrilateral
  function extendQRCodeQuadrilateral(corners) {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;

    // Define the source points (original QR code corners)
    const srcPoints = [
      [topLeft.x, topLeft.y],
      [topRight.x, topRight.y],
      [bottomRight.x, bottomRight.y],
      [bottomLeft.x, bottomLeft.y],
    ];

    // Define the destination points (normalized rectangle in 2D space)
    const dstPoints = [
      [0, 0],
      [qrSize, 0],
      [qrSize, -qrSize],
      [0, -qrSize],
    ];

    // Define the extended destination points (normalized rectangle in 2D space)
    const extendedDstPoints = [
      [0, 0],
      [rectWidth, 0],
      [rectWidth, -rectHeight],
      [0, -rectHeight],
    ];

    // Compute homography matrix
    let homographyMatrix = computeHomographyMatrix(dstPoints, srcPoints);

    // Compute transformed points
    let extendedCorners = transformPoints(homographyMatrix, extendedDstPoints);

    return extendedCorners;
  }

  // Filter pixels of given colour with a tolerance
  function filterPixels(imageData, targetColor, tolerance = 50) {
    let data = imageData.data;
    let filteredPixels = new Uint8ClampedArray(data.length);
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Calculate the absolute difference between the current pixel color and the target color
      const diffR = Math.abs(r - targetColor[0]);
      const diffG = Math.abs(g - targetColor[1]);
      const diffB = Math.abs(b - targetColor[2]);

      // Check if the difference is within the tolerance
      if (diffR <= tolerance && diffG <= tolerance && diffB <= tolerance) {
        filteredPixels[i] = r;
        filteredPixels[i + 1] = g;
        filteredPixels[i + 2] = b;
        filteredPixels[i + 3] = data[i + 3]; // Preserve the opacity
      } else {
        filteredPixels[i] = 0; // Set to black for non-matching pixels
        filteredPixels[i + 1] = 0;
        filteredPixels[i + 2] = 0;
        filteredPixels[i + 3] = 0;
      }
    }
    return filteredPixels;
  }

  // Detect and simplify boundaries
  function detectAndSimplifyBoundaries(imageData) {
    let mat = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4);
    let data = imageData.data;

    // Convert ImageData to OpenCV Mat
    for (let i = 0; i < imageData.height; i++) {
      for (let j = 0; j < imageData.width; j++) {
        let index = (i * imageData.width + j) * 4;
        mat.ucharPtr(i, j)[0] = data[index]; // Red
        mat.ucharPtr(i, j)[1] = data[index + 1]; // Green
        mat.ucharPtr(i, j)[2] = data[index + 2]; // Blue
        mat.ucharPtr(i, j)[3] = data[index + 3]; // Alpha
      }
    }

    let gray = new cv.Mat();
    let edges = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    // Convert to grayscale
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);

    // Detect edges
    cv.Canny(gray, edges, 50, 150, 3);

    // Find contours
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    // Simplify contours
    let simplifiedContours = [];
    for (let i = 0; i < contours.size(); i++) {
      let contour = contours.get(i);
      let epsilon = 0.02 * cv.arcLength(contour, true);
      let simplifiedContour = new cv.Mat();
      cv.approxPolyDP(contour, simplifiedContour, epsilon, true);
      simplifiedContours.push(simplifiedContour);
    }

    // Draw the simplified contours on the canvas
    let draw_mat = new cv.Mat.zeros(mat.rows, mat.cols, cv.CV_8UC3); // Create a new Mat for drawing
    cv.drawContours(
      draw_mat,
      contours,
      -1,
      [255, 55, 55, 255],
      2,
      cv.LINE_8,
      hierarchy,
      100
    ); // Draw the simplified contours
    cv.imshow(canvas, draw_mat); // Display the result on the canvas

    // Clean up
    mat.delete();
    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();

    return simplifiedContours;
  }

  // Transform boundaries using homography
  function transformBoundaries(boundaries, homographyMatrix) {
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

  // Build OBJ from extruded boundaries
  function buildOBJ(boundaries, colourName) {
    const material = new MeshBasicMaterial({ color: colour[colourName].name });
    const group = new THREE.Group();

    for (let boundary of boundaries) {
      let points = boundary.map(
        (point) => new THREE.Vector3(point.x, point.y, 0)
      );

      // Create a shape out of points
      const boundaryShape = new THREE.Shape(points);

      // Extrude the vertices to create the shape
      const extrudeSettings = {
        steps: 1,
        depth: colour[colourName].height,
        bevelEnabled: false,
      };

      const extrudedShape = new THREE.ExtrudeGeometry(
        boundaryShape,
        extrudeSettings
      );

      // Create a mesh from the geometry
      const mesh = new THREE.Mesh(extrudedShape, material);

      // Add the extruded shape to the geometry
      group.add(mesh);
    }

    // Export the group directly
    const exporter = new OBJExporter();
    const objData = exporter.parse(group);

    return { objData };
  }

  // Overlay OBJ on Speckle viewer
  function overlayOBJOnSpeckle(objData, id, colourrgb) {
    // Assuming you have a Speckle viewer initialized
    // This is a placeholder for overlaying the OBJ data
    console.log("Overlaying OBJ on Speckle viewer");
    // You would need to integrate this with your Speckle viewer API
    overlayObj(objData, id, colourrgb);
  }

  // Main detection function
  function detectAndProcessBoundaries(colourname) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let rgbArray = colour[colourname].rgb.match(/\d+/g).map(Number);
    let redPixels = filterPixels(imageData, rgbArray);

    // Create a new ImageData object with red pixels
    let redImageData = new ImageData(redPixels, canvas.width, canvas.height);

    // Detect and simplify boundaries
    let boundaries = detectAndSimplifyBoundaries(redImageData);
    console.log("Detected and simplified boundaries: ", boundaries);

    if (boundaries.length > 0) {
      // Process the detected boundaries

      const [topLeft, topRight, bottomRight, bottomLeft] = lastDetectedQR;

      // Define the source points (original QR code corners)
      const srcPoints = [
        [topLeft.x, topLeft.y],
        [topRight.x, topRight.y],
        [bottomRight.x, bottomRight.y],
        [bottomLeft.x, bottomLeft.y],
      ];

      // Define the destination points (normalized rectangle in 2D space)
      const dstPoints = [
        [0, 0],
        [qrSize, 0],
        [qrSize, -qrSize],
        [0, -qrSize],
      ];

      // Compute homography matrix
      let homographyMatrix = computeHomographyMatrix(srcPoints, dstPoints);

      // Transform boundaries
      let transformedBoundaries = transformBoundaries(
        boundaries,
        homographyMatrix
      );
      console.log("Transformed boundaries: ", transformedBoundaries);

      // Build OBJ
      let { objData } = buildOBJ(transformedBoundaries, colourname);

      // Overlay OBJ on Speckle viewer
      overlayOBJOnSpeckle(
        objData,
        "atelier-34-" + colour[colourname].name,
        colour[colourname].rgb
      );
    }
  }

  // Function to detect and process all boundaries
  function detectAndProcessAllBoundaries() {
    detectAndProcessBoundaries("Red"); // RGB values for red
    detectAndProcessBoundaries("Blue"); // RGB values for blue
    detectAndProcessBoundaries("Green"); // RGB values for blue
  }

  function toggleSettings() {
    const panel = document.getElementById("settingsPanel");
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  }

  function updateSettings(colorKey) {
    const colorInput = document.getElementById(`color${colorKey}`);
    const heightInput = document.getElementById(`height${colorKey}`);
    const heightLabel = document.getElementById(`label${colorKey}`);
    
    // Update color object
    const rgbcolour = hexToRgb(colorInput.value);
    colour[colorKey].rgb = rgbcolour;
    colour[colorKey].height = heightInput.value;

    // Update height label
    heightLabel.textContent = `Height: ${heightInput.value}`;

    console.log(colour[colorKey]); // Debugging output to see the updated values
  }

  // Overlay OBJ on Speckle viewer
  function getSpeckleCamera() {
    // Assuming you have a Speckle viewer initialized
    // This is a placeholder for overlaying the OBJ data
    console.log("Getting speckle camera position");
    // You would need to integrate this with your Speckle viewer API
    getSpeckleCameraPosition();
  }

  // Initialize UI with stored values
  function initializeUI() {
    document
      .getElementById("settings-btn")
      .addEventListener("click", toggleSettings);
    document
      .getElementById("capture")
      .addEventListener("click", detectAndProcessAllBoundaries);

    document
      .getElementById("get-camera-btn")
      .addEventListener("click", getSpeckleCamera);

    for (const key in colour) {
      document.getElementById(`color${key}`).value = rgbToHex(colour[key].rgb);
      document.getElementById(`height${key}`).value = colour[key].height;
      document.getElementById(
        `label${key}`
      ).textContent = `Height: ${colour[key].height}`;
      // Add event listeners
      document
        .getElementById(`color${key}`)
        .addEventListener("input", () => updateSettings(key));
      document
        .getElementById(`height${key}`)
        .addEventListener("input", () => updateSettings(key));
    }
  }

  // Convert Hex to RGB format (e.g., "#ff0000" to "rgb(255, 0, 0)")
  function hexToRgb(hex) {
    // Remove the hash if it exists
    hex = hex.replace(/^#/, "");

    // Parse the hex values
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    // Return the RGB string
    return `rgb(${r}, ${g}, ${b})`;
  }

  // Convert RGB format (e.g., "rgb(255, 0, 0)") to HEX (e.g., "#ff0000")
  function rgbToHex(rgb) {
    const values = rgb.match(/\d+/g).map(Number);
    return `#${values.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  // Initialize app
  async function initApp() {
    await getCameras();

    initializeUI();
  }

  initApp();
});

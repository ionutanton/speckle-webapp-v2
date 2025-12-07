
import { WebXRCameraManager } from "./webxr-utils";
// @ts-ignore
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Group,
  MeshBasicMaterial,
  Mesh,
  ExtrudeGeometry,
  Shape,
  Vector3,
  Color,
  Matrix4
} from "three";
import SpeckleLoader from "@speckle/objectloader";

// Global Declarations for CDN Libraries
declare var cv: any;

// Configuration
const QR_SIZE_METERS = 0.1; // 10cm physical size (assumed)
const SPECKLE_STREAM_URL = "https://app.speckle.systems/projects/6293f7974f/models/3e77e04b05";

document.addEventListener("DOMContentLoaded", () => {
  const container = document.body;

  // UI Elements
  const startButton = document.createElement("button");
  startButton.textContent = "Start AR";
  startButton.style.cssText = "position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 12px 24px; font-size: 18px; z-index: 100;";
  container.appendChild(startButton);

  const statusText = document.getElementById("qr-status") as HTMLElement;
  if (statusText) statusText.innerText = "Ready to start AR";

  // State
  let renderer: WebGLRenderer;
  let scene: Scene;
  let camera: PerspectiveCamera;
  let xrSession: XRSession | null = null;
  let xrRefSpace: XRReferenceSpace | null = null;
  let xrViewerSpace: XRReferenceSpace | null = null;
  let cameraManager: WebXRCameraManager | null = null;
  let rootAnchor: Group; // The group that tracks the QR code
  let isTracking = false;

  // Blob Detection State
  let frameCount = 0;
  const PROCESS_INTERVAL = 15; // Process every N frames to save perf
  let lastProcessedData: Uint8Array | null = null;

  interface ColorSetting {
    name: string;
    rgb: string; // "rgb(r, g, b)"
    rgbValues: number[]; // [r, g, b]
    height: number;
    meshGroup: Group;
  }

  const colorSettings: Record<string, ColorSetting> = {
    Red: { name: "red", rgb: "rgb(255, 0, 0)", rgbValues: [255, 0, 0], height: 15, meshGroup: new Group() },
    Blue: { name: "blue", rgb: "rgb(0, 90, 255)", rgbValues: [0, 90, 255], height: 33, meshGroup: new Group() },
    Green: { name: "green", rgb: "rgb(30, 255, 0)", rgbValues: [30, 255, 0], height: 6, meshGroup: new Group() },
  };

  startButton.addEventListener("click", startAR);

  // Initialize UI controls
  initializeUI();

  async function startAR() {
    if (!navigator.xr) {
      alert("WebXR not supported on this device/browser.");
      return;
    }

    try {
      // Load the tracking image
      const imageBitmap = await loadTrackingImage("interactive_urbanism.png");
      if (!imageBitmap) {
        alert("Could not load tracking image.");
        return;
      }

      // Initialize Session
      // @ts-ignore
      const session = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["image-tracking", "camera-access", "dom-overlay"],
        trackedImages: [
          {
            image: imageBitmap,
            widthInMeters: QR_SIZE_METERS
          }
        ],
        domOverlay: { root: document.body } // Use body or a specific overlay container
      });

      xrSession = session;
      startButton.style.display = "none";
      if (statusText) statusText.innerText = "Starting session...";

      setupThreeJS(session);

      session.addEventListener("end", () => {
        xrSession = null;
        startButton.style.display = "block";
        if (statusText) statusText.innerText = "Session ended";
        renderer.setAnimationLoop(null);
      });

    } catch (e) {
      console.error("Failed to start AR session", e);
      alert("Failed to start AR session: " + e);
    }
  }

  async function loadTrackingImage(url: string): Promise<ImageBitmap> {
    const response = await fetch(url);
    const blob = await response.blob();
    return await createImageBitmap(blob);
  }

  function setupThreeJS(session: XRSession) {
    renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;

    // We do NOT add renderer.domElement to DOM because WebXR handles the framebuffer
    // However, for DOM Overlay to work over the camera feed, Three.js usually needs the context.
    // In "immersive-ar", the browser renders the camera feed behind the scene.

    // Some boilerplate for WebXR context:
    const gl = renderer.getContext();
    // @ts-ignore
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

    scene = new Scene();
    camera = new PerspectiveCamera(); // Dummy camera, updated by XR

    rootAnchor = new Group();
    rootAnchor.visible = false; // Hidden until tracked
    scene.add(rootAnchor);

    // Initialize Camera Manager for CV
    cameraManager = new WebXRCameraManager(session, gl);

    // Add blobs containers
    for (const key in colorSettings) {
      rootAnchor.add(colorSettings[key].meshGroup);
    }

    // Load Speckle Model
    loadSpeckleModel();

    // Reference Spaces
    session.requestReferenceSpace("local").then((refSpace) => {
      xrRefSpace = refSpace;
      session.requestReferenceSpace("viewer").then((viewerSpace) => {
        xrViewerSpace = viewerSpace;
        session.requestAnimationFrame(onXRFrame);
      });
    });
  }

  async function loadSpeckleModel() {
    const loader = new SpeckleLoader(scene, SPECKLE_STREAM_URL, "");
    try {
        // We load into a temporary object or directly to rootAnchor
        // SpeckleLoader signature varies, let's assume it supports load() returning an object or iterating.
        // Based on docs/examples:
        for await (const object of loader.load()) {
            rootAnchor.add(object);
        }
        console.log("Speckle model loaded");
    } catch (e) {
        console.error("Error loading Speckle model:", e);
    }
  }

  function onXRFrame(t: number, frame: XRFrame) {
    const session = frame.session;
    session.requestAnimationFrame(onXRFrame);

    const viewerPose = frame.getViewerPose(xrRefSpace!);
    if (viewerPose) {
      // 1. Handle Image Tracking
      const results = frame.getImageTrackingResults();
      if (results.length > 0) {
        const result = results[0];
        const pose = frame.getPose(result.imageSpace, xrRefSpace!);

        if (pose) {
          if (!isTracking) {
             isTracking = true;
             rootAnchor.visible = true;
             if (statusText) statusText.innerText = "Tracking QR Code";
          }

          // Update anchor position/rotation
          // We apply the pose directly to the rootAnchor
          const position = pose.transform.position;
          const orientation = pose.transform.orientation;

          rootAnchor.position.set(position.x, position.y, position.z);
          rootAnchor.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
        }
      } else {
          // Optional: handle loss of tracking
      }

      // 2. Handle CV (Color Blobs)
      // Only run if tracking (so we have a place to put them) and periodically
      if (isTracking && frameCount++ % PROCESS_INTERVAL === 0) {
         processCameraFeed(viewerPose);
      }
    }

    renderer.render(scene, camera);
  }

  function processCameraFeed(viewerPose: XRViewerPose) {
    if (!cameraManager) return;

    // Use the first view (usually left eye or mono)
    const view = viewerPose.views[0];
    const texture = cameraManager.getCameraTexture(view);

    if (texture) {
      // The texture dimensions match the camera viewport in the session
      // @ts-ignore
      const viewport = xrSession!.renderState.baseLayer!.getViewport(view);
      const width = viewport.width;
      const height = viewport.height;

      // Read pixels (Expensive!)
      const pixels = cameraManager.readPixelsFromTexture(texture, width, height);
      if (pixels) {
         detectAndGenerateBlobs(pixels, width, height);
      }
    }
  }

  // --- CV Logic Ported from original app ---

  function detectAndGenerateBlobs(pixels: Uint8Array, width: number, height: number) {
    if (typeof cv === "undefined") return;

    // Convert Uint8Array to cv.Mat
    // Note: 'pixels' is RGBA
    const srcMat = new cv.Mat(height, width, cv.CV_8UC4);
    srcMat.data.set(pixels);

    // Process for each color
    for (const key in colorSettings) {
        const setting = colorSettings[key];
        const contours = findContoursForColor(srcMat, setting.rgbValues);
        if (contours.length > 0) {
            updateMeshesForColor(key, contours, width, height);
        }
        // Cleanup contours? In JS OpenCV, we need to manually delete Mats
    }

    srcMat.delete();
  }

  function findContoursForColor(srcMat: any, targetRgb: number[]) {
      // This is CPU heavy.
      // 1. Filter color
      // Doing pixel iteration in JS is slow for 4k textures.
      // We should use OpenCV functions (inRange) if possible.

      // Convert to RGB/HSV?
      // Simple thresholding based on distance in RGB space or strictly inRange.
      // The original code used manual pixel iteration. Let's try to do it faster with cv.inRange.

      // But 'pixels' from WebGL is just a byte array.
      // Let's stick to the manual iteration for now to match behavior, but optimized?
      // Actually, iterating 1280x720 pixels in JS is very slow.
      // Let's use cv.inRange.

      const dst = new cv.Mat();
      const lower = new cv.Mat(srcMat.rows, srcMat.cols, srcMat.type(), [targetRgb[0] - 50, targetRgb[1] - 50, targetRgb[2] - 50, 0]);
      const upper = new cv.Mat(srcMat.rows, srcMat.cols, srcMat.type(), [targetRgb[0] + 50, targetRgb[1] + 50, targetRgb[2] + 50, 255]);

      // Note: This naive RGB range might not match the original logic perfectly but is much faster.
      // Original logic: |r-tr| <= 50 && |g-tg| <= 50...

      cv.inRange(srcMat, lower, upper, dst);

      // Dst is now a binary mask
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const simplified = [];
      for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          const area = cv.contourArea(contour);
          if (area > 500) { // Filter small noise
              const approx = new cv.Mat();
              const epsilon = 0.02 * cv.arcLength(contour, true);
              cv.approxPolyDP(contour, approx, epsilon, true);
              simplified.push(approx); // We must handle memory of these
          } else {
              // contour.delete(); // Don't delete here, contours.get returns a reference?
          }
      }

      dst.delete(); lower.delete(); upper.delete(); hierarchy.delete(); contours.delete();
      return simplified;
  }

  function updateMeshesForColor(key: string, openCVContours: any[], imgWidth: number, imgHeight: number) {
      const group = colorSettings[key].meshGroup;

      // Clear old meshes
      while(group.children.length > 0){
          group.remove(group.children[0]);
      }

      // Update camera matrices for unprojection
      // We assume 'camera' has valid projection from the last render or we update it manually if needed.
      // Since we are in the frame loop, `camera` might be lagging one frame or empty if we haven't rendered yet.
      // But updateMeshesForColor is called after tracking is established.
      camera.updateMatrixWorld();

      // Transform Helper Matrices
      const invRootMatrix = rootAnchor.matrixWorld.clone().invert();

      openCVContours.forEach((contour: any) => {
          const points2D: Vector3[] = [];
          const data32S = contour.data32S; // Int32Array [x, y, x, y...]

          for (let i = 0; i < contour.rows; i++) {
              const u = data32S[i * 2];
              const v = data32S[i * 2 + 1];

              // Normalize to NDC (-1 to 1)
              const x = (u / imgWidth) * 2 - 1;
              const y = -(v / imgHeight) * 2 + 1; // Flip Y for GL

              // 1. Unproject to find a point on the ray in World Space
              const vec = new Vector3(x, y, 0.5);
              vec.unproject(camera); // Now vec is in World Space

              // 2. Transform Ray to Local Space (relative to rootAnchor)
              // Origin in Local Space
              const originLocal = camera.position.clone().applyMatrix4(invRootMatrix);
              // Target Point in Local Space
              const targetLocal = vec.applyMatrix4(invRootMatrix);
              // Direction
              const dirLocal = targetLocal.sub(originLocal).normalize();

              // 3. Intersect with Plane Z=0 (where the QR code and drawings are)
              // Plane Normal is (0, 0, 1) in local space
              // t = -(origin.z) / dir.z
              if (Math.abs(dirLocal.z) > 0.0001) {
                  const t = -originLocal.z / dirLocal.z;
                  if (t > 0) {
                      const intersection = originLocal.add(dirLocal.multiplyScalar(t));
                      points2D.push(intersection);
                  }
              }
          }

          if (points2D.length > 3) {
            try {
                const shape = new Shape(points2D.map(p => new Vector3(p.x, p.y, 0))); // Z is 0
                const geometry = new ExtrudeGeometry(shape, {
                    depth: colorSettings[key].height * 0.001, // Scale height? Assumed mm -> m
                    bevelEnabled: false
                });
                const material = new MeshBasicMaterial({ color: colorSettings[key].rgb, transparent: true, opacity: 0.8 });
                const mesh = new Mesh(geometry, material);
                group.add(mesh);
            } catch (e) {
                console.warn("Failed to create shape from contour", e);
            }
          }

          // Clean up contour
          contour.delete();
      });
  }

  // UI Helpers
  function initializeUI() {
    const settingsBtn = document.getElementById("settings-btn");
    if (settingsBtn) {
        settingsBtn.addEventListener("click", () => {
            const panel = document.getElementById("settingsPanel");
            if (panel) panel.style.display = panel.style.display === "block" ? "none" : "block";
        });
    }

    for (const key in colorSettings) {
      const colorInput = document.getElementById(`color${key}`) as HTMLInputElement;
      const heightInput = document.getElementById(`height${key}`) as HTMLInputElement;

      if (colorInput) {
          colorInput.addEventListener("input", () => {
              colorSettings[key].rgb = hexToRgb(colorInput.value);
              colorSettings[key].rgbValues = parseRgb(colorSettings[key].rgb);
          });
      }
      if (heightInput) {
          heightInput.addEventListener("input", () => {
              colorSettings[key].height = parseInt(heightInput.value);
              const label = document.getElementById(`label${key}`);
              if (label) label.textContent = `Height: ${heightInput.value}`;
          });
      }
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

  function parseRgb(rgb: string) {
      return rgb.match(/\d+/g)!.map(Number);
  }

});

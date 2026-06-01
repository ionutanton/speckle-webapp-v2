import { initSpeckle } from "./speckle-app";
import * as THREE from "three";
declare const cv: any;
declare const XR8: any;
declare const XRExtras: any;

type Colour = { name: string; rgb: string; height: number, hex: number };
type ColourMap = Record<string, Colour>;

let arGroup: THREE.Group | null = null;
let speckleRoot: THREE.Group | null = null;
let sceneRef: THREE.Scene | null = null;
let cameraRef: THREE.PerspectiveCamera | null = null;
let isSpeckleLoaded = false;

let currentlySelectedMesh: THREE.Mesh | null = null;
let originalMaterial: THREE.Material | null = null;

const colour: ColourMap = {
  Red: { name: "red", rgb: "rgb(190, 60, 40)", height: 15, hex: 0 },
  Blue: { name: "blue", rgb: "rgb(50, 150, 180)", height: 33, hex: 0 },
  Green: { name: "green", rgb: "rgb(100, 180, 70)", height: 6, hex: 0 },
};

function rgbToHexStr(rgb: string) {
  const match = rgb.match(/\d+/g);
  if (!match) return "#000000";
  const [r, g, b] = match.map(Number);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function updateSettings(colorKey: string) {
  const hexInput = document.getElementById(`color${colorKey}`) as HTMLInputElement;
  const heightInput = document.getElementById(`height${colorKey}`) as HTMLInputElement;
  const heightLabel = document.getElementById(`label${colorKey}`) as HTMLElement;

  const hexStr = hexInput.value.replace("#", "");
  const r = parseInt(hexStr.substring(0, 2), 16);
  const g = parseInt(hexStr.substring(2, 4), 16);
  const b = parseInt(hexStr.substring(4, 6), 16);
  const rgbcolour = `rgb(${r}, ${g}, ${b})`;

  colour[colorKey as keyof ColourMap].rgb = rgbcolour;
  colour[colorKey as keyof ColourMap].height = parseFloat(heightInput.value);

  const values = rgbcolour.match(/\d+/g)!.map(Number);
  colour[colorKey as keyof ColourMap].hex = (values[0] << 16) + (values[1] << 8) + values[2];

  heightLabel.textContent = `Height: ${heightInput.value}`;

  // Dynamically update the scale of existing extruded meshes
  if (arGroup) {
    const computedDepth = colour[colorKey as keyof ColourMap].height * 0.01;
    arGroup.children.forEach(child => {
      if (child.userData.colorName === colorKey) {
        child.scale.z = computedDepth;
      }
    });
  }
}

function initializeUI() {
  document.getElementById("settings-btn")!.addEventListener("click", () => {
    const panel = document.getElementById("settingsPanel") as HTMLElement;
    panel.style.display = panel.style.display === "block" ? "none" : "block";
  });

  document.getElementById("capture")!.addEventListener("click", () => {
    console.log("[DEBUG] Capture button clicked.");
    const statusText = document.getElementById("qr-status");
    if (statusText) statusText.innerText = "Processing image...";
    (window as any).captureRequested = true;
  });

  for (const key in colour) {
    (document.getElementById(`color${key}`) as HTMLInputElement).value = rgbToHexStr(colour[key as keyof ColourMap].rgb);
    (document.getElementById(`height${key}`) as HTMLInputElement).value = colour[key as keyof ColourMap].height.toString();
    document.getElementById(`label${key}`)!.textContent = `Height: ${colour[key as keyof ColourMap].height}`;
    document.getElementById(`color${key}`)!.addEventListener("input", () => updateSettings(key));
    document.getElementById(`height${key}`)!.addEventListener("input", () => updateSettings(key));
  }
}

const NativeARPipelineModule = () => {
  return {
    name: 'speckle-native-ar',
    onStart: (_args: any) => {
      const { scene, camera } = XR8.Threejs.xrScene();
      sceneRef = scene;
      cameraRef = camera;

      arGroup = new THREE.Group();
      scene.add(arGroup);

      const light1 = new THREE.DirectionalLight(0xffffff, 1.6);
      light1.position.set(5, 10, 5);
      scene.add(light1);

      const light2 = new THREE.DirectionalLight(0xffffff, 1.2);
      light2.position.set(-5, 8, -5);
      scene.add(light2);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      arGroup.visible = false;
      console.log("8th Wall AR Scene initialized.");

      // Now that 8th Wall has successfully acquired the camera and unlocked permissions,
      // it is safe to enumerate devices to populate the dropdown without freezing iOS Safari.
      if (typeof (window as any)._getCameras === "function") {
        (window as any)._getCameras();
      }

      const arCanvas = document.getElementById('arCanvas') as HTMLCanvasElement;
      if (arCanvas) {
        arCanvas.addEventListener('touchstart', (e: TouchEvent) => {
          if (!cameraRef || !speckleRoot || !arGroup || !arGroup.visible) return;

          const touch = e.touches[0];
          // We must ignore touches on UI elements like buttons or the settings panel
          if ((e.target as HTMLElement).tagName.toLowerCase() !== 'canvas') return;

          const tapX = (touch.clientX / window.innerWidth) * 2 - 1;
          const tapY = -(touch.clientY / window.innerHeight) * 2 + 1;

          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(tapX, tapY), cameraRef);

          const intersects = raycaster.intersectObject(speckleRoot, true);
          if (intersects.length > 0) {
            const intersectedObj = intersects[0].object as THREE.Mesh;
            console.log(`[DEBUG-SELECTION] Mesh Selected: ${intersectedObj.name || 'Unnamed Mesh'}`);
            console.log(`[DEBUG-SELECTION] Mesh Data:`, JSON.stringify(intersectedObj.userData, null, 2));

            // Restore previous mesh material if any
            if (currentlySelectedMesh && originalMaterial) {
              currentlySelectedMesh.material = originalMaterial;
            }

            // Highlight new mesh
            currentlySelectedMesh = intersectedObj;
            originalMaterial = intersectedObj.material as THREE.Material;

            const highlightMaterial = new THREE.MeshStandardMaterial({
              color: 0x0000ff,
              roughness: 0.5,
              metalness: 0.1,
              side: THREE.DoubleSide
            });
            intersectedObj.material = highlightMaterial;
          }
        }, { passive: true });
      }
    },

    onEvent: (event: any) => {
      if (event.name === 'reality.imagescanning') {
        const statusText = document.getElementById("qr-status");
        if (statusText) statusText.innerText = "Status: Searching for Image Target...";
      } else if (event.name === 'reality.projectloaded') {
        console.log("[XR8 EVENT] Image Target Project Loaded successfully.");
      }
    },

    listeners: [
      {
        event: 'reality.imagefound',
        process: ({ detail }: any) => {
          console.log(`[DEBUG] Image Target Found: ${detail.name}`);
          const statusText = document.getElementById("qr-status");
          if (statusText) statusText.innerText = `Status: Found Target (${detail.name})!`;

          if (detail.name === 'qrcode') {
            if (arGroup) {
              arGroup.position.copy(detail.position);
              arGroup.quaternion.copy(detail.rotation);
              arGroup.scale.set(detail.scale, detail.scale, detail.scale);
              arGroup.visible = true;

              if (isSpeckleLoaded && speckleRoot && !arGroup.children.includes(speckleRoot)) {
                speckleRoot.scale.set(0.01, 0.01, 0.01);
                speckleRoot.rotation.set(0, 0, 0);
                speckleRoot.position.set(-0.5, 0.5, 0);
                arGroup.add(speckleRoot);
                console.log("[DEBUG] Speckle model attached to image target.");
              }
            }
          }
        }
      },
      {
        event: 'reality.imageupdated',
        process: ({ detail }: any) => {
          if (detail.name === 'qrcode' && arGroup) {
            arGroup.position.copy(detail.position);
            arGroup.quaternion.copy(detail.rotation);
            arGroup.scale.set(detail.scale, detail.scale, detail.scale);
          }
        }
      },
      {
        event: 'reality.imagelost',
        process: ({ detail }: any) => {
          console.log(`[DEBUG] Image Target Lost: ${detail.name}`);
          const statusText = document.getElementById("qr-status");
          if (statusText) statusText.innerText = "Status: Target Lost (Anchored to SLAM)";
        }
      }
    ],
    onUpdate: () => {
      if ((window as any).captureRequested && arGroup) {
        console.log("[DEBUG-CAPTURE] onUpdate: Capture requested, hiding AR objects to capture background.");
        (window as any)._arGroupWasVisible = arGroup.visible;
        arGroup.visible = false;
        (window as any)._doCaptureThisFrame = true;
        (window as any).captureRequested = false;
      }
    },
    onRender: () => {
      if ((window as any)._doCaptureThisFrame) {
        console.log("[DEBUG-CAPTURE] onRender: AR objects hidden, reading clean canvas frame...");
        (window as any)._doCaptureThisFrame = false;

        const canvas = document.getElementById('arCanvas') as HTMLCanvasElement;
        const width = canvas.width;
        const height = canvas.height;
        console.log(`[DEBUG-CAPTURE] Canvas dimensions: ${width}x${height}`);

        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext("2d");

        if (ctx) {
          ctx.drawImage(canvas, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          console.log(`[DEBUG-CAPTURE] Captured clean image data, size: ${imageData.data.length} bytes.`);

          setTimeout(() => {
            console.log("[DEBUG-CAPTURE] Triggering processImageData asynchronously...");
            processImageData(imageData, width, height);
          }, 10);
        } else {
          console.error("[DEBUG-CAPTURE] Failed to get 2d context for offscreen canvas.");
        }

        if (arGroup) {
          console.log("[DEBUG-CAPTURE] Restoring AR objects visibility.");
          arGroup.visible = (window as any)._arGroupWasVisible;
        }
      }
    }
  }
};

function filterPixels(imageData: ImageData, targetColor: number[], tolerance = 50) {
  const data = imageData.data;
  const filteredPixels = new Uint8ClampedArray(data.length);
  let matchCount = 0;

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
      filteredPixels[i + 3] = data[i + 3]; // Preserve original alpha
      matchCount++;
    } else {
      filteredPixels[i] = 0;
      filteredPixels[i + 1] = 0;
      filteredPixels[i + 2] = 0;
      filteredPixels[i + 3] = 0;
    }
  }
  return { filteredPixels, matchCount };
}

function detectAndSimplifyBoundaries(imageData: ImageData) {
  console.log("[DEBUG-CV] Starting OpenCV contour detection...");
  // @ts-ignore
  if (!cv || !cv.Mat) {
    console.error("[DEBUG-CV] OpenCV not loaded");
    return { boundaries: [], rawContours: 0, contoursLog: "OpenCV missing\n" };
  }

  // @ts-ignore
  const mat = cv.matFromImageData(imageData);

  // @ts-ignore
  const gray = new cv.Mat();
  // @ts-ignore
  const edges = new cv.Mat();
  // @ts-ignore
  const contours = new cv.MatVector();
  // @ts-ignore
  const hierarchy = new cv.Mat();

  const simplifiedContours: any[] = [];
  let contoursLog = '';
  let rawContoursCount = 0;
  try {
    // @ts-ignore
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY, 0);
    // @ts-ignore
    cv.Canny(gray, edges, 100, 200, 3);
    // @ts-ignore
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    rawContoursCount = contours.size();
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      // @ts-ignore
      const epsilon = 0.02 * cv.arcLength(contour, true);
      // @ts-ignore
      const simplifiedContour = new cv.Mat();
      // @ts-ignore
      cv.approxPolyDP(contour, simplifiedContour, epsilon, true);

      const points = [];
      for (let j = 0; j < simplifiedContour.rows; j++) {
        const point = simplifiedContour.data32S.slice(j * 2, j * 2 + 2);
        points.push({ x: point[0], y: point[1] });
      }

      contoursLog += `  - Contour ${i}: simplified to ${points.length} vertices\n`;
      simplifiedContours.push(points);
      simplifiedContour.delete();
      contour.delete();
    }
  } catch (err: any) {
    let msg = String(err);
    if (typeof err === 'number') {
      // @ts-ignore
      msg = cv.exceptionFromPtr(err).msg;
    }
    contoursLog += `[DEBUG-CV] FATAL ERROR in OpenCV: ${msg}\n`;
    console.error("[DEBUG-CV] OpenCV Exception:", msg);
  }

  mat.delete();
  gray.delete();
  edges.delete();
  contours.delete();
  hierarchy.delete();

  return { boundaries: simplifiedContours, rawContours: rawContoursCount, contoursLog };
}

function raycastToARPlane(points2D: { x: number, y: number }[], canvasWidth: number, canvasHeight: number) {
  if (!cameraRef || !arGroup) return { localPoints: [], firstRaycastLog: "Missing cameraRef or arGroup\n" };

  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(arGroup.quaternion).normalize();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, arGroup.position);

  const raycaster = new THREE.Raycaster();
  const localPoints: THREE.Vector3[] = [];
  let missedCount = 0;

  let firstRaycastLog = '';
  for (let i = 0; i < points2D.length; i++) {
    const p = points2D[i];
    const ndcX = (p.x / canvasWidth) * 2 - 1;
    const ndcY = -(p.y / canvasHeight) * 2 + 1;

    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cameraRef);
    const intersect = new THREE.Vector3();
    const result = raycaster.ray.intersectPlane(plane, intersect);

    if (result) {
      const localPt = arGroup.worldToLocal(intersect.clone());
      localPoints.push(localPt);
      if (i === 0) firstRaycastLog = `  - First pt 2D(${p.x}, ${p.y}) -> 3D Local(${localPt.x.toFixed(3)}, ${localPt.y.toFixed(3)}, ${localPt.z.toFixed(3)})\n`;
    } else {
      missedCount++;
    }
  }

  return { localPoints, firstRaycastLog };
}

function buildExtrudedMesh(localPoints: THREE.Vector3[], colourName: string) {
  if (localPoints.length < 3) {
    console.warn(`[DEBUG-EXTRUDE] Not enough points to build a polygon (${localPoints.length}). Skipping.`);
    return null;
  }
  console.log(`[DEBUG-EXTRUDE] Building 3D Extrusion for ${colourName} with ${localPoints.length} vertices...`);

  const rgbStr = colour[colourName as keyof ColourMap].rgb;
  const match = rgbStr.match(/\d+/g);
  let hexColor = 0xffffff;
  if (match && match.length >= 3) {
    hexColor = (parseInt(match[0]) << 16) + (parseInt(match[1]) << 8) + parseInt(match[2]);
  }

  const material = new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  const shape = new THREE.Shape();
  shape.moveTo(localPoints[0].x, localPoints[0].y);
  for (let i = 1; i < localPoints.length; i++) {
    shape.lineTo(localPoints[i].x, localPoints[i].y);
  }
  shape.lineTo(localPoints[0].x, localPoints[0].y);

  const extrudeSettings = {
    steps: 1,
    depth: 1, // Base depth is 1, we will scale it dynamically
    bevelEnabled: false,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  const mesh = new THREE.Mesh(geometry, material);

  const depthScale = 0.01;
  const computedDepth = colour[colourName as keyof ColourMap].height * depthScale;
  mesh.scale.z = computedDepth;
  mesh.userData.colorName = colourName;

  mesh.position.z += 0.001;

  console.log(`[DEBUG-EXTRUDE] Successfully built ExtrudedMesh for ${colourName}.`);
  return mesh;
}

function processImageData(imageData: ImageData, width: number, height: number) {
  const statusText = document.getElementById("qr-status");
  if (statusText) statusText.innerText = "Analyzing CV filters...";

  for (const colorKey of ["Red", "Green", "Blue"]) {
    let logBuffer = `\n[DEBUG-MAIN] --- Processing Color Channel: ${colorKey} ---\n`;
    const rgbArray = colour[colorKey as keyof ColourMap].rgb.match(/\d+/g)!.map(Number);
    logBuffer += `Target RGB: ${rgbArray.join(",")} | Tolerance: 60\n`;

    const { filteredPixels, matchCount } = filterPixels(imageData, rgbArray, 60);
    logBuffer += `Found ${matchCount} matching pixels out of ${imageData.data.length / 4} total.\n`;

    const filteredImageData = new ImageData(filteredPixels, width, height);
    const { boundaries, rawContours, contoursLog } = detectAndSimplifyBoundaries(filteredImageData);

    logBuffer += `Canny/FindContours: ${rawContours} raw contours.\n`;
    logBuffer += contoursLog;
    logBuffer += `Valid shapes after simplification: ${boundaries.length}\n`;

    if (arGroup && boundaries.length > 0) {
      let createdShapes = 0;
      for (let idx = 0; idx < boundaries.length; idx++) {
        const boundary = boundaries[idx];
        logBuffer += `Shape #${idx + 1}/${boundaries.length} (${boundary.length} verts) Raycast:\n`;
        const { localPoints, firstRaycastLog } = raycastToARPlane(boundary, width, height);
        logBuffer += firstRaycastLog;

        if (localPoints.length >= 3) {
          const mesh = buildExtrudedMesh(localPoints, colorKey);
          if (mesh) {
            arGroup.add(mesh);
            createdShapes++;
            logBuffer += `  -> Successfully generated & attached 3D mesh.\n`;
          }
        } else {
          logBuffer += `  -> Failed: only ${localPoints.length} valid 3D points recovered.\n`;
        }
      }
      logBuffer += `Finished processing ${colorKey}: ${createdShapes} final meshes attached.\n`;
    } else {
      logBuffer += `Skipping extrusion for ${colorKey}: No viable shapes detected.\n`;
    }

    console.log(logBuffer);
  }

  if (statusText) statusText.innerText = "Overlay complete!";
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("=== APP STARTING ===");
  console.log("Fetching dynamic settings...");

  let speckleUrl = "https://app.speckle.systems/projects/6293f7974f/models/3e77e04b05";
  try {
    const res = await fetch("/resource/specklelink.txt");
    if (res.ok) {
      speckleUrl = (await res.text()).trim();
      console.log(`Loaded Speckle URL: ${speckleUrl}`);
    }
  } catch (e) {
    console.error("Could not load specklelink.txt, using fallback.");
  }

  let imageTargetData: any = null;
  try {
    const res = await fetch("/resource/qrcode-target.json");
    if (res.ok) {
      imageTargetData = await res.json();
      if (imageTargetData.imagePath) {
        imageTargetData.imagePath = "/resource/" + imageTargetData.imagePath.split('/').pop();
      }
      if (imageTargetData.resources) {
        for (const key in imageTargetData.resources) {
          imageTargetData.resources[key] = "/resource/" + imageTargetData.resources[key].split('/').pop();
        }
      }
      console.log("Loaded qrcode-target.json successfully.");
    } else {
      console.warn("Failed to load qrcode-target.json (HTTP " + res.status + ")");
    }
  } catch (e) {
    console.error("Could not load qrcode-target.json", e);
  }

  console.log("Initialising Speckle...");
  const viewer = await initSpeckle(speckleUrl);
  if (viewer) {
    isSpeckleLoaded = true;
    // Extract the internal THREE.Scene from Speckle's renderer to use in our AR scene
    speckleRoot = viewer.getRenderer().scene as unknown as THREE.Group;
    console.log("Speckle model loaded and extracted.");
  } else {
    console.error("Failed to initialize Speckle viewer.");
  }

  const cleanSpeckleGroup = new THREE.Group();

  function convertSpeckleToStandardThreeJS(node: THREE.Object3D) {
    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;

      // Filter out Speckle Viewer's internal grid and shadow catcher
      if (mesh.name.toLowerCase().includes('grid') || mesh.type === 'GridHelper' || mesh.type === 'LineSegments' || mesh.name.toLowerCase().includes('shadowcatcher')) {
        return;
      }
      if (mesh.material && (mesh.material as any).type === 'ShadowMaterial') {
        return;
      }

      if (mesh.geometry) {
        const geometry = mesh.geometry.clone();
        const originalMaterial: any = mesh.material;
        const color = originalMaterial && originalMaterial.color ? originalMaterial.color : new THREE.Color(0xffffff);
        const standardMaterial = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.5,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
        const newMesh = new THREE.Mesh(geometry, standardMaterial);
        newMesh.position.copy(mesh.position);
        newMesh.rotation.copy(mesh.rotation);
        newMesh.scale.copy(mesh.scale);
        newMesh.name = mesh.name;
        // Speckle Viewer often puts node ID or raw data inside userData
        newMesh.userData = mesh.userData || {};
        newMesh.updateMatrixWorld(true);
        cleanSpeckleGroup.add(newMesh);
      }
    } else {
      const children = [...node.children];
      for (const child of children) {
        convertSpeckleToStandardThreeJS(child);
      }
    }
  }

  if (speckleRoot) {
    const childrenToConvert = [...speckleRoot.children];
    for (const child of childrenToConvert) {
      convertSpeckleToStandardThreeJS(child);
    }
    cleanSpeckleGroup.updateMatrixWorld(true);
    speckleRoot = cleanSpeckleGroup;
  }

  initializeUI();

  let currentDeviceId: string | null = null;

  async function getCameras() {
    console.log("[DEBUG] Fetching available cameras via enumerateDevices...");
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.error("[DEBUG] navigator.mediaDevices.enumerateDevices is NOT supported on this browser!");
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log(`[DEBUG] Found ${devices.length} total media devices.`);
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      console.log(`[DEBUG] Found ${videoDevices.length} video input devices.`);

      const cameraSelect = document.getElementById("cameraSelect") as HTMLSelectElement;
      if (cameraSelect) {
        cameraSelect.innerHTML = "";
        videoDevices.forEach((d, i) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.text = d.label || `Camera ${i + 1}`;
          console.log(`[DEBUG] Adding camera to dropdown: ${opt.text} [ID: ${opt.value.substring(0, 8)}...]`);
          cameraSelect.appendChild(opt);
        });

        if (currentDeviceId) {
          cameraSelect.value = currentDeviceId;
        }

        // Only add listener if not already added, or just replace it
        const newSelect = cameraSelect.cloneNode(true) as HTMLSelectElement;
        cameraSelect.parentNode?.replaceChild(newSelect, cameraSelect);

        newSelect.addEventListener("change", () => {
          const selectedCamera = newSelect.value;
          console.log(`[DEBUG] Dropdown changed. User selected camera: ${selectedCamera}`);
          if (selectedCamera !== currentDeviceId) {
            currentDeviceId = selectedCamera;
            if (XR8.XrController && XR8.XrController.updateCamera) {
              console.log("[DEBUG] Updating XR8 camera dynamically via XrController...");
              XR8.XrController.updateCamera({ deviceId: selectedCamera });
            } else {
              console.log("[DEBUG] updateCamera not available. Restarting XR8 engine...");
              XR8.stop();
              XR8.clearCameraPipelineModules();
              startXR();
            }
          }
        });
      }
    } catch (e) {
      console.error("[DEBUG] Critical error during enumerateDevices:", e);
    }
  }

  (window as any)._getCameras = getCameras;

  const startXR = () => {
    if (imageTargetData) {
      imageTargetData.name = "qrcode";
      console.log("Configuring XR8 with imageTargetData:", JSON.stringify(imageTargetData, null, 2));
      XR8.XrController.configure({ imageTargetData: [imageTargetData] });
    }

    XR8.addCameraPipelineModules([
      XRExtras.Loading.pipelineModule(),
      XRExtras.RuntimeError.pipelineModule(),
      XRExtras.FullWindowCanvas.pipelineModule(),
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(), // Enables SLAM tracking
      NativeARPipelineModule(),
    ]);

    const config: any = { canvas: document.getElementById('arCanvas') };
    if (currentDeviceId) {
      config.cameraConfig = { deviceId: currentDeviceId };
    }

    XR8.run(config);
  };

  const onxrloaded = () => {
    (window as any).THREE = THREE;
    startXR();
  };

  if ((window as any).XR8) {
    onxrloaded();
  } else {
    window.addEventListener('xrloaded', onxrloaded);
  }
});
import { Logger } from "./logger";
(window as any).__isProd = import.meta.env.PROD;
import { initSpeckle } from "./speckle-app";
import * as THREE from "three";
declare const cv: any;
declare const XR8: any;
declare const XRExtras: any;

type Colour = { name: string; rgb: string; height: number, hex: number };
type ColourMap = Record<string, Colour>;

let arGroup: THREE.Group | null = null;
let speckleRoot: THREE.Group | null = null;
let contentGroup: THREE.Group | null = null;
let isSpeckleLoaded = false;
let sceneRef: THREE.Scene | null = null;
let cameraRef: THREE.PerspectiveCamera | null = null;
let sunLight: THREE.DirectionalLight | null = null;
let sunTarget: THREE.Object3D | null = null;

let currentlySelectedMesh: THREE.Mesh | null = null;
let originalMaterial: THREE.Material | null = null;
let highlightContour: THREE.LineSegments | null = null;

let activeTouchMode: 'none' | 'height' | 'pan-rotate' = 'none';
let previousTouchY = 0;
let previousTouchCentroid = new THREE.Vector2();
let previousTouchAngle = 0;

let globalScaleFactor = 0.01;
let currentImageTargetScale = 1;

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
    arGroup.children.forEach(child => {
      if (child.userData.colorName === colorKey) {
        const scaleRatio = globalScaleFactor / (child.userData.capturedGlobalScale || 1);
        child.scale.z = colour[colorKey as keyof ColourMap].height * globalScaleFactor;
        child.scale.x = scaleRatio;
        child.scale.y = scaleRatio;

        if (child.userData.originalPosition) {
          const anchorX = -0.5;
          const anchorY = 0.5;
          child.position.x = anchorX + (child.userData.originalPosition.x - anchorX) * scaleRatio;
          child.position.y = anchorY + (child.userData.originalPosition.y - anchorY) * scaleRatio;
        }
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
    Logger.debug("[DEBUG] Capture button clicked.");
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

  const snapValues = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1];
  const scaleRange = document.getElementById("globalScaleRange") as HTMLInputElement;
  const scaleInput = document.getElementById("globalScaleInput") as HTMLInputElement;

  if (scaleRange && scaleInput) {
    const updateGlobalScale = (val: number) => {
      globalScaleFactor = val;
      scaleInput.value = val.toString();
      if (contentGroup) {
        contentGroup.scale.set(globalScaleFactor, globalScaleFactor, globalScaleFactor);
      }
      if (arGroup) {
        arGroup.children.forEach(child => {
          if (child.userData.isExtrudedVolume) {
            const colorKey = child.userData.colorName;
            if (colorKey && colour[colorKey as keyof ColourMap]) {
              const scaleRatio = globalScaleFactor / (child.userData.capturedGlobalScale || 1);
              child.scale.z = colour[colorKey as keyof ColourMap].height * globalScaleFactor;
              child.scale.x = scaleRatio;
              child.scale.y = scaleRatio;

              if (child.userData.originalPosition) {
                const anchorX = -0.5;
                const anchorY = 0.5;
                child.position.x = anchorX + (child.userData.originalPosition.x - anchorX) * scaleRatio;
                child.position.y = anchorY + (child.userData.originalPosition.y - anchorY) * scaleRatio;
              }
            }
          }
        });
      }
    };

    scaleRange.addEventListener("input", (e) => {
      const index = parseInt((e.target as HTMLInputElement).value);
      updateGlobalScale(snapValues[index]);
    });

    scaleInput.addEventListener("change", (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value) || 1;

      // Update slider to closest snap value
      let closestIndex = 0;
      let minDiff = Infinity;
      snapValues.forEach((snap, idx) => {
        const diff = Math.abs(snap - val);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = idx;
        }
      });
      scaleRange.value = closestIndex.toString();

      updateGlobalScale(val);
    });

    const timeOfDayRange = document.getElementById("timeOfDayRange") as HTMLInputElement;
    const timeOfDayLabel = document.getElementById("timeOfDayLabel");
    const monthOfYearRange = document.getElementById("monthOfYearRange") as HTMLInputElement;
    const monthOfYearLabel = document.getElementById("monthOfYearLabel");

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const updateSun = () => {
      if (sunLight && sunTarget) {
        const hour = parseFloat(timeOfDayRange.value);
        const month = parseInt(monthOfYearRange.value);
        updateSunPosition(sunLight, sunTarget, hour, month);
      }
    };

    if (timeOfDayRange && timeOfDayLabel) {
      timeOfDayRange.addEventListener("input", (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        const h = Math.floor(val);
        const m = (val - h) === 0.5 ? "30" : "00";
        timeOfDayLabel.innerText = `${h.toString().padStart(2, '0')}:${m}`;
        updateSun();
      });
    }

    if (monthOfYearRange && monthOfYearLabel) {
      monthOfYearRange.addEventListener("input", (e) => {
        const val = parseInt((e.target as HTMLInputElement).value);
        monthOfYearLabel.innerText = monthNames[val - 1];
        updateSun();
      });
    }
  }
}

// Function to calculate solar position based on hour (0-24) and month (1-12)
function updateSunPosition(sun: THREE.DirectionalLight, target: THREE.Object3D, hour: number, month: number) {
  // Approximate day of year (middle of each month)
  const daysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const d = daysInMonth[month - 1] + 15;
  
  // Latitude of 45°N for defaults (London is ~51.5)
  const latitude = 45 * Math.PI / 180;
  
  // Declination angle
  const declination = (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI / 365) * (d - 81));
  
  // Hour angle (15 degrees per hour, 12 is solar noon)
  const hourAngle = (15 * (hour - 12)) * Math.PI / 180;
  
  // Solar Elevation (altitude)
  const elevation = Math.asin(Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle));
  
  // Solar Azimuth (relative to South)
  let azimuth = Math.acos((Math.sin(declination) - Math.sin(elevation) * Math.sin(latitude)) / (Math.cos(elevation) * Math.cos(latitude)));
  
  // Correct azimuth quadrant based on time of day (morning vs afternoon)
  if (hour > 12) {
    azimuth = 2 * Math.PI - azimuth;
  }
  
  // Add PI because azimuth is usually measured from South, and we want North to map to +Y in AR local space
  azimuth += Math.PI;

  const spherical = new THREE.Spherical(50, Math.PI / 2 - elevation, azimuth);
  sun.position.setFromSpherical(spherical);
  sun.position.add(target.position);
  sun.updateWorldMatrix(true, true);
  target.updateMatrixWorld(true);
}

const NativeARPipelineModule = () => {
  return {
    name: 'speckle-native-ar',
    onStart: (_args: any) => {
      const { scene, camera, renderer } = XR8.Threejs.xrScene();
      sceneRef = scene;
      cameraRef = camera;

      // Setup renderer for Speckle aesthetics
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.VSMShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace; // Three.js r152+ uses outputColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.5;

      arGroup = new THREE.Group();
      scene.add(arGroup);
      
      contentGroup = new THREE.Group();
      // Anchor content to the top-left of the QR Code (which is -0.5, +0.5 in the 1x1 local space of arGroup)
      contentGroup.position.set(-0.5, 0.5, 0);
      contentGroup.scale.set(globalScaleFactor, globalScaleFactor, globalScaleFactor);
      arGroup.add(contentGroup);

      sunLight = new THREE.DirectionalLight(0xffffff, 5);
      sunLight.name = 'sun';
      sunLight.castShadow = true;
      
      // Shadow camera configuration
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      const d = 5; // Smaller frustum for 8th Wall AR context (model scale is typically around 1 unit)
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.camera.near = 0.1;
      sunLight.shadow.camera.far = 100;
      sunLight.shadow.bias = -0.00005; // Extremely small bias for AR scale to fix Peter Panning
      sunLight.shadow.normalBias = 0.005; // Helps prevent shadow acne with small bias
      sunLight.shadow.radius = 2;

      scene.add(sunLight);

      sunTarget = new THREE.Object3D();
      scene.add(sunTarget);
      sunTarget.position.set(0, 0, 0);
      sunLight.target = sunTarget;

      // Default to Spring Equinox (March, Month 3) at 12 PM
      updateSunPosition(sunLight, sunTarget, 12, 3);

      const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambientLight);

      arGroup.visible = false;
      Logger.info("8th Wall AR Scene initialized.");

      // Now that 8th Wall has successfully acquired the camera and unlocked permissions,
      // it is safe to enumerate devices to populate the dropdown without freezing iOS Safari.
      if (typeof (window as any)._getCameras === "function") {
        (window as any)._getCameras();
      }

      const arCanvas = document.getElementById('arCanvas') as HTMLCanvasElement;
      if (arCanvas) {

        const deselectCurrentMesh = () => {
          if (currentlySelectedMesh) {
            if (originalMaterial) currentlySelectedMesh.material = originalMaterial;
            if (highlightContour) {
              currentlySelectedMesh.remove(highlightContour);
              highlightContour.geometry.dispose();
              (highlightContour.material as THREE.Material).dispose();
              highlightContour = null;
            }
            currentlySelectedMesh = null;
            originalMaterial = null;
          }
        };

        const selectMesh = (mesh: THREE.Mesh) => {
          deselectCurrentMesh();
          currentlySelectedMesh = mesh;
          originalMaterial = mesh.material as THREE.Material;

          // Lighter color material
          const newMaterial = (originalMaterial as THREE.MeshStandardMaterial).clone();
          newMaterial.emissive = new THREE.Color(0x333333);
          currentlySelectedMesh.material = newMaterial;

          // Add contour
          const edges = new THREE.EdgesGeometry(mesh.geometry);
          highlightContour = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
          currentlySelectedMesh.add(highlightContour);
        };

        let lastTapTime = 0;

        const resetARScene = () => {
          deselectCurrentMesh();
          if (arGroup) {
            const meshesToRemove = arGroup.children.filter(child => child.userData.isExtrudedVolume);
            meshesToRemove.forEach(mesh => {
              arGroup!.remove(mesh);
              if ((mesh as THREE.Mesh).geometry) (mesh as THREE.Mesh).geometry.dispose();
              if ((mesh as THREE.Mesh).material) ((mesh as THREE.Mesh).material as THREE.Material).dispose();
            });
          }

          if (XR8 && XR8.XrController) {
            XR8.XrController.recenter();
          }

          Logger.debug("[DEBUG] AR Scene reset on double tap.");
          const statusText = document.getElementById("qr-status");
          if (statusText) statusText.innerText = "Status: Scene Reset (Double Tap)";
        };

        arCanvas.addEventListener('touchstart', (e: TouchEvent) => {
          if (!cameraRef || !arGroup || !arGroup.visible) return;
          if ((e.target as HTMLElement).tagName.toLowerCase() !== 'canvas') return;

          // Prevent default to stop page zooming/scrolling
          e.preventDefault();

          const currentTime = new Date().getTime();
          const tapLength = currentTime - lastTapTime;
          if (tapLength < 300 && tapLength > 0 && e.touches.length === 1) {
            resetARScene();
            lastTapTime = 0;
            return;
          }
          lastTapTime = currentTime;

          if (e.touches.length === 1) {
            const touch = e.touches[0];
            const tapX = (touch.clientX / window.innerWidth) * 2 - 1;
            const tapY = -(touch.clientY / window.innerHeight) * 2 + 1;

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(new THREE.Vector2(tapX, tapY), cameraRef);

            // Raycast only against extruded volumes in arGroup
            const extrudedMeshes = arGroup ? arGroup.children.filter(child => child.userData.isExtrudedVolume) : [];
            const intersects = raycaster.intersectObjects(extrudedMeshes, true);

            if (intersects.length > 0) {
              const hitMesh = intersects[0].object as THREE.Mesh;
              if (hitMesh !== currentlySelectedMesh) {
                selectMesh(hitMesh);
              }
              activeTouchMode = 'height';
              previousTouchY = touch.clientY;
            } else {
              deselectCurrentMesh();
              activeTouchMode = 'none';
            }
          } else if (e.touches.length === 2 && currentlySelectedMesh) {
            activeTouchMode = 'pan-rotate';
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            previousTouchCentroid.set(
              (e.touches[0].clientX + e.touches[1].clientX) / 2,
              (e.touches[0].clientY + e.touches[1].clientY) / 2
            );
            previousTouchAngle = Math.atan2(dy, dx);
          }
        }, { passive: false });

        arCanvas.addEventListener('touchmove', (e: TouchEvent) => {
          if (!currentlySelectedMesh || activeTouchMode === 'none') return;
          e.preventDefault();

          if (activeTouchMode === 'height' && e.touches.length === 1) {
            const dy = e.touches[0].clientY - previousTouchY;
            previousTouchY = e.touches[0].clientY;

            // Adjust Z scale (height)
            const scaleSpeed = 0.005;
            let newScale = currentlySelectedMesh.scale.z - (dy * scaleSpeed);
            newScale = Math.max(0.01, newScale); // Prevent negative scale
            currentlySelectedMesh.scale.z = newScale;

          } else if (activeTouchMode === 'pan-rotate' && e.touches.length >= 2) {
            const dx = e.touches[1].clientX - e.touches[0].clientX;
            const dy = e.touches[1].clientY - e.touches[0].clientY;
            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const angle = Math.atan2(dy, dx);

            // Rotation
            const deltaAngle = angle - previousTouchAngle;
            currentlySelectedMesh.rotation.z += deltaAngle; // Extruded in Z, so rotate around Z in local space

            // Pan (Translation)
            const deltaCX = cx - previousTouchCentroid.x;
            const deltaCY = cy - previousTouchCentroid.y;

            // Convert screen delta to world/local space movement (approximate)
            const panSpeed = 0.002;
            currentlySelectedMesh.position.x += deltaCX * panSpeed;
            currentlySelectedMesh.position.y -= deltaCY * panSpeed;

            previousTouchCentroid.set(cx, cy);
            previousTouchAngle = angle;
          }
        }, { passive: false });

        arCanvas.addEventListener('touchend', (e: TouchEvent) => {
          if (e.touches.length === 0) {
            activeTouchMode = 'none';
          } else if (e.touches.length === 1 && currentlySelectedMesh) {
            activeTouchMode = 'height';
            previousTouchY = e.touches[0].clientY;
          }
        }, { passive: false });
      }
    },

    onEvent: (event: any) => {
      if (event.name === 'reality.imagescanning') {
        const statusText = document.getElementById("qr-status");
        if (statusText) statusText.innerText = "Status: Searching for Image Target...";
      } else if (event.name === 'reality.projectloaded') {
        Logger.info("[XR8 EVENT] Image Target Project Loaded successfully.");
      }
    },

    listeners: [
      {
        event: 'reality.imagefound',
        process: ({ detail }: any) => {
          Logger.debug(`[DEBUG] Image Target Found: ${detail.name}`);
          const statusText = document.getElementById("qr-status");
          if (statusText) statusText.innerText = `Status: Found Target (${detail.name})!`;

          if (detail.name === 'qrcode') {
            if (arGroup && contentGroup) {
              currentImageTargetScale = detail.scale;
              arGroup.position.copy(detail.position);
              arGroup.quaternion.copy(detail.rotation);
              arGroup.scale.set(detail.scale, detail.scale, detail.scale);
              arGroup.visible = true;

              if (isSpeckleLoaded && speckleRoot && !contentGroup.children.includes(speckleRoot)) {
                speckleRoot.scale.set(1, 1, 1);
                speckleRoot.rotation.set(0, 0, 0);
                speckleRoot.position.set(0, 0, 0);
                contentGroup.add(speckleRoot);
                Logger.debug("[DEBUG] Speckle model attached to image target.");
              }
            }
          }
        }
      },
      {
        event: 'reality.imageupdated',
        process: ({ detail }: any) => {
          if (detail.name === 'qrcode' && arGroup) {
            currentImageTargetScale = detail.scale;
            arGroup.position.copy(detail.position);
            arGroup.quaternion.copy(detail.rotation);
            arGroup.scale.set(detail.scale, detail.scale, detail.scale);
          }
        }
      },
      {
        event: 'reality.imagelost',
        process: ({ detail }: any) => {
          Logger.debug(`[DEBUG] Image Target Lost: ${detail.name}`);
          const statusText = document.getElementById("qr-status");
          if (statusText) statusText.innerText = "Status: Target Lost (Anchored to SLAM)";
        }
      }
    ],
    onUpdate: () => {
      if ((window as any).captureRequested && arGroup) {
        Logger.debug("[DEBUG-CAPTURE] onUpdate: Capture requested, hiding AR objects to capture background.");
        (window as any)._arGroupWasVisible = arGroup.visible;
        arGroup.visible = false;
        (window as any)._doCaptureThisFrame = true;
        (window as any).captureRequested = false;
      }
    },
    onRender: () => {
      if ((window as any)._doCaptureThisFrame) {
        Logger.debug("[DEBUG-CAPTURE] onRender: AR objects hidden, reading clean canvas frame...");
        (window as any)._doCaptureThisFrame = false;

        const canvas = document.getElementById('arCanvas') as HTMLCanvasElement;
        const width = canvas.width;
        const height = canvas.height;
        Logger.debug(`[DEBUG-CAPTURE] Canvas dimensions: ${width}x${height}`);

        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext("2d");

        if (ctx) {
          ctx.drawImage(canvas, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          Logger.debug(`[DEBUG-CAPTURE] Captured clean image data, size: ${imageData.data.length} bytes.`);

          setTimeout(() => {
            Logger.debug("[DEBUG-CAPTURE] Triggering processImageData asynchronously...");
            processImageData(imageData, width, height);
          }, 10);
        } else {
          Logger.error("[DEBUG-CAPTURE] Failed to get 2d context for offscreen canvas.");
        }


        if (arGroup) {
          Logger.debug("[DEBUG-CAPTURE] Restoring AR objects visibility.");
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
  Logger.debug("[DEBUG-CV] Starting OpenCV contour detection...");
  // @ts-ignore
  if (typeof cv === 'undefined' || !cv.Mat) {
    Logger.error("[DEBUG-CV] OpenCV not loaded");
    const statusText = document.getElementById("qr-status");
    if (statusText) statusText.innerText = "Status: OpenCV still loading. Please wait a few seconds and try again.";
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
    Logger.error("[DEBUG-CV] OpenCV Exception:", msg);
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

    if (result && arGroup) {
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
    Logger.warn(`[DEBUG-EXTRUDE] Not enough points to build a polygon (${localPoints.length}). Skipping.`);
    return null;
  }
  Logger.debug(`[DEBUG-EXTRUDE] Building 3D Extrusion for ${colourName} with ${localPoints.length} vertices...`);

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

  // Center the geometry so its pivot is in the middle
  geometry.computeBoundingBox();
  const boundingBox = geometry.boundingBox!;
  const center = new THREE.Vector3();
  boundingBox.getCenter(center);

  // Translate geometry to origin (only X and Y, leave Z alone so it rests on floor)
  geometry.translate(-center.x, -center.y, 0);

  const mesh = new THREE.Mesh(geometry, material);

  // Offset the mesh position by the center so it visually appears in the same place
  mesh.position.set(center.x, center.y, 0);

  const computedDepth = colour[colourName as keyof ColourMap].height * globalScaleFactor;
  mesh.scale.z = computedDepth;
  mesh.userData.colorName = colourName;
  mesh.userData.isExtrudedVolume = true;
  mesh.userData.capturedGlobalScale = globalScaleFactor;
  mesh.userData.originalPosition = mesh.position.clone();
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.position.z += 0.001;

  Logger.debug(`[DEBUG-EXTRUDE] Successfully built ExtrudedMesh for ${colourName}.`);
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
            if (arGroup) {
              arGroup.add(mesh);
            }
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

    Logger.debug(logBuffer);
  }

  if (statusText) statusText.innerText = "Overlay complete!";
}

document.addEventListener("DOMContentLoaded", async () => {
  Logger.info("=== APP STARTING ===");
  Logger.info("Fetching dynamic settings...");

  let speckleUrl = "https://app.speckle.systems/projects/6293f7974f/models/3e77e04b05";
  try {
    const res = await fetch("/resource/specklelink.txt");
    if (res.ok) {
      speckleUrl = (await res.text()).trim();
      Logger.info(`Loaded Speckle URL: ${speckleUrl}`);
    }
  } catch (e) {
    Logger.error("Could not load specklelink.txt, using fallback.");
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
      Logger.info("Loaded qrcode-target.json successfully.");
    } else {
      Logger.warn("Failed to load qrcode-target.json (HTTP " + res.status + ")");
    }
  } catch (e) {
    Logger.error("Could not load qrcode-target.json", e);
  }

  Logger.info("Initialising Speckle...");
  const viewer = await initSpeckle(speckleUrl);
  if (viewer) {
    isSpeckleLoaded = true;
    // Extract the internal THREE.Scene from Speckle's renderer to use in our AR scene
    speckleRoot = viewer.getRenderer().scene as unknown as THREE.Group;
    Logger.info("Speckle model loaded and extracted.");
  } else {
    Logger.error("Failed to initialize Speckle viewer.");
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
        
        // Speckle Viewer's MeshStandardMaterial conversion
        const standardMaterial = new THREE.MeshStandardMaterial({
          color: color,
          roughness: originalMaterial && originalMaterial.roughness !== undefined ? originalMaterial.roughness : 0.5,
          metalness: originalMaterial && originalMaterial.metalness !== undefined ? originalMaterial.metalness : 0.1,
          transparent: originalMaterial && originalMaterial.transparent !== undefined ? originalMaterial.transparent : false,
          opacity: originalMaterial && originalMaterial.opacity !== undefined ? originalMaterial.opacity : 1.0,
          side: THREE.DoubleSide,
        });
        
        const newMesh = new THREE.Mesh(geometry, standardMaterial);
        newMesh.position.copy(mesh.position);
        newMesh.rotation.copy(mesh.rotation);
        newMesh.scale.copy(mesh.scale);
        newMesh.name = mesh.name;
        // Speckle Viewer often puts node ID or raw data inside userData
        newMesh.userData = mesh.userData || {};
        newMesh.castShadow = !standardMaterial.transparent;
        newMesh.receiveShadow = !standardMaterial.transparent;
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
    Logger.debug("[DEBUG] Fetching available cameras via enumerateDevices...");
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        Logger.error("[DEBUG] navigator.mediaDevices.enumerateDevices is NOT supported on this browser!");
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      Logger.debug(`[DEBUG] Found ${devices.length} total media devices.`);
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      Logger.debug(`[DEBUG] Found ${videoDevices.length} video input devices.`);

      const cameraSelect = document.getElementById("cameraSelect") as HTMLSelectElement;
      if (cameraSelect) {
        cameraSelect.innerHTML = "";
        videoDevices.forEach((d, i) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.text = d.label || `Camera ${i + 1}`;
          Logger.debug(`[DEBUG] Adding camera to dropdown: ${opt.text} [ID: ${opt.value.substring(0, 8)}...]`);
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
          Logger.debug(`[DEBUG] Dropdown changed. User selected camera: ${selectedCamera}`);
          if (selectedCamera !== currentDeviceId) {
            currentDeviceId = selectedCamera;
            if (XR8.XrController && XR8.XrController.updateCamera) {
              Logger.debug("[DEBUG] Updating XR8 camera dynamically via XrController...");
              XR8.XrController.updateCamera({ deviceId: selectedCamera });
            } else {
              Logger.debug("[DEBUG] updateCamera not available. Restarting XR8 engine...");
              XR8.stop();
              XR8.clearCameraPipelineModules();
              startXR();
            }
          }
        });
      }
    } catch (e) {
      Logger.error("[DEBUG] Critical error during enumerateDevices:", e);
    }
  }

  (window as any)._getCameras = getCameras;

  const startXR = () => {
    if (imageTargetData) {
      imageTargetData.name = "qrcode";
      Logger.info("Configuring XR8 with imageTargetData:", JSON.stringify(imageTargetData, null, 2));
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
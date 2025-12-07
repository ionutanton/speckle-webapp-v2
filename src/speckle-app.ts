// src/speckle-app.ts
import {
  Viewer,
  DefaultViewerParams,
  SpeckleLoader,
  UrlHelper,
  ObjLoader,
} from "@speckle/viewer";
import { CameraController, SelectionExtension } from "@speckle/viewer";
// @ts-ignore
import * as THREE from "three";

let viewer: Viewer | null = null;
let lastLoaded: ObjLoader | null = null;
// Pose smoothing buffer and live tweak controls
const poseBuffer: Array<{ t: number; pos: THREE.Vector3; quat: THREE.Quaternion }> = [];
let smoothingWindowMs = 5000; // default 5 seconds
let smoothingEnabled = true;
let rotationOffsets = new THREE.Euler(0, 0, 0, "XYZ");
let scaleMultiplier = 1;

// Starting Position (Might be overridden by AR)
let startingCameraPosition = new THREE.Vector3(
  -16.67, -343.71, 292.35
);
let startingCameraTarget = new THREE.Vector3(
  172.04, -88.10, 16.62
);

async function main() {
  const container = document.getElementById("speckle-model");

  const params = DefaultViewerParams;
  params.showStats = false;
  params.verbose = true;
  // Disable environment/skybox for transparent AR background
  // @ts-ignore
  params.environmentSrc = null;

  if (container) {
    viewer = new Viewer(container, params);

    // Initialize before loading objects?
    await viewer.init();

    // Disable environment in the scene if init() added one (Speckle sometimes defaults)
    // We want transparent background
    const renderer = viewer.getRenderer();
    if (renderer.scene) {
        renderer.scene.background = null; // Ensure transparent
    }
    // Also set clear alpha to 0 on the WebGLRenderer
    // @ts-ignore
    renderer.renderer.setClearColor(0x000000, 0);


    const cameraController = viewer.createExtension(CameraController);
    // Disable user controls for AR mode so the phone movement controls the camera
    cameraController.enabled = false;

    viewer.createExtension(SelectionExtension);

    const urls = await UrlHelper.getResourceUrls(
      "https://app.speckle.systems/projects/6293f7974f/models/3e77e04b05"
    );
    for (const url of urls) {
      const loader = new SpeckleLoader(viewer.getWorldTree(), url, "");
      await viewer.loadObject(loader, true); // .then(setView); // Don't set static view if AR is active?
    }

    // Initial view (optional)
    // setView();

    // Create live debug controls for pose tweaking and smoothing
    // createDebugPanel();

  } else {
    console.error("Container is null or undefined");
  }
}

async function setView() {
  if (!viewer) return;
  const cameraController = viewer.getExtension(CameraController);
  cameraController.setCameraView(
    { position: startingCameraPosition, target: startingCameraTarget },
    false
  );
}

// AR Camera Update Function
// Matrix is a 16-element array (4x4 matrix) from OpenCV -> Three conversion
function updateCamera(matrixArray: number[]) {
  if (!viewer) return;

  // Get the Speckle camera controller
  const cameraController = viewer.getExtension(CameraController);
  if (!cameraController) return;

    // We can set the matrix directly if we disable auto-update
    // But Speckle's CameraController might interfere.
    // We already disabled CameraController.

    const matrix = new THREE.Matrix4();
    matrix.fromArray(matrixArray);

    // In Three.js, camera.matrixWorld is usually updated from position/quaternion/scale.
    // If we want to set the extrinsic matrix (View Matrix Inverse), we set position and quaternion.

    // Decompose the matrix into Position, Quaternion, Scale
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    matrix.decompose(position, quaternion, scale);

    // Push sample into buffer with timestamp
    const now = Date.now();
    poseBuffer.push({ t: now, pos: position.clone(), quat: quaternion.clone() });
    // Remove old samples outside smoothing window
    while (poseBuffer.length && now - poseBuffer[0].t > smoothingWindowMs) {
      poseBuffer.shift();
    }

    // Compute smoothed pose (average position, averaged quaternion) if enabled
    let appliedPos = position.clone();
    let appliedQuat = quaternion.clone();
    if (smoothingEnabled && poseBuffer.length > 0) {
      // Average positions
      const avgPos = new THREE.Vector3(0, 0, 0);
      const avgQuat = new THREE.Quaternion(0, 0, 0, 0);
      for (const s of poseBuffer) {
        avgPos.add(s.pos);
        avgQuat.x += s.quat.x;
        avgQuat.y += s.quat.y;
        avgQuat.z += s.quat.z;
        avgQuat.w += s.quat.w;
      }
      avgPos.multiplyScalar(1 / poseBuffer.length);
      // Normalize summed quaternion to get an average-ish quaternion
      avgQuat.normalize();

      appliedPos.copy(avgPos);
      appliedQuat.copy(avgQuat);
    }

    // Apply rotation offsets (live tweak)
    const offsetQuat = new THREE.Quaternion().setFromEuler(rotationOffsets);
    appliedQuat.multiply(offsetQuat);

    // Apply scale multiplier to position (simple camera distance tweak)
    if (scaleMultiplier !== 1) {
      appliedPos.multiplyScalar(scaleMultiplier);
    }

    // Use Speckle CameraController to set the view
    // The controller's target is derived from position + forward direction
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyQuaternion(appliedQuat);
    const targetPos = appliedPos.clone().add(forward.multiplyScalar(100)); // 100 units forward
    
    cameraController.setCameraView(
      { position: appliedPos, target: targetPos },
      false // don't animate
    );

    // Note: intrinsics FOV adjustments are not easily applied via CameraController
    // (Speckle's viewer typically uses a fixed camera setup).
    // If needed, you could access the underlying Three camera via viewer.getRenderer().renderingCamera
    // but using CameraController is the recommended approach.

    viewer.requestRender();
}

async function overlayObj(objData: string, id: string, colour: number) {
  if (!viewer) return;

  if (lastLoaded) {
    // Unload the *previously* loaded object, not the new id
    // `lastLoaded` is an ObjLoader created earlier with its own id
    // Use its id to remove the previous object from the scene
    // @ts-ignore - ObjLoader exposes `id` at runtime
    viewer.unloadObject((lastLoaded as any).id);
  }

  const loader = new ObjLoader(viewer.getWorldTree(), id, objData);
  await viewer.loadObject(loader, false);

  const materialData: any = {
    id: id,
    color: new THREE.Color(colour),
    emissive: 0x0,
    opacity: 1,
    roughness: 1,
    metalness: 0,
    vertexColors: false,
  };

  const nodes = viewer.getWorldTree().findId(id);
  if (nodes) {
    const renderViews: any[] = [];
    for (let node of nodes) {
      node.all((_node: any) => {
        renderViews.push(
          ...viewer!.getWorldTree().getRenderTree().getRenderViewsForNode(_node)
        );
        return true;
      });
    }
    viewer.getRenderer().setMaterial(renderViews, materialData);
  }
  viewer.requestRender();
  lastLoaded = loader;
}

async function getSpeckleCameraPosition() {
  if (!viewer) return;
  const cameraController = viewer.getExtension(CameraController);
  console.log("Camera Position:", cameraController.controls.getPosition());
  console.log("Camera Target:", cameraController.controls.getTarget());
}

// ---------- Debug panel (live tweaking for smoothing / rotation / scale) ----------
function createDebugPanel() {
  try {
    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.right = "12px";
    panel.style.top = "12px";
    panel.style.zIndex = "9999";
    panel.style.background = "rgba(0,0,0,0.6)";
    panel.style.color = "#fff";
    panel.style.padding = "8px";
    panel.style.borderRadius = "6px";
    panel.style.fontSize = "12px";
    panel.style.maxWidth = "260px";

    panel.innerHTML = `
      <div style="font-weight:600;margin-bottom:6px">AR Debug</div>
      <label>Smoothing: <input type="checkbox" id="dbg-smooth" checked></label>
      <label>Window (s): <input id="dbg-window" type="range" min="1" max="10" value="5"></label>
      <div id="dbg-window-val">5s</div>
      <label>Rot X: <input id="dbg-rotx" type="range" min="-180" max="180" value="0"></label>
      <label>Rot Y: <input id="dbg-roty" type="range" min="-180" max="180" value="0"></label>
      <label>Rot Z: <input id="dbg-rotz" type="range" min="-180" max="180" value="0"></label>
      <label>Scale: <input id="dbg-scale" type="range" min="0.1" max="3" step="0.05" value="1"></label>
      <div id="dbg-buffer">Buffer: 0</div>
    `;

    document.body.appendChild(panel);

    const smoothEl = panel.querySelector<HTMLInputElement>("#dbg-smooth")!;
    const windowEl = panel.querySelector<HTMLInputElement>("#dbg-window")!;
    const windowVal = panel.querySelector<HTMLDivElement>("#dbg-window-val")!;
    const rotX = panel.querySelector<HTMLInputElement>("#dbg-rotx")!;
    const rotY = panel.querySelector<HTMLInputElement>("#dbg-roty")!;
    const rotZ = panel.querySelector<HTMLInputElement>("#dbg-rotz")!;
    const scaleEl = panel.querySelector<HTMLInputElement>("#dbg-scale")!;
    const bufferEl = panel.querySelector<HTMLDivElement>("#dbg-buffer")!;

    smoothEl.addEventListener("change", () => {
      smoothingEnabled = smoothEl.checked;
    });
    windowEl.addEventListener("input", () => {
      smoothingWindowMs = Number(windowEl.value) * 1000;
      windowVal.innerText = `${windowEl.value}s`;
    });
    const updateRot = () => {
      rotationOffsets.x = (Number(rotX.value) * Math.PI) / 180;
      rotationOffsets.y = (Number(rotY.value) * Math.PI) / 180;
      rotationOffsets.z = (Number(rotZ.value) * Math.PI) / 180;
    };
    rotX.addEventListener("input", updateRot);
    rotY.addEventListener("input", updateRot);
    rotZ.addEventListener("input", updateRot);

    scaleEl.addEventListener("input", () => {
      scaleMultiplier = Number(scaleEl.value);
    });

    // Update buffer display periodically
    setInterval(() => {
      bufferEl.innerText = `Buffer: ${poseBuffer.length}`;
    }, 250);
  } catch (e) {
    console.warn("Could not create debug panel:", e);
  }
}

async function getObjectsByLayer(viewer: Viewer, layerName: string) {
  const worldTree = viewer.getWorldTree();
    const allObjects = worldTree.findAll(() => true);
  return allObjects.filter((obj: any) => obj.raw.layer === layerName);
}

export { overlayObj, getSpeckleCameraPosition, getObjectsByLayer, updateCamera, setView };

main();

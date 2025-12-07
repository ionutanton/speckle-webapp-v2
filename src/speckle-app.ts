// src/speckle-app.ts
import {
  Viewer,
  DefaultViewerParams,
  SpeckleLoader,
  UrlHelper,
  ObjLoader,
  ObjectLayers,
  SpeckleBasicMaterial,
  InlineView,
} from "@speckle/viewer";
import { CameraController, SelectionExtension } from "@speckle/viewer";
import * as THREE from "three";

let viewer: Viewer | null = null;
let lastLoaded: ObjLoader | null = null;

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
      "https://app.speckle.systems/projects/fc0a02354d/models/136b5b7fe2"
    );
    for (const url of urls) {
      const loader = new SpeckleLoader(viewer.getWorldTree(), url, "");
      await viewer.loadObject(loader, true); // .then(setView); // Don't set static view if AR is active?
    }

    // Initial view (optional)
    // setView();

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

    const camera = viewer.getRenderer().renderingCamera as THREE.PerspectiveCamera;
    if (!camera) return;

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

    camera.position.copy(position);
    camera.quaternion.copy(quaternion);

    // Also, we might need to update projection matrix if we have intrinsic parameters
    // For now, we rely on default FOV.
    // Ideally we should match the video FOV.

    camera.updateMatrixWorld(true);

    viewer.requestRender();
}

async function overlayObj(objData: string, id: string, colour: number) {
  if (!viewer) return;

  if (lastLoaded) {
    viewer.unloadObject(id);
  }

  const loader = new ObjLoader(viewer.getWorldTree(), id, objData);
  await viewer.loadObject(loader, false);

  const materialData = {
    id: id,
    color: colour,
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
  const cameraContoller = viewer.getExtension(CameraController);
  console.log("Camera Position:", cameraContoller.controls.getPosition());
  console.log("Camera Target:", cameraContoller.controls.getTarget());
}

async function getObjectsByLayer(viewer: Viewer, layerName: string) {
  const worldTree = viewer.getWorldTree();
  const allObjects = worldTree.findAll();
  return allObjects.filter((obj: any) => obj.raw.layer === layerName);
}

export { overlayObj, getSpeckleCameraPosition, getObjectsByLayer, updateCamera };

main();

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

let startingCameraPosition = new THREE.Vector3(
  134.48088760188392,
  -254.40139918849698,
  134.81577284127053
);
let startingCameraTarget = new THREE.Vector3(
  178.92204300024903,
  -127.47506558174267,
  -12.558477598551374
);

async function main() {
  /** Get the HTML container */
  const container = document.getElementById("speckle-model");

  /** Configure the viewer params */
  const params = DefaultViewerParams;
  params.showStats = false;
  params.verbose = true;

  /** Create Viewer instance */
  if (container) {
    viewer = new Viewer(container, params);

    /** Add the stock camera controller extension */
    const cameraController = viewer.createExtension(CameraController);
    /** Add the selection extension for extra interactivity */
    viewer.createExtension(SelectionExtension);

    /** Create a loader for the speckle stream */
    const urls = await UrlHelper.getResourceUrls(
      "https://app.speckle.systems/projects/6293f7974f/models/3e77e04b05"
    );
    for (const url of urls) {
      const loader = new SpeckleLoader(viewer.getWorldTree(), url, "");
      /** Load the speckle data */
      await viewer.loadObject(loader, true).then(setView);
    }

    /** Initialise the viewer */
    await viewer.init();
  } else {
    console.error("Container is null or undefined");
  }
}

async function setView() {
  if (!viewer) {
    console.error("Viewer is not initialized");
    return;
  }
  const cameraController = viewer.createExtension(CameraController);
  cameraController.setCameraView(
    { position: startingCameraPosition, target: startingCameraTarget },
    false
  );
  // viewer.requestRender();
  console.log("Camera view set");
}

async function overlayObj(objData: string, id: string, colour: number) {
  if (!viewer) {
    console.error("Viewer is not initialized");
    return;
  }

  if (lastLoaded) {
    viewer.unloadObject(id);
    console.log("Disposed last loaded object");
  }

  /** Create a loader for the .obj data */
  const loader = new ObjLoader(viewer.getWorldTree(), id, objData);

  /** Load the obj data */
  await viewer.loadObject(loader, false);

  // Create the material data */
  const materialData = {
    id: id,
    color: colour,
    emissive: 0x0,
    opacity: 1,
    roughness: 1,
    metalness: 0,
    vertexColors: false,
  };

   /** Get all render views manually */
  const nodes = viewer.getWorldTree().findId(id);
  if (nodes) {
    const renderViews: Array<NodeRenderView> = [];
    for (let node of nodes) {
      node.all((_node: TreeNode) => {
        renderViews.push(
          ...viewer.getWorldTree().getRenderTree().getRenderViewsForNode(_node)
        );
        return true;
      });
    }
    viewer.getRenderer().setMaterial(renderViews, materialData);
  }

  // Refresh the viewer
  viewer.requestRender();

  lastLoaded = loader;
  console.log("OBJ file loaded successfully");
}

async function getSpeckleCameraPosition() {
  if (!viewer) {
    console.error("Viewer is not initialized");
    return;
  }

  const cameraContoller = viewer.getExtension(CameraController);
  console.log("Camera Position:", cameraContoller.controls.getPosition());
  console.log("Camera Target:", cameraContoller.controls.getTarget());
}

async function getObjectsByLayer(viewer: Viewer, layerName: string) {
  const worldTree = viewer.getWorldTree(); // Get hierarchical object tree
  const allObjects = worldTree.findAll(); // Flatten hierarchy to an array

  // Filter objects that belong to the specified layer
  const objectsInLayer = allObjects.filter(obj => obj.raw.layer === layerName);

  return objectsInLayer;
}

export { overlayObj, getSpeckleCameraPosition, getObjectsByLayer };

main();

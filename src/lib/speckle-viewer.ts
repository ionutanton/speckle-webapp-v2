// src/lib/speckle-viewer.ts
import {
  Viewer,
  DefaultViewerParams,
  SpeckleLoader,
  UrlHelper,
  ObjLoader,
  ObjectLayers,
  SpeckleBasicMaterial,
  InlineView,
  NodeRenderView,
  TreeNode,
  ViewerParams,
} from "@speckle/viewer";
import { CameraController, SelectionExtension } from "@speckle/viewer";
import * as THREE from "three";

export class SpeckleViewer {
  private viewer: Viewer;
  private lastLoaded: ObjLoader | null = null;
  private startingCameraPosition = new THREE.Vector3(
    134.48088760188392,
    -254.40139918849698,
    134.81577284127053
  );
  private startingCameraTarget = new THREE.Vector3(
    178.92204300024903,
    -127.47506558174267,
    -12.558477598551374
  );

  constructor(container: HTMLElement, params: Partial<ViewerParams> = DefaultViewerParams) {
    params.showStats = false;
    params.verbose = true;
    this.viewer = new Viewer(container, params);
    this.viewer.createExtension(CameraController);
    this.viewer.createExtension(SelectionExtension);
  }

  public async init(streamUrl: string) {
    const urls = await UrlHelper.getResourceUrls(streamUrl);
    for (const url of urls) {
      const loader = new SpeckleLoader(this.viewer.getWorldTree(), url, "");
      await this.viewer.loadObject(loader, true);
    }
    await this.viewer.init();
    this.setView();
  }

  private setView() {
    const cameraController = this.viewer.getExtension(CameraController);
    if (cameraController) {
      cameraController.setCameraView(
        {
          position: this.startingCameraPosition,
          target: this.startingCameraTarget,
        },
        false
      );
      console.log("Camera view set");
    } else {
      console.error("CameraController not found");
    }
  }

  public async overlayObj(objData: string, id: string, colour: number) {
    if (this.lastLoaded) {
      this.viewer.unloadObject(id);
      console.log("Disposed last loaded object");
    }

    const loader = new ObjLoader(this.viewer.getWorldTree(), id, objData);
    await this.viewer.loadObject(loader, false);

    const materialData = {
      id: id,
      color: colour,
      emissive: 0x0,
      opacity: 1,
      roughness: 1,
      metalness: 0,
      vertexColors: false,
      lineWeight: 1,
    };

    const nodes = this.viewer.getWorldTree().findId(id);
    if (nodes) {
      const renderViews: Array<NodeRenderView> = [];
      for (let node of nodes) {
        node.all((_node: TreeNode) => {
          renderViews.push(
            ...this.viewer.getWorldTree().getRenderTree().getRenderViewsForNode(_node)
          );
          return true;
        });
      }
      this.viewer.getRenderer().setMaterial(renderViews, materialData);
    }

    this.viewer.requestRender();
    this.lastLoaded = loader;
    console.log("OBJ file loaded successfully");
  }

  public getSpeckleCameraPosition() {
    const cameraContoller = this.viewer.getExtension(CameraController);
    if (cameraContoller) {
      console.log("Camera Position:", cameraContoller.controls.getPosition());
      console.log("Camera Target:", cameraContoller.controls.getTarget());
    } else {
      console.error("CameraController not found");
    }
  }

  public getObjectsByLayer(layerName: string) {
    const worldTree = this.viewer.getWorldTree();
    const allObjects = worldTree.findAll(() => true);
    return allObjects.filter(obj => obj.raw.layer === layerName);
  }
}

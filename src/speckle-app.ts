// src/speckle-app.ts
import {
  Viewer,
  DefaultViewerParams,
  SpeckleLoader,
  UrlHelper,
} from "@speckle/viewer";
import { CameraController, SelectionExtension } from "@speckle/viewer";

let viewer: Viewer | null = null;

async function initSpeckle(speckleUrl: string): Promise<Viewer | null> {
  /** Get the HTML container */
  const container = document.getElementById("speckle-model");

  /** Configure the viewer params */
  const params = DefaultViewerParams;
  params.showStats = false;
  params.verbose = true;

  /** Create Viewer instance */
  if (container) {
    viewer = new Viewer(container, params);

    // Speckle requires these extensions internally to initialize without crashing
    viewer.createExtension(CameraController);
    viewer.createExtension(SelectionExtension);

    /** Create a loader for the speckle stream */
    const urls = await UrlHelper.getResourceUrls(speckleUrl);
    for (const url of urls) {
      const loader = new SpeckleLoader(viewer.getWorldTree(), url, "");
      /** Load the speckle data */
      await viewer.loadObject(loader, true);
    }

    /** Initialise the viewer */
    await viewer.init();
    return viewer;
  } else {
    console.error("Container is null or undefined");
    return null;
  }
}

// Unused functions removed for cleanup

export { initSpeckle };

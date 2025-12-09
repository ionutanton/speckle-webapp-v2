using UnityEngine;
using UnityEditor;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using Speckle.ConnectorUnity;
using Unity.XR.CoreUtils; // Needed for XROrigin in newer versions
using System.IO;

public class SceneBuilder : EditorWindow
{
    [MenuItem("Speckle/Setup MR Scene")]
    public static void SetupMRScene()
    {
        // 1. Create XR Origin (AR)
        GameObject xrOriginGO = GameObject.Find("XR Origin (AR)");
        if (xrOriginGO == null)
        {
            xrOriginGO = new GameObject("XR Origin (AR)");
            // In a real editor, we'd use the ContextMenu or ARFoundation menu commands.
            // Since we are scripting, we add components manually.
            var xrOrigin = xrOriginGO.AddComponent<XROrigin>();
            var cameraOffset = new GameObject("Camera Offset");
            cameraOffset.transform.SetParent(xrOriginGO.transform);

            var mainCam = Camera.main ? Camera.main.gameObject : new GameObject("Main Camera");
            mainCam.tag = "MainCamera";
            mainCam.transform.SetParent(cameraOffset.transform);

            var camComp = mainCam.GetComponent<Camera>();
            if(camComp == null) camComp = mainCam.AddComponent<Camera>();

            xrOrigin.Camera = camComp;
            xrOrigin.CameraFloorOffsetObject = cameraOffset;

            // Add AR Session Origin (legacy compat) or simple components
            // Add AR Camera Manager, AR Background Renderer to Camera
            if(!mainCam.GetComponent<UnityEngine.XR.ARFoundation.ARCameraManager>())
                mainCam.AddComponent<UnityEngine.XR.ARFoundation.ARCameraManager>();

            if(!mainCam.GetComponent<UnityEngine.XR.ARFoundation.ARCameraBackground>())
                mainCam.AddComponent<UnityEngine.XR.ARFoundation.ARCameraBackground>();
        }

        // 2. Create AR Session
        GameObject arSessionGO = GameObject.Find("AR Session");
        if (arSessionGO == null)
        {
            arSessionGO = new GameObject("AR Session");
            arSessionGO.AddComponent<ARSession>();
            arSessionGO.AddComponent<ARInputManager>();
        }

        // 3. Create Speckle Receiver
        GameObject speckleGO = GameObject.Find("Speckle Receiver");
        if (speckleGO == null)
        {
            speckleGO = new GameObject("Speckle Receiver");
            var receiver = speckleGO.AddComponent<Receiver>();

            // We can't easily set the StreamWrapper via script without the Speckle DLLs loaded in this context,
            // but we can add our controller.
            var controller = speckleGO.AddComponent<SpeckleController>();
            controller.receiver = receiver;

            // Hide it initially until found
            speckleGO.SetActive(false);
        }

        // 4. Setup Image Tracking
        // We need an XRReferenceImageLibrary. Creating one via script is complex because it involves
        // adding textures. We will add the component but warn the user to assign the library.
        var trackedImageManager = xrOriginGO.GetComponent<ARTrackedImageManager>();
        if (trackedImageManager == null)
        {
            trackedImageManager = xrOriginGO.AddComponent<ARTrackedImageManager>();
        }

        var imageController = xrOriginGO.GetComponent<ARTrackedImageController>();
        if (imageController == null)
        {
            imageController = xrOriginGO.AddComponent<ARTrackedImageController>();
        }

        // Link Speckle Object
        imageController.speckleRoot = GameObject.Find("Speckle Receiver");

        Debug.Log("Scene Setup Complete! \nIMPORTANT: You must manually create a 'ReferenceImageLibrary', add 'interactive_urbanism.png' to it, and assign it to the 'AR Tracked Image Manager' on the 'XR Origin' object.");
    }
}

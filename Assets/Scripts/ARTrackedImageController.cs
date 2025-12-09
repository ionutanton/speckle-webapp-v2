using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
using System.Collections.Generic;

[RequireComponent(typeof(ARTrackedImageManager))]
public class ARTrackedImageController : MonoBehaviour
{
    [Tooltip("The root object of the Speckle Model to show/hide.")]
    public GameObject speckleRoot;

    private ARTrackedImageManager m_TrackedImageManager;

    private void Awake()
    {
        m_TrackedImageManager = GetComponent<ARTrackedImageManager>();
    }

    private void OnEnable()
    {
        m_TrackedImageManager.trackedImagesChanged += OnTrackedImagesChanged;
    }

    private void OnDisable()
    {
        m_TrackedImageManager.trackedImagesChanged -= OnTrackedImagesChanged;
    }

    private void OnTrackedImagesChanged(ARTrackedImagesChangedEventArgs eventArgs)
    {
        foreach (var trackedImage in eventArgs.added)
        {
            UpdateImage(trackedImage);
        }

        foreach (var trackedImage in eventArgs.updated)
        {
            UpdateImage(trackedImage);
        }

        foreach (var trackedImage in eventArgs.removed)
        {
            // Optional: Hide if lost?
            // speckleRoot.SetActive(false);
        }
    }

    private void UpdateImage(ARTrackedImage trackedImage)
    {
        // If we detect our image
        if (trackedImage.trackingState == TrackingState.Tracking)
        {
            if (speckleRoot != null)
            {
                // Ensure it's active
                speckleRoot.SetActive(true);

                // Snap the speckle model to the image position
                // You might want an offset or rotation adjustment here
                speckleRoot.transform.position = trackedImage.transform.position;
                speckleRoot.transform.rotation = trackedImage.transform.rotation;
            }
        }
        else
        {
            // Optionally hide it if tracking is poor
            // speckleRoot.SetActive(false);
        }
    }
}

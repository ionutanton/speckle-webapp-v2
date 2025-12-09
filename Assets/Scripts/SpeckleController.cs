using UnityEngine;
using Speckle.ConnectorUnity;
using System.Collections;

public class SpeckleController : MonoBehaviour
{
    [Tooltip("The URL of the Speckle Model to load.")]
    public string modelUrl = "https://app.speckle.systems/projects/6293f7974f/models/3e77e04b05";

    [Tooltip("Reference to the Speckle Receiver.")]
    public Receiver receiver;

    private void Start()
    {
        if (receiver == null)
        {
            receiver = GetComponent<Receiver>();
        }

        if (receiver == null)
        {
            Debug.LogError("Speckle Receiver component not found!");
            return;
        }

        // Configure the receiver with the hardcoded URL
        // Note: The Receiver component in the Inspector usually handles the Stream/Branch selection.
        // But we can programmatically init it if needed.
        // For simplicity in this scaffold, we assume the Receiver is set up by the Editor script
        // or we auto-receive on start if configured.

        // However, the standard Speckle Receiver workflow often requires initialization in Editor or via UI.
        // Let's force an init if possible.

        Debug.Log($"Initializing Speckle Receiver for {modelUrl}...");
        // Speckle's Receiver usually needs the stream ID and branch/commit ID set.
        // We will rely on the Editor Setup script to pre-configure the Receiver component's serialized fields
        // if possible, or we trigger it here.

        // Since we can't easily access the Receiver's internal StreamWrapper without Speckle loaded in this env,
        // we will leave the hard logic to the Receiver component itself,
        // assuming the user or our setup script populates the fields.

        // But to be helpful, let's try to auto-trigger receive on Start:
        receiver.Receive();
    }
}

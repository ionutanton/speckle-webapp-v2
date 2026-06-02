# Speckle Interactive Urbanism (WebAR)

This project builds upon the *MassOnSpeed* concept from the Speckle hackathon ([GitHub](https://github.com/AlpachinoOA/MassOnSpeed)) and evolves it into a full **WebAR (Augmented Reality)** experience using 8th Wall, Speckle, Three.js, and OpenCV.

## Overview
This application serves as an interactive AR viewer that seamlessly overlays architectural massing models from a **Speckle** 3D stream directly into your real-world physical space.

The app uses a hybrid tracking approach: **8th Wall Image Tracking** combined with **SLAM (Simultaneous Localization and Mapping)**. By pointing your camera at the printed `qrcode.png` (located in the `./resource` folder), the engine instantly recognizes the image target and locks the Speckle 3D model exactly onto its position. Once the target is acquired, 8th Wall's robust SLAM engine takes over, allowing you to walk freely around the model with stable 6-DoF tracking even if the QR code leaves the camera's view.
Qr code is also the link to the nginx free tier web server that hosts the website. which means that if you print the qr code and place it on a surface, and then open the website, the speckle model will be visible in ar. (when you first open the app it might ask for camera permission, you should allow it).
Top left corner of the QR code is 0,0,0 for the speckle model. Speckle model is scaled by 0.01. 

## Real-Time Computer Vision
The app uses **OpenCV.js** directly on your mobile device to perform real-time shape and color detection through your phone's camera. 
You can use physical colored pieces of paper (or drawings on a physical whiteboard) placed around the QR code target. When you press **Capture & Overlay**:
1. The app takes a snapshot of your physical environment.
2. OpenCV detects the boundaries and contours of the colored regions (Red, Green, Blue).
3. The app dynamically generates 3D meshes (extrusions) from those physical shapes.
4. These newly generated meshes are instantly injected into the AR scene alongside the existing Speckle model.

## Features
- **Hybrid AR Tracking**: Uses Image Tracking to perfectly lock the 3D Speckle models onto the `qrcode.png` reference image, and then utilizes SLAM tracking to allow you to walk freely around the model without losing the physical anchor.
- **Dynamic 3D Extrusion**: Transform physical colored paper into interactive 3D massing blocks in real-time.
- **Speckle Cinematic Aesthetics**: Replicates the official Speckle Viewer's `ACESFilmicToneMapping` and `VSMShadowMap` for beautiful, soft shadows and realistic lighting.
- **Real-World Solar Lighting**: The app calculates precise astronomical solar positioning (Azimuth and Elevation) based on the time of day and year, casting accurate shadows across the Speckle model and captured volumes.
- **Live Settings UI**: Adjust the extrusion height of the Red, Green, and Blue meshes on the fly via live sliders. You can also dynamically change the **Time of Day** and **Month of Year** to manipulate the sun's position.
- **Remote PC Logging**: Custom network logging intercepts your mobile device's console and streams it directly to your PC for seamless debugging.

## Interactive Gestures
You can manipulate the generated 3D meshes (captured from colored paper) directly on your phone screen:
- **Single Tap**: Select a captured mesh. It will highlight with a white contour and darken slightly. Tapping empty space deselects it.
- **One-Finger Vertical Drag**: When a mesh is selected, drag up or down with one finger to dynamically extrude or shrink its height in real-time.
- **Two-Finger Pan & Rotate**: When a mesh is selected, use two fingers to translate (move) or rotate the mesh around its center on the ground plane.
- **Double Tap**: Resets the AR scene, clears all captured meshes, and recenters the 8th Wall SLAM tracking.

## Lighting & Shadow Controls
1. Tap the **⚙ Settings** button to open the settings overlay.
2. Under the **Time of Day (Hour)** slider, drag to change the time from 00:00 (Midnight) to 24:00. Watch the shadows lengthen and shorten!
3. Under the **Month of Year** slider, drag to change the season (Jan - Dec). The solar declination will shift, accurately modifying the sun's angle.
4. The system defaults to the Spring Equinox (March) at 12:00 PM at an assumed latitude of 45°N.

## Setup & Image Target Configuration
To use the `qrcode.png` as an 8th Wall Image Target, it must be compiled into 8th Wall's proprietary tracking format. 
We've included a local batch script that automates this using the official `@8thwall/image-target-cli`:
1. Double-click `generate_target.bat` in the root folder.
2. The script will automatically parse `resource\qrcode.png` and output the compiled tracking data to `public\targets\qrcode.json`.
3. The app will automatically load this local JSON file to recognize the image marker.

## License
MIT
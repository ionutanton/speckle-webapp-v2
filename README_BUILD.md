# Speckle WebAR Application

This project is an interactive WebAR application that integrates **8th Wall** for SLAM-based augmented reality, **Speckle** for 3D model loading, and **OpenCV** for real-time computer vision and 2D contour extrusion.

## Prerequisites
- **Node.js** (v18+ recommended)
- **npm** (comes with Node.js)

## Setup
First, install the project dependencies:
```powershell
npm install
```

## Running the Application (Development)
The project uses **Vite** as its build tool and development server. It also includes a custom Express middleware configured inside `vite.config.js` to capture logs from your mobile device and save them to your PC.

To start the development server, run:
```powershell
npm run dev
```
Alternatively, you can run the provided batch script: `start_dev.bat`

Once running, Vite will provide a local and a network URL. To test the AR capabilities on your mobile device, you must expose the local server via a secure HTTPS tunnel (e.g., using **ngrok**).

## Custom Logging
When running the app on a mobile device, viewing the browser console is difficult. To solve this, the app automatically intercepts `console.log`, `console.warn`, and `console.error` on the phone, batches them, and posts them to the Vite server via a `/log` endpoint. 

These logs are written in real-time to a file called `client-debug.log` in the root of the project. You can monitor this file on your PC to trace the application state (e.g., OpenCV processing steps, raycasting results).

## Building for Production
To compile the TypeScript and bundle the application into static assets for production deployment, run:
```powershell
npm run build
```
Alternatively, run the provided batch script: `start_build.bat`

The output will be placed in the `dist/` folder, which can then be deployed to any static hosting provider.

## Key Technologies
- **Vite:** High-performance local development server and build bundler.
- **8th Wall:** Commercial WebAR engine providing markerless tracking (SLAM) and Image Targets.
- **Three.js:** Renders the 3D scene, handles raycasting, and builds extruded meshes.
- **Speckle (Viewer API):** Loads architectural 3D models into the scene.
- **OpenCV.js:** Processes camera frames using Canny edge detection and contour mapping to discover flat geometries to extrude.
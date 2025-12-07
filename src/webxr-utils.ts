
// Helper types for WebXR features not yet fully typed in standard libs
export type XRImageTrackingScore = "untrackable" | "trackable";

export interface XRTrackedImageInit {
  image: ImageBitmap;
  widthInMeters: number;
}

// Basic utilities for WebXR Camera Access and Texture conversion
// Based on WebXR Raw Camera Access API

export class WebXRCameraManager {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  session: XRSession;
  glBinding: XRWebGLBinding | null = null;
  readFramebuffer: WebGLFramebuffer | null = null;

  constructor(session: XRSession, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.session = session;
    this.gl = gl;
    // @ts-ignore - XRWebGLBinding might not be in all TS definitions
    if (window.XRWebGLBinding) {
      // @ts-ignore
      this.glBinding = new XRWebGLBinding(session, gl);
    }
  }

  // Gets the camera texture for the current view
  getCameraTexture(view: XRView): WebGLTexture | null {
    if (!this.glBinding) return null;
    // @ts-ignore
    return this.glBinding.getCameraImage(view.camera);
  }

  // Reads pixels from the camera texture into a Uint8Array (RGBA)
  // Note: This involves a synchronous GPU-CPU sync and is slow.
  // Use sparingly or with smaller viewports.
  readPixelsFromTexture(texture: WebGLTexture, width: number, height: number): Uint8Array | null {
    const gl = this.gl;

    if (!this.readFramebuffer) {
      this.readFramebuffer = gl.createFramebuffer();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.warn("Framebuffer not complete");
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }

    const data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return data;
  }
}

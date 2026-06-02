const isProd = import.meta.env.PROD;

export const Logger = {
  /**
   * Always prints. Use for major app phases (e.g. init app, load AR, load model).
   */
  info: (...args: any[]) => {
    console.info("[INFO]", ...args);
  },
  
  /**
   * Only prints in Development. Use for deep, noisy debugging (e.g. OpenCV loops, raycasts).
   * Stripped out during production build minification.
   */
  debug: (...args: any[]) => {
    if (!isProd) {
      console.log("[DEBUG]", ...args);
    }
  },
  
  /**
   * Always prints. Use for errors and warnings.
   */
  error: (...args: any[]) => {
    console.error("[ERROR]", ...args);
  },
  
  warn: (...args: any[]) => {
    console.warn("[WARN]", ...args);
  }
};

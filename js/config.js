/**
 * Custom WebAR Configuration & Model Catalogue
 * Provides configuration constants, default models, camera settings, and tracking tuning.
 */

export const AR_CONFIG = {
  // Physical marker size in arbitrary 3D units (equivalent to ~10cm)
  markerSize: 1.0,

  // Camera field of view assumption (degrees) for pose estimation
  cameraFov: 50.0,

  // Pose filter tuning (One-Euro Filter parameters)
  filter: {
    minCutoff: 1.0,    // Lower values = smoother stationary pose (less jitter)
    beta: 0.05,        // Higher values = faster response during fast motion (less lag)
    dCutoff: 1.0       // Derivative cutoff
  },

  // Tracking state decay timeout (ms) before marking as lost
  trackingLostTimeoutMs: 600,

  // Default AR transformation offsets
  defaults: {
    scale: 1.0,
    height: 0.15,      // Height above QR code plane (Y-offset)
    offsetX: 0.0,
    offsetZ: 0.0,
    rotationX: 0.0,
    rotationY: 0.0,
    rotationZ: 0.0,
    autoRotate: false,
    autoRotateSpeed: 0.015
  },

  // Pre-configured built-in 3D models catalogue
  models: {
    helicopter: {
      name: "Tactical Helicopter",
      category: "Aviation",
      file: "models/helicopter.glb",
      scale: 0.75,
      height: 0.12,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Twin-rotor military transport helicopter with animated rotors and realistic PBR shading."
    },
    drone: {
      name: "Quadcopter Drone",
      category: "Robotics",
      file: "models/drone.glb",
      scale: 0.85,
      height: 0.18,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "High-tech surveillance drone equipped with navigation LEDs and dual-blade propellers."
    },
    robot: {
      name: "Cyber Sentinel Robot",
      category: "Sci-Fi",
      file: "models/robot.glb",
      scale: 0.65,
      height: 0.05,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: 0,
      autoRotate: false,
      description: "Futuristic humanoid android featuring metallic armor and glowing neon visor."
    },
    car: {
      name: "Hyper Cybercar",
      category: "Vehicles",
      file: "models/car.glb",
      scale: 0.70,
      height: 0.08,
      offsetX: 0.0,
      offsetZ: 0.0,
      rotationY: -Math.PI / 4,
      autoRotate: false,
      description: "Aerodynamic concept electric supercar with detailed wheel rims and aerodynamic diffuser."
    }
  },

  // Color theme
  theme: {
    primary: "#38bdf8",
    accent: "#818cf8",
    success: "#34d399",
    warning: "#fbbf24",
    danger: "#f87171",
    bgDark: "#0b0f19"
  }
};

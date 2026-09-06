/**
 * WebAR 3D Experience Controller
 * Mobile camera pipeline, 6DOF marker pose updates, Three.js 3D GLB rendering,
 * spatial anchoring, HUD tracking notifications, and interactive controls.
 */

import * as THREE from 'three';
import { AR_CONFIG } from './config.js';
import { ARTracker } from './tracker.js';
import { ModelLoader } from './model-loader.js';
import { getModelBlobUrl } from './procedural-models.js';

export class ArExperience {
  constructor() {
    this.modelId = 'helicopter';
    this.modelLoader = new ModelLoader();
    this.model = null;
    this.markerGroup = new THREE.Group();
    this.clock = new THREE.Clock();

    // Configuration parsed from URL or defaults
    this.config = {
      scale: AR_CONFIG.defaults.scale,
      height: AR_CONFIG.defaults.height,
      offsetX: AR_CONFIG.defaults.offsetX,
      offsetZ: AR_CONFIG.defaults.offsetZ,
      rotationY: AR_CONFIG.defaults.rotationY,
      autoRotate: AR_CONFIG.defaults.autoRotate,
      autoRotateSpeed: AR_CONFIG.defaults.autoRotateSpeed
    };

    // Tracking state
    this.isTrackingActive = false;
    this.lastFrameTime = performance.now();

    // Initialize UI & Components
    this.parseUrlParams();
    this.initElements();
    this.initThree();
    this.initTracker();
    this.initCamera();
    this.load3dModel();
    this.bindControls();
  }

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('id')) this.modelId = params.get('id');
    if (params.has('modelUrl')) this.customModelUrl = params.get('modelUrl');

    const preset = AR_CONFIG.models[this.modelId] || AR_CONFIG.models.helicopter;
    if (preset) {
      this.config.scale = preset.scale;
      this.config.height = preset.height;
      this.config.offsetX = preset.offsetX || 0;
      this.config.offsetZ = preset.offsetZ || 0;
      this.config.rotationY = preset.rotationY || 0;
      this.config.autoRotate = preset.autoRotate || false;
    }

    if (params.has('scale')) this.config.scale = parseFloat(params.get('scale'));
    if (params.has('height')) this.config.height = parseFloat(params.get('height'));
    if (params.has('ox')) this.config.offsetX = parseFloat(params.get('ox'));
    if (params.has('oz')) this.config.offsetZ = parseFloat(params.get('oz'));
    if (params.has('rot')) this.config.rotationY = (parseFloat(params.get('rot')) * Math.PI) / 180.0;
    if (params.has('ar')) this.config.autoRotate = params.get('ar') === '1' || params.get('ar') === 'true';

    // Store defaults for Reset function
    this.initialConfig = { ...this.config };
  }

  initElements() {
    this.videoElement = document.getElementById('camera-feed');
    this.arCanvasContainer = document.getElementById('ar-viewport');
    this.statusPill = document.getElementById('tracking-status-pill');
    this.statusText = document.getElementById('tracking-status-text');
    this.statusDot = document.getElementById('tracking-status-dot');
    this.lostBanner = document.getElementById('tracking-lost-banner');
    this.loadingOverlay = document.getElementById('ar-loading');
    this.loadingBar = document.getElementById('ar-progress-bar');
    this.loadingText = document.getElementById('ar-progress-text');
    this.errorModal = document.getElementById('error-modal');
    this.errorMsg = document.getElementById('error-modal-msg');
    this.modelNameLabel = document.getElementById('hud-model-name');

    // Controls
    this.btnScaleMinus = document.getElementById('btn-scale-minus');
    this.btnScalePlus = document.getElementById('btn-scale-plus');
    this.scaleLabel = document.getElementById('val-hud-scale');
    this.btnAutoRotate = document.getElementById('btn-toggle-auto-rotate');
    this.btnReset = document.getElementById('btn-ar-reset');
    this.btnFullscreen = document.getElementById('btn-ar-fullscreen');

    if (this.modelNameLabel) {
      const preset = AR_CONFIG.models[this.modelId];
      this.modelNameLabel.textContent = preset ? preset.name : this.modelId.toUpperCase();
    }

    this.updateControlsUI();
  }

  initThree() {
    this.scene = new THREE.Scene();

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Perspective Camera matching assumed vertical FOV
    this.camera = new THREE.PerspectiveCamera(AR_CONFIG.cameraFov, width / height, 0.05, 50);
    this.camera.position.set(0, 0, 0); // AR Camera is at origin
    this.scene.add(this.camera);

    // Alpha transparent WebGL renderer over the video element
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'threejs-ar-canvas';

    this.arCanvasContainer.appendChild(this.renderer.domElement);

    // Setup production PBR lighting
    ModelLoader.setupLighting(this.scene);

    // Marker Anchor Group (Anchored to physical QR marker in 3D real space)
    this.markerGroup = new THREE.Group();
    this.markerGroup.visible = false; // Initially hidden until QR detected
    this.scene.add(this.markerGroup);

    // Resize listener
    window.addEventListener('resize', () => this.onResize());

    // Offscreen Canvas for jsQR image extraction
    this.cvCanvas = document.createElement('canvas');
    this.cvContext = this.cvCanvas.getContext('2d', { willReadFrequently: true });

    // Start render loop
    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  initTracker() {
    this.tracker = new ARTracker({
      markerSize: AR_CONFIG.markerSize,
      cameraFov: AR_CONFIG.cameraFov,
      onStatusChange: (status) => this.handleTrackingStatus(status),
      onPoseUpdate: (pose) => this.handlePoseUpdate(pose),
      onQrDecoded: (data) => {
        console.log("Tracked QR Code decoded URL:", data);
      }
    });
  }

  async initCamera() {
    // Check HTTPS security requirement
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      this.showError("AR requires a secure HTTPS connection or localhost. Please deploy to GitHub Pages (HTTPS) or run a local secure server.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.showError("Your browser does not support camera access (getUserMedia API). Please update to the latest Chrome or Safari.");
      return;
    }

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      this.videoElement.onloadedmetadata = () => {
        this.cvCanvas.width = this.videoElement.videoWidth || 640;
        this.cvCanvas.height = this.videoElement.videoHeight || 480;
      };
    } catch (err) {
      console.error("Camera access error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.showError("Camera permission denied. Please enable camera access in your browser settings to use WebAR.");
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        this.showError("No camera device found on this system.");
      } else {
        this.showError(`Unable to start camera: ${err.message || 'Unknown error'}`);
      }
    }
  }

  async load3dModel() {
    this.showLoading(true, 15, "Loading 3D Model...");
    try {
      let modelSourceUrl;
      if (this.customModelUrl) {
        modelSourceUrl = this.customModelUrl;
      } else if (AR_CONFIG.models[this.modelId]) {
        modelSourceUrl = getModelBlobUrl(this.modelId);
      } else {
        modelSourceUrl = `models/${this.modelId}.glb`;
      }

      const model = await this.modelLoader.load(modelSourceUrl, (percent) => {
        this.showLoading(true, percent, "Loading 3D Model...");
      });

      this.model = model;
      this.markerGroup.add(model);
      this.updateModelTransform();
      this.showLoading(false);
    } catch (err) {
      console.error("Failed to load model:", err);
      this.showLoading(false);
      this.showError("Failed to load 3D model. Please verify GLB asset URL and format.");
    }
  }

  updateModelTransform() {
    if (!this.model) return;
    this.model.scale.setScalar(this.config.scale);
    this.model.position.set(this.config.offsetX, this.config.height, this.config.offsetZ);
    this.model.rotation.y = this.config.rotationY;
  }

  handleTrackingStatus(status) {
    if (!this.statusPill || !this.statusText) return;

    this.statusPill.className = 'status-pill ' + status;

    switch (status) {
      case 'searching':
        this.statusText.textContent = 'SEARCHING FOR QR...';
        if (this.lostBanner) this.lostBanner.style.display = 'none';
        this.isTrackingActive = false;
        break;
      case 'detected':
        this.statusText.textContent = 'QR DETECTED ✓';
        if (this.lostBanner) this.lostBanner.style.display = 'none';
        this.isTrackingActive = true;
        this.markerGroup.visible = true;
        break;
      case 'tracking':
        this.statusText.textContent = 'TRACKING ACTIVE ✓';
        if (this.lostBanner) this.lostBanner.style.display = 'none';
        this.isTrackingActive = true;
        this.markerGroup.visible = true;
        break;
      case 'lost':
        this.statusText.textContent = 'QR LOST';
        if (this.lostBanner) this.lostBanner.style.display = 'flex';
        this.isTrackingActive = false;
        // Keep visible briefly for smoother visual continuity
        setTimeout(() => {
          if (!this.isTrackingActive) {
            this.markerGroup.visible = false;
          }
        }, 500);
        break;
    }
  }

  handlePoseUpdate(pose) {
    // Spatial 6DOF Anchoring: Update Marker Group position and orientation directly
    this.markerGroup.position.copy(pose.position);
    this.markerGroup.quaternion.copy(pose.quaternion);
    this.markerGroup.visible = true;
  }

  bindControls() {
    this.btnScaleMinus?.addEventListener('click', () => {
      this.config.scale = Math.max(0.2, this.config.scale - 0.1);
      this.updateControlsUI();
      this.updateModelTransform();
    });

    this.btnScalePlus?.addEventListener('click', () => {
      this.config.scale = Math.min(3.0, this.config.scale + 0.1);
      this.updateControlsUI();
      this.updateModelTransform();
    });

    this.btnAutoRotate?.addEventListener('click', () => {
      this.config.autoRotate = !this.config.autoRotate;
      this.updateControlsUI();
    });

    this.btnReset?.addEventListener('click', () => {
      this.resetAr();
    });

    this.btnFullscreen?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
  }

  updateControlsUI() {
    if (this.scaleLabel) {
      this.scaleLabel.textContent = `${this.config.scale.toFixed(1)}x`;
    }
    if (this.btnAutoRotate) {
      if (this.config.autoRotate) {
        this.btnAutoRotate.classList.add('active');
        this.btnAutoRotate.textContent = 'Auto Rotate: ON';
      } else {
        this.btnAutoRotate.classList.remove('active');
        this.btnAutoRotate.textContent = 'Auto Rotate: OFF';
      }
    }
  }

  resetAr() {
    this.config = { ...this.initialConfig };
    this.tracker.reset();
    this.markerGroup.visible = false;
    this.updateControlsUI();
    this.updateModelTransform();
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Fullscreen request error:", err);
      });
    } else {
      document.exitFullscreen().catch(console.warn);
    }
  }

  showLoading(show, percent = 0, text = "Loading...") {
    if (!this.loadingOverlay) return;
    this.loadingOverlay.style.display = show ? 'flex' : 'none';
    if (this.loadingBar) this.loadingBar.style.width = `${percent}%`;
    if (this.loadingText) this.loadingText.textContent = `${text} (${percent}%)`;
  }

  showError(msg) {
    if (!this.errorModal || !this.errorMsg) {
      alert(msg);
      return;
    }
    this.errorMsg.textContent = msg;
    this.errorModal.style.display = 'flex';
  }

  renderLoop(timestamp) {
    requestAnimationFrame(this.renderLoop);

    const delta = this.clock.getDelta();

    // 1. Process Video Frame for 6DOF Marker Tracking
    if (this.videoElement && this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
      const vw = this.videoElement.videoWidth;
      const vh = this.videoElement.videoHeight;

      if (vw > 0 && vh > 0) {
        if (this.cvCanvas.width !== vw || this.cvCanvas.height !== vh) {
          this.cvCanvas.width = vw;
          this.cvCanvas.height = vh;
        }

        this.cvContext.drawImage(this.videoElement, 0, 0, vw, vh);
        const imageData = this.cvContext.getImageData(0, 0, vw, vh);

        // Run marker detection & 6DOF pose solver
        if (window.jsQR) {
          this.tracker.processFrame(imageData, window.jsQR, timestamp);
        }
      }
    }

    // 2. Update Model Animations (rotors, turbines, etc.)
    this.modelLoader.update(delta);

    // 3. Optional Model Auto-Rotation
    if (this.config.autoRotate && this.model) {
      this.model.rotation.y += this.config.autoRotateSpeed;
    }

    // 4. Render 3D Three.js Scene directly overlaying the camera view
    this.renderer.render(this.scene, this.camera);
  }
}

// Auto-boot when DOM ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('camera-feed')) {
      window.arExperience = new ArExperience();
    }
  });
}

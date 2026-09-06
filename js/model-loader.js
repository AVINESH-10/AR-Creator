/**
 * Three.js GLB/GLTF 3D Model Manager
 * Handles asynchronous model loading, progress tracking, automatic bounding-box normalization,
 * PBR material enhancement, animation playback, and scene lighting.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class ModelLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.currentModel = null;
    this.currentGltf = null;
    this.mixer = null;
    this.animations = [];
  }

  /**
   * Setup production PBR lighting on a Three.js scene
   * Ensures materials appear vibrant and realistic (never black or washed out)
   * @param {THREE.Scene} scene 
   */
  static setupLighting(scene) {
    // Soft ambient hemisphere light (sky light + ground bounce)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.2);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    // Primary directional key light with soft shadow capability
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(5, 12, 7);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.bias = -0.001;
    scene.add(keyLight);

    // Secondary fill light for soft shadows
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
    fillLight.position.set(-5, 6, -5);
    scene.add(fillLight);

    // Upward bounce light to illuminate under surfaces
    const bounceLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    bounceLight.position.set(0, -5, 0);
    scene.add(bounceLight);
  }

  /**
   * Create an attractive procedural grid/plane for generator preview
   */
  static createMarkerPreviewPlane(size = 1.0) {
    const group = new THREE.Group();

    // Base dark square representing physical QR card
    const cardGeo = new THREE.PlaneGeometry(size, size);
    const cardMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    const cardMesh = new THREE.Mesh(cardGeo, cardMat);
    cardMesh.rotation.x = -Math.PI / 2;
    cardMesh.receiveShadow = true;
    group.add(cardMesh);

    // Glowing border
    const edges = new THREE.EdgesGeometry(cardGeo);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.rotation.x = -Math.PI / 2;
    group.add(wireframe);

    // Sub-grid lines
    const grid = new THREE.GridHelper(size, 8, 0x38bdf8, 0x334155);
    grid.position.y = 0.001;
    group.add(grid);

    return group;
  }

  /**
   * Load a GLB model from URL or Blob with progress reporting
   * @param {string} url - Model URL or ObjectURL
   * @param {Function} onProgress - Progress callback: (percentage) => {}
   * @returns {Promise<THREE.Group>}
   */
  load(url, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          this.currentGltf = gltf;
          const model = gltf.scene;

          // Process materials and shadows
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              if (child.material) {
                child.material.side = THREE.DoubleSide;
                // Enable environment reflections & depth write
                child.material.depthWrite = true;
                if (child.material.map) {
                  child.material.map.anisotropy = 8;
                }
              }
            }
          });

          // Normalize model size and center bounding box at bottom center (Y=0)
          this.normalizeModel(model);

          // Setup animations if present
          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(model);
            this.animations = gltf.animations;
            gltf.animations.forEach((clip) => {
              const action = this.mixer.clipAction(clip);
              action.play();
            });
          } else {
            this.mixer = null;
            this.animations = [];
          }

          this.currentModel = model;
          resolve(model);
        },
        (xhr) => {
          if (xhr.lengthComputable) {
            const percent = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100));
            onProgress(percent);
          } else {
            onProgress(50); // Fallback progress
          }
        },
        (error) => {
          console.error("Error loading 3D GLB model:", error);
          reject(new Error("Unable to load GLB model. Please check file format and URL."));
        }
      );
    });
  }

  /**
   * Normalizes the model size to unit bounding box and centers its base at origin (0, 0, 0)
   * @param {THREE.Object3D} model 
   */
  normalizeModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const targetScale = 1.0 / maxDim;
      model.scale.setScalar(targetScale);
    }

    // Recompute box after scaling
    const normalizedBox = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    normalizedBox.getCenter(center);

    // Center X and Z, and place base at Y = 0
    model.position.x -= center.x;
    model.position.y -= normalizedBox.min.y;
    model.position.z -= center.z;

    // Wrap in a parent group so position offset stays clean
    const wrapper = new THREE.Group();
    wrapper.add(model);
    return wrapper;
  }

  /**
   * Update animation mixer per frame
   * @param {number} delta - Delta time in seconds
   */
  update(delta) {
    if (this.mixer) {
      this.mixer.update(delta);
    }
  }

  /**
   * Dispose current model assets
   */
  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    if (this.currentModel) {
      this.currentModel.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
      this.currentModel = null;
    }
  }
}

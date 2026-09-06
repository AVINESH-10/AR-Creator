# 3D Models Directory (`models/`)

This directory stores `.glb` and `.gltf` 3D model files for the WebAR application.

## 📦 How to Add New 3D Models

1. Place your `.glb` or `.gltf` file directly inside this `models/` directory:
   ```text
   models/
   ├── helicopter.glb
   ├── drone.glb
   ├── robot.glb
   ├── car.glb
   └── your-custom-model.glb
   ```

2. Push the files to your GitHub repository:
   ```bash
   git add models/
   git commit -m "Add new 3D model"
   git push origin main
   ```

3. In the AR Generator Studio (`generator.html`), you can now load your model by typing its name (e.g. `your-custom-model`) or by scanning the generated QR code!

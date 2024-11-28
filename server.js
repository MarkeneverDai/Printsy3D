const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors'); // Only declare cors once

const app = express();

// Set up CORS configuration
const allowedOrigins = [
  'https://c7hfgm-03.myshopify.com', // Your actual Shopify store domain
];

app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

const port = 3000;

// Set the price per gram (in cents)
const pricePerGram = 5; // Adjust this value as needed (e.g., 5 cents per gram)

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

// Serve upload form
app.get('/', (req, res) => {
  res.send(`
    <h1>Upload STL File to Calculate Filament Usage</h1>
    <form action="/upload" method="post" enctype="multipart/form-data">
      <label for="file">Select STL File:</label>
      <input type="file" name="file" id="file" accept=".stl" required>
      <label for="infill">Infill Density (%):</label>
      <input type="number" name="infill" id="infill" min="0" max="100" value="15" required>
      <label for="layers">Top/Bottom Layers (mm):</label>
      <input type="number" name="layers" id="layers" step="0.1" value="1.0" required>
      <label for="material">Filament Type:</label>
      <select name="material" id="material" required>
        <option value="1.24">PLA (1.24 g/cm³)</option>
        <option value="1.04">ABS (1.04 g/cm³)</option>
        <option value="1.27">PETG (1.27 g/cm³)</option>
      </select>
      <button type="submit">Calculate</button>
    </form>
  `);
});

// Parse binary STL and calculate volume
function calculateSTLVolume(buffer) {
  const header = buffer.slice(0, 80); // 80-byte header
  const triangleCount = buffer.readUInt32LE(80); // Number of triangles
  let volume = 0;

  const triangleSize = 50; // Each triangle is 50 bytes
  const offsetBase = 84; // Triangles start at byte 84

  for (let i = 0; i < triangleCount; i++) {
    const offset = offsetBase + i * triangleSize;

    // Read vertices of the triangle
    const v1 = {
      x: buffer.readFloatLE(offset + 12),
      y: buffer.readFloatLE(offset + 16),
      z: buffer.readFloatLE(offset + 20),
    };
    const v2 = {
      x: buffer.readFloatLE(offset + 24),
      y: buffer.readFloatLE(offset + 28),
      z: buffer.readFloatLE(offset + 32),
    };
    const v3 = {
      x: buffer.readFloatLE(offset + 36),
      y: buffer.readFloatLE(offset + 40),
      z: buffer.readFloatLE(offset + 44),
    };

    // Compute volume contribution of this triangle (using tetrahedron method)
    const tetraVolume =
      (v1.x * (v2.y * v3.z - v3.y * v2.z) -
        v1.y * (v2.x * v3.z - v3.x * v2.z) +
        v1.z * (v2.x * v3.y - v3.x * v2.y)) /
      6.0;

    volume += tetraVolume;
  }

  return Math.abs(volume) / 1000; // Return absolute value of the volume in cm³
}

// Calculate filament usage
function calculateFilamentUsage(volume, infillDensity, wallThickness, topBottomThickness, filamentDensity, layerHeight) {
  // Approximate base area using the cube root of volume
  const footprintArea = Math.cbrt(volume * 6); // Simplified approximation for footprint area in cm²

  // Outer Top/Bottom Surface Volume (single layer of 0.2mm)
  const outerTopBottomVolume = (footprintArea * layerHeight) / 10; // in cm³

  // Internal Solid Infill Volume under Top/Bottom Surfaces (2 layers × 0.2mm)
  const internalTopBottomVolume = (footprintArea * 2 * layerHeight) / 10; // 2 solid infill layers

  // Total Top/Bottom Volume
  const totalTopBottomVolume = outerTopBottomVolume + internalTopBottomVolume;

  // Wall Volume (solid walls approximation)
  const wallVolume = wallThickness * (volume ** (2 / 3)); // Approximate wall surface area

  // Infill Volume
  const infillVolume = volume * (infillDensity / 100);

  // Total Volume and Filament Weight
  const totalVolume = wallVolume + totalTopBottomVolume + infillVolume;
  const wallWeight = wallVolume * filamentDensity;
  const topBottomWeight = totalTopBottomVolume * filamentDensity;
  const infillWeight = infillVolume * filamentDensity;
  const totalWeight = totalVolume * filamentDensity;

  return {
    wallVolume,
    wallWeight,
    totalTopBottomVolume,
    topBottomWeight,
    infillVolume,
    infillWeight,
    totalVolume,
    totalWeight,
  };
}

// Handle file upload and calculation
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const infillDensity = parseFloat(req.body.infill);
  const filamentDensity = parseFloat(req.body.material); // Density from dropdown
  const topBottomThickness = parseFloat(req.body.layers); // Top/Bottom layer thickness in mm
  const wallThickness = 2 * 0.4; // 2 wall loops with 0.4 mm nozzle diameter
  const layerHeight = 0.2; // Layer height in mm

  try {
    // Read STL file
    const buffer = fs.readFileSync(filePath);
    const volume = calculateSTLVolume(buffer); // STL volume in cm³

    const {
      wallVolume,
      wallWeight,
      totalTopBottomVolume,
      topBottomWeight,
      infillVolume,
      infillWeight,
      totalVolume,
      totalWeight,
    } = calculateFilamentUsage(volume, infillDensity, wallThickness, topBottomThickness, filamentDensity, layerHeight);

    // Calculate price based on filament weight
    const priceInCents = totalWeight * pricePerGram; // Price in cents
    const priceInDollars = (priceInCents / 100).toFixed(2); // Convert to dollars

    // Send the result
    res.send(`
      <h1>Filament Usage Calculation</h1>
      <p><strong>STL Volume:</strong> ${volume.toFixed(2)} cm³</p>
      <p><strong>Wall Volume:</strong> ${wallVolume.toFixed(2)} cm³ (Filament: ${wallWeight.toFixed(2)} g)</p>
      <p><strong>Top/Bottom Layer Volume:</strong> ${totalTopBottomVolume.toFixed(2)} cm³ (Filament: ${topBottomWeight.toFixed(2)} g)</p>
      <p><strong>Infill Volume:</strong> ${infillVolume.toFixed(2)} cm³ (Filament: ${infillWeight.toFixed(2)} g)</p>
      <p><strong>Total Filament Volume:</strong> ${totalVolume.toFixed(2)} cm³</p>
      <p><strong>Filament Usage:</strong> ${totalWeight.toFixed(2)} g</p>
      <p><strong>Total Cost:</strong> $${priceInDollars}</p>
      <a href="/">Upload Another File</a>
    `);

    // Clean up uploaded file
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error processing STL file:', error.message);
    res.status(500).send('Failed to process the STL file.');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
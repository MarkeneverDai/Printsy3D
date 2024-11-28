const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors'); // For Shopify frontend requests
const app = express();
const port = 3000;

// Allow cross-origin requests for Shopify frontend
app.use(cors());

// Set the price per gram (in cents)
const pricePerGram = 5; // Adjust this value as needed

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
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

// Calculate filament usage and price
function calculateFilamentUsage(volume, infillDensity, wallThickness, topBottomThickness, filamentDensity, layerHeight) {
  const infillVolume = volume * (infillDensity / 100);
  const totalVolume = infillVolume + wallThickness + topBottomThickness; // Simplified calculation
  const totalWeight = totalVolume * filamentDensity; // Weight in grams
  const priceInCents = totalWeight * pricePerGram;
  return (priceInCents / 100).toFixed(2); // Price in dollars
}

// Handle file upload and calculation
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const infillDensity = parseFloat(req.body.infill);
  const filamentDensity = parseFloat(req.body.material);
  const topBottomThickness = parseFloat(req.body.layers);
  const wallThickness = 2 * 0.4; // 2 wall loops with 0.4 mm nozzle diameter
  const layerHeight = 0.2; // Layer height in mm

  try {
    const buffer = fs.readFileSync(filePath);
    const volume = calculateSTLVolume(buffer);

    const price = calculateFilamentUsage(
      volume,
      infillDensity,
      wallThickness,
      topBottomThickness,
      filamentDensity,
      layerHeight
    );

    fs.unlinkSync(filePath); // Clean up uploaded file

    res.json({
      success: true,
      price: price,
    });
  } catch (error) {
    console.error('Error processing STL file:', error.message);
    res.status(500).json({ error: 'Failed to process the STL file.' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const app = express();
const port = 3000;

// Set the price per gram (in cents)
const pricePerGram = 5;

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

// Parse binary STL and calculate volume
function calculateSTLVolume(buffer) {
  const triangleCount = buffer.readUInt32LE(80); // Number of triangles
  let volume = 0;

  const triangleSize = 50; // Each triangle is 50 bytes
  const offsetBase = 84; // Triangles start at byte 84

  for (let i = 0; i < triangleCount; i++) {
    const offset = offsetBase + i * triangleSize;

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

    const tetraVolume =
      (v1.x * (v2.y * v3.z - v3.y * v2.z) -
        v1.y * (v2.x * v3.z - v3.x * v2.z) +
        v1.z * (v2.x * v3.y - v3.x * v2.y)) /
      6.0;

    volume += tetraVolume;
  }

  return Math.abs(volume) / 1000; // cm³
}

// Calculate filament usage and price
function calculateFilamentUsage(volume, infillDensity, filamentDensity) {
  const infillVolume = volume * (infillDensity / 100);
  const totalWeight = infillVolume * filamentDensity; // Weight in grams
  const priceInCents = totalWeight * pricePerGram;
  return (priceInCents / 100).toFixed(2); // Price in dollars
}

// Handle root endpoint
app.get('/', (req, res) => {
  res.send(`
    <h1>STL File Pricing Service</h1>
    <p>Welcome! Please POST your STL file to <strong>/upload</strong> with the required parameters.</p>
  `);
});

// Handle file upload and calculation
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = req.file.path;
  const infillDensity = parseFloat(req.body.infill);
  const filamentDensity = parseFloat(req.body.material);

  try {
    // Read STL file
    const buffer = fs.readFileSync(filePath);
    const volume = calculateSTLVolume(buffer); // STL volume in cm³

    // Calculate price
    const price = calculateFilamentUsage(volume, infillDensity, filamentDensity);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    // Respond with price only
    res.send(`Total Cost: $${price}`);
  } catch (error) {
    console.error('Error processing STL file:', error.message);
    res.status(500).send('Failed to process the STL file.');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
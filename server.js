const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Set the price per gram (in cents)
const pricePerGram = 5; // Adjust this value as needed

// Configure CORS
app.use(cors({
  origin: '*', // Replace '*' with your Shopify store domain for better security
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

// Parse binary STL and calculate volume
function calculateSTLVolume(buffer) {
  const triangleCount = buffer.readUInt32LE(80); // Number of triangles in STL
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

  return Math.abs(volume) / 1000; // Return absolute volume in cm³
}

// Calculate filament usage
function calculateFilamentUsage(volume, infillDensity, wallThickness, filamentDensity) {
  const infillVolume = volume * (infillDensity / 100);
  const wallVolume = wallThickness * (volume ** (2 / 3)); // Approximate wall volume
  const totalVolume = infillVolume + wallVolume;

  const totalWeight = totalVolume * filamentDensity; // Total filament weight in grams

  return totalWeight;
}

// Handle file upload and calculate price
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const filePath = req.file.path;
  const infillDensity = parseFloat(req.body.infill || 15); // Default 15% infill
  const filamentDensity = parseFloat(req.body.material || 1.24); // Default PLA (1.24 g/cm³)
  const wallThickness = 2 * 0.4; // Default: 2 wall loops with 0.4 mm nozzle

  try {
    // Read STL file
    const buffer = fs.readFileSync(filePath);
    const volume = calculateSTLVolume(buffer); // STL volume in cm³

    const totalWeight = calculateFilamentUsage(volume, infillDensity, wallThickness, filamentDensity);

    // Calculate price based on filament weight
    const priceInCents = totalWeight * pricePerGram;
    const priceInDollars = (priceInCents / 100).toFixed(2); // Convert to dollars

    // Respond with only the price
    res.json({ price: `$${priceInDollars}` });

    // Clean up uploaded file
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error processing STL file:', error.message);
    res.status(500).json({ error: 'Failed to process the STL file.' });
  }
});

// Serve frontend (optional)
app.get('/', (req, res) => {
  res.send(`
    <h1>STL Filament Cost Calculator</h1>
    <p>Send a POST request to <code>/api/upload</code> with:</p>
    <ul>
      <li><strong>file:</strong> STL file (binary, required)</li>
      <li><strong>infill:</strong> Infill density (%) [default: 15]</li>
      <li><strong>material:</strong> Filament density (g/cm³) [default: PLA (1.24)]</li>
    </ul>
  `);
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const STLReader = require('stl-reader');

const app = express();
const port = 3000;

// Serve static files for the public directory
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Endpoint to handle STL file uploads
app.post('/analyze-stl', upload.single('file'), (req, res) => {
  const filePath = req.file.path; // Path to the uploaded file

  try {
    // Read and parse the STL file
    const stlBuffer = fs.readFileSync(filePath);
    const geometry = STLReader.parse(stlBuffer);

    // Calculate the estimated grams of material and cost
    const numTriangles = geometry.faces.length; // Number of triangles
    const estimatedGrams = numTriangles * 0.1; // Example: 0.1 gram per triangle
    const estimatedCost = estimatedGrams * 0.02; // Example: $0.02 per gram

    // Clean up the uploaded file
    fs.unlinkSync(filePath);

    // Send the result back to the client
    res.json({
      success: true,
      grams: estimatedGrams.toFixed(2),
      cost: estimatedCost.toFixed(2),
    });
  } catch (error) {
    console.error('Error processing STL file:', error);

    // Handle errors
    res.status(500).json({
      success: false,
      message: 'Failed to analyze the STL file. Please try again.',
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
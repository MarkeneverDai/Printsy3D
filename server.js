const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const STLReader = require('stl-reader');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for Shopify or other frontends
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*', // Replace '*' with your Shopify store URL in production
    methods: ['GET', 'POST'],
  })
);

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
  },
});

// Endpoint to handle STL file uploads
app.post('/analyze-stl', upload.single('file'), (req, res) => {
  if (!req.file) {
    console.error('Error: No file uploaded.');
    return res.status(400).json({
      success: false,
      message: 'No file uploaded. Please upload an STL file.',
    });
  }

  const filePath = req.file.path;

  try {
    // Validate the file extension (STL)
    const fileExtension = req.file.originalname.split('.').pop().toLowerCase();
    if (fileExtension !== 'stl') {
      console.error('Error: Uploaded file is not an STL file.');
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload a valid STL file.',
      });
    }

    console.log(`Received file: ${req.file.originalname}`);
    console.log(`File saved at: ${filePath}`);

    // Read the STL file
    const stlBuffer = fs.readFileSync(filePath);

    // Parse the STL file
    const geometry = STLReader.parse(stlBuffer);

    console.log(`STL file successfully parsed. Number of triangles: ${geometry.faces.length}`);

    // Calculate the estimated grams of material and cost
    const numTriangles = geometry.faces.length; // Number of triangles
    const estimatedGrams = numTriangles * 0.1; // Example: 0.1 gram per triangle
    const estimatedCost = estimatedGrams * 0.02; // Example: $0.02 per gram

    // Clean up the uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      grams: estimatedGrams.toFixed(2),
      cost: estimatedCost.toFixed(2),
    });
  } catch (error) {
    console.error('Error processing STL file:', error.message);

    // Send error response
    res.status(500).json({
      success: false,
      message: 'Failed to analyze the STL file. Please try again.',
    });
  }
});

// Catch-all route for unmatched paths
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found.',
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
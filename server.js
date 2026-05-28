````js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// ======================
// Middleware
// ======================

app.use(cors());
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// ======================
// Routes
// ======================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'about.html'));
});

// ======================
// Multer Setup
// ======================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024,
    },
});

const uploadFields = upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'reports', maxCount: 3 },
]);

// ======================
// Gemini Setup
// ======================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_NAME = 'gemini-2.5-flash';

// ======================
// System Prompt
// ======================

const SYSTEM_PROMPT = `
You are Care.ai, an expert medical AI assistant.

You analyze:
- symptoms
- uploaded images
- uploaded medical reports

You provide only preliminary informational analysis.

RULES:
1. Consider all inputs together.
2. Analyze PDFs if provided.
3. Give 2-5 possible conditions.
4. Say whether doctor consultation is needed.
5. Respond ONLY in valid JSON.

OUTPUT FORMAT:
{
  "urgencyLevel": "error" | "warning" | "success",
  "recommendationTitle": "Short title",
  "recommendationText": "Detailed explanation",
  "conditions": [
    {
      "name": "Condition",
      "prob": "XX%",
      "desc": "Explanation"
    }
  ]
}
`;

// ======================
// API Route
// ======================

app.post('/api/analyze', uploadFields, async (req, res) => {
    try {
        const symptomsText = req.body.symptoms || '';
        const imageFiles = req.files?.images || [];
        const reportFiles = req.files?.reports || [];

        if (
            !symptomsText &&
            imageFiles.length === 0 &&
            reportFiles.length === 0
        ) {
            return res.status(400).json({
                error: 'Please provide symptoms, images, or reports.',
            });
        }

        const contentParts = [];

        let userMessage = `Patient Symptoms:\n${symptomsText || 'No symptoms described.'}`;

        if (imageFiles.length > 0) {
            userMessage += `\n\n${imageFiles.length} image(s) attached.`;
        }

        if (reportFiles.length > 0) {
            userMessage += `\n\n${reportFiles.length} medical report(s) attached.`;
        }

        contentParts.push({
            text: userMessage,
        });

        // Images
        for (const img of imageFiles) {
            contentParts.push({
                inlineData: {
                    data: img.buffer.toString('base64'),
                    mimeType: img.mimetype,
                },
            });
        }

        // Reports
        for (const report of reportFiles) {
            contentParts.push({
                inlineData: {
                    data: report.buffer.toString('base64'),
                    mimeType: report.mimetype,
                },
            });
        }

        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: SYSTEM_PROMPT,
        });

        const result = await model.generateContent(contentParts);

        let responseText = result.response.text().trim();

        responseText = responseText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```$/i, '')
            .trim();

        const parsedData = JSON.parse(responseText);

        res.json(parsedData);

    } catch (error) {
        console.error('Gemini Error:', error);

        res.status(500).json({
            error: 'Failed to analyze.',
            detail: error.message,
        });
    }
});

// ======================
// Start Server
// ======================
module.exports = app;
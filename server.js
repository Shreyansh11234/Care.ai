require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const path = require('path');

const app = express();
const port = 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Explicit Routes ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'about.html'));
});

app.use(express.static(__dirname));

// Configure multer for multiple file uploads (images + reports)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max per file
});

// Accept up to 5 images and 3 reports in a single request
const uploadFields = upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'reports', maxCount: 3 },
]);

// --- Initialize Gemini ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Use the latest available model
const MODEL_NAME = 'gemini-2.5-flash';

// --- System Prompt ---
const SYSTEM_PROMPT = `You are Care.ai, an expert medical AI assistant. You analyze patient-reported symptoms, photos of visible conditions (skin rashes, eye infections, wounds, etc.), and medical reports (blood tests, lab results, radiology reports, etc.).

Your task is to provide a thoughtful, preliminary assessment. You are NOT a doctor and you do NOT provide a definitive diagnosis. You provide an informational analysis to help the patient decide whether to seek professional care.

RULES:
1. Consider ALL inputs together — symptoms text, images, and report data — holistically.
2. If a medical report (PDF) is provided, extract key abnormal values and factor them into your analysis.
3. Provide 2-5 potential conditions ranked by likelihood.
4. Clearly state whether the patient should see a doctor.
5. Be empathetic and clear in your language.
6. You MUST respond ONLY with valid JSON — no markdown, no extra text.

OUTPUT FORMAT (strict JSON):
{
    "urgencyLevel": "error" | "warning" | "success",
    "recommendationTitle": "Short title for the banner",
    "recommendationText": "Detailed, empathetic recommendation explaining why they should or should not seek care.",
    "conditions": [
        {
            "name": "Condition Name",
            "prob": "XX%",
            "desc": "A 1-2 sentence description of this condition and why it matches the patient's inputs."
        }
    ]
}

URGENCY RULES:
- "error" = Emergency or urgent — seek immediate medical attention (e.g., chest pain, signs of stroke, severe allergic reaction, dangerously abnormal lab values).
- "warning" = Not an emergency but should consult a doctor soon (e.g., persistent rash, abnormal blood counts, recurring pain).
- "success" = Mild or self-limiting — can monitor at home with basic care (e.g., common cold, minor bruise, normal lab results with mild symptoms).`;

// --- API Endpoint ---
app.post('/api/analyze', uploadFields, async (req, res) => {
    try {
        const symptomsText = req.body.symptoms || '';
        const imageFiles = req.files?.images || [];
        const reportFiles = req.files?.reports || [];

        if (!symptomsText && imageFiles.length === 0 && reportFiles.length === 0) {
            return res.status(400).json({ error: 'Please provide symptoms, images, or reports.' });
        }

        // Build the multimodal content array for Gemini
        const contentParts = [];

        // 1. Text prompt with symptoms
        let userMessage = `Patient Symptoms:\n${symptomsText || 'No symptoms described.'}`;

        if (imageFiles.length > 0) {
            userMessage += `\n\n${imageFiles.length} photo(s) of the affected area are attached.`;
        }
        if (reportFiles.length > 0) {
            userMessage += `\n\n${reportFiles.length} medical report(s) (PDF) are attached. Please extract and analyze key values.`;
        }

        contentParts.push({ text: userMessage });

        // 2. Attach image files
        for (const img of imageFiles) {
            contentParts.push({
                inlineData: {
                    data: img.buffer.toString('base64'),
                    mimeType: img.mimetype,
                },
            });
        }

        // 3. Attach report files (PDFs)
        for (const report of reportFiles) {
            contentParts.push({
                inlineData: {
                    data: report.buffer.toString('base64'),
                    mimeType: report.mimetype,
                },
            });
        }

        // 4. Call Gemini
        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            systemInstruction: SYSTEM_PROMPT,
        });

        const result = await model.generateContent(contentParts);
        const response = result.response;
        let responseText = response.text().trim();

        // Strip markdown fences if model adds them
        responseText = responseText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();

        const parsedData = JSON.parse(responseText);

        // Validate response structure
        if (!parsedData.urgencyLevel || !parsedData.conditions) {
            throw new Error('Invalid response structure from AI');
        }

        res.json(parsedData);
    } catch (error) {
        console.error('--- Gemini API Error ---');
        console.error('Message:', error.message);
        if (error.status) console.error('Status:', error.status);
        if (error.errorDetails) console.error('Details:', JSON.stringify(error.errorDetails, null, 2));

        res.status(500).json({
            error: 'Failed to analyze. Please check your inputs and try again.',
            detail: error.message,
        });
    }
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`\n  🩺 Care.ai Server running at http://localhost:${port}\n`);
});
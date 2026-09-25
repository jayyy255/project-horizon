const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const env = fs.readFileSync(envPath, 'utf-8');
const key = env.match(/GEMINI_API_KEY=(.*)/)[1].trim();
const model = env.match(/GEMINI_MODEL=(.*)/)?.[1]?.trim() || 'gemini-3.5-flash-lite';

const cropPath = path.resolve(__dirname, '../scratch/real_vscode_lasso_crop.png');
const b64 = fs.readFileSync(cropPath).toString('base64');

async function test() {
  const prompt = 'What application is this?';
  const systemInstruction = 'You are Project Horizon, an autonomous multimodal Windows desktop agent. Analyze the attached screenshot crop. Respond ONLY with a valid JSON object matching: {"thought": "...", "narration": "...", "tool_name": null, "args": {}, "final_answer": "..."}';
  
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${systemInstruction}\n\nTask: "${prompt}"` },
          {
            inline_data: {
              mime_type: 'image/png',
              data: b64
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Result:', data.candidates?.[0]?.content?.parts?.[0]?.text);
}

test().catch(console.error);

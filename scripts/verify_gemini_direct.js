require('dotenv').config({ override: true });

async function verifyGeminiDirect() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const hostname = 'generativelanguage.googleapis.com';

  console.log(`[Gemini Live HTTP] Request started -> hostname: ${hostname}, model: ${model}`);
  const startTime = performance.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: 'You are Project Horizon planner. The user wants to: "Open my code scanner project in VS Code". Return JSON with thought, narration, tool_name ("find_path"), args: { search_term: "code scanner" }'
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    const latency = performance.now() - startTime;
    console.log(`[Gemini Live HTTP] Response received -> status: ${res.status}, latency: ${latency.toFixed(2)} ms`);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Gemini Live HTTP] Error response: ${errText}`);
      return;
    }

    const data = await res.json();
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(`[Gemini Live HTTP] Generated text: ${candidateText}`);
    console.log(`[Gemini Live HTTP] Usage metadata:`, data.usageMetadata);
  } catch (err) {
    console.error(`[Gemini Live HTTP] Network / API error:`, err);
  }
}

verifyGeminiDirect();

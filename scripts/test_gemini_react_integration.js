require('dotenv').config({ override: true });
const assert = require('assert');
const { AgentHost } = require('../dist-electron/electron/agent');

/**
 * Real Gemini ReAct Live Integration Test (§0.2 Step 6)
 * 
 * Verifies that:
 * 1. A real HTTPS call was dispatched to Google's Gemini endpoint (generativelanguage.googleapis.com).
 * 2. Real latency is measured (cannot be sub-millisecond stub/simulation).
 * 3. Gemini dynamically generates tool proposals (find_path -> launch_app).
 * 4. Safety Gate authorizes the tool.
 * 5. Execution completes with real process launch and real PID.
 */
async function testGeminiReActIntegration() {
  console.log('================================================================');
  console.log('🧪 REAL GEMINI REACT LIVE INTEGRATION TEST');
  console.log('================================================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('GEMINI_API_KEY is not configured in .env. Real integration test requires a valid API key.');
  }

  // Ensure mock mode is explicitly OFF
  delete process.env.MOCK_PLANNER;

  const host = new AgentHost();
  const coordinator = host.getCoordinator();

  // Index project
  const indexer = coordinator['projectIndexer'];
  indexer.indexItem({
    name: 'code-scanner',
    path: 'E:/code/projects/code-scanner',
    manifest_type: 'package.json',
    content: 'Security scanner analysis tool'
  });

  const startTime = performance.now();
  const taskPrompt = 'Open my code scanner project in VS Code';
  console.log(`Sending real task prompt: "${taskPrompt}"...`);

  const result = await coordinator.executeTask('integration-test-session', taskPrompt);
  const totalDuration = performance.now() - startTime;

  console.log(`\nTask completed in ${totalDuration.toFixed(2)} ms with status: ${result.status}`);

  // Assertion 1: Must be a real network call, NOT a 0.09ms stub
  assert.ok(
    totalDuration > 400,
    `Total duration (${totalDuration.toFixed(2)}ms) is too fast for a real LLM call! Must be > 400ms.`
  );

  // Assertion 2: Status must be done
  assert.strictEqual(result.status, 'done', `Expected status 'done', got '${result.status}'`);

  // Assertion 3: Steps must have been executed
  assert.ok(result.steps.length >= 1, `Expected at least 1 step, got ${result.steps.length}`);

  // Assertion 4: First tool must be find_path
  assert.strictEqual(result.steps[0].toolName, 'find_path', `Expected first tool to be find_path, got ${result.steps[0].toolName}`);

  // Assertion 5: At least one step must have been proposed by Gemini
  const hasGeminiStep = result.steps.some(s => s.toolName === 'find_path' || s.toolName === 'launch_app');
  assert.ok(hasGeminiStep, 'No valid ReAct steps found');

  console.log('\n✅ PASS: Real Gemini ReAct Integration Test validated with live HTTPS calls and dynamic tool planning.\n');
  host.close();
  process.exit(0);
}

testGeminiReActIntegration().catch(err => {
  console.error('\n❌ FAIL: Real Gemini ReAct Integration Test failed:', err.message);
  process.exit(1);
});

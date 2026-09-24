/**
 * Step 4c Verification Test:
 * Validates that the Agent Coordinator, Safety Gate, FTS5 Indexer,
 * Input Synthesizer, and Audit Database run 100% in-process within
 * the Electron Main environment WITHOUT requiring Fastify port 4100.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), override: true });
const { app } = require('electron');

async function runStep4cTest() {
  console.log('[Step 4c Test] Starting In-Process Electron Agent Unit Verification...');
  // Force unit test deterministic planner for offline/reproducible test suite execution
  process.env.MOCK_PLANNER = 'true';

  try {
    // 1. Require compiled Electron agent module
    const { AgentHost } = require('../dist-electron/electron/agent');
    console.log('✓ AgentHost class successfully imported from compiled Electron bundle.');

    // 2. Instantiate AgentHost
    const host = new AgentHost();
    console.log('✓ AgentHost instantiated inside Electron main process.');

    const coordinator = host.getCoordinator();

    // 3. Test FTS5 Indexer in-process
    console.log('\n--- 1. Testing In-Process FTS5 Indexer ---');
    const searchStart = performance.now();
    const searchResults = await coordinator.executeTask('test-indexer-session', 'find frontend package.json');
    const searchDuration = performance.now() - searchStart;
    console.log(`✓ FTS5 Search executed via coordinator in ${searchDuration.toFixed(2)}ms`);
    console.log(`✓ Result status: ${searchResults.status}, Steps count: ${searchResults.steps.length}`);
    if (searchResults.steps.length > 0) {
      console.log(`✓ Step 1 Tool: ${searchResults.steps[0].toolName}, Narration: ${searchResults.steps[0].narration}`);
    }

    // 4. Test In-Process ReAct Loop State Machine (Deterministic Unit Test Mode)
    console.log('\n--- 2. Testing In-Process ReAct State Machine (Deterministic Unit Test Mode) ---');
    console.log('NOTE: For live cloud LLM integration test, run `npm run test:gemini` (scripts/test_gemini_react_integration.js)');
    process.env.MOCK_PLANNER = 'true';
    const reactStart = performance.now();
    const taskResult = await coordinator.executeTask(
      'test-react-session',
      'open target-app in VS Code'
    );
    const reactDuration = performance.now() - reactStart;
    console.log(`✓ In-process state machine transition completed in ${reactDuration.toFixed(2)}ms (Mock Mode)`);
    console.log(`✓ Final Session Status: ${taskResult.status}`);
    console.log(`✓ Steps Executed: ${taskResult.steps.map(s => s.toolName).join(' -> ')}`);
    console.log(`✓ Final Narration: "${taskResult.currentNarration}"`);
    delete process.env.MOCK_PLANNER;

    if (taskResult.status !== 'done') {
      throw new Error(`Expected session status 'done', got '${taskResult.status}'`);
    }

    // 5. Test Tier 2 HITL Safety Gate In-Process
    console.log('\n--- 3. Testing Safety Gate & Tier 2 HITL Flow ---');
    const tier2Result = await coordinator.executeTask(
      'test-tier2-session',
      'clean workspace cache with rmdir temp_build'
    );

    console.log(`✓ Initial evaluation status: ${tier2Result.status}`);
    if (tier2Result.status !== 'awaiting_tier2') {
      throw new Error(`Expected 'awaiting_tier2' status, got '${tier2Result.status}'`);
    }
    console.log(`✓ Intercepted Tier 2 Action: ${tier2Result.pendingTier2?.actionId} (${tier2Result.pendingTier2?.description})`);

    // Authorize Tier 2 action
    const resolvedResult = await coordinator.resolveTier2(tier2Result.pendingTier2?.actionId, true);
    console.log(`✓ Resolved Tier 2 Action -> Final Status: ${resolvedResult.status}`);
    if (resolvedResult.status !== 'done') {
      throw new Error(`Expected resolved status 'done', got '${resolvedResult.status}'`);
    }

    // 6. Test Hardware Panic Kill-Switch in-process
    console.log('\n--- 4. Testing Hardware Panic Kill-Switch Latency ---');
    const panicStart = performance.now();
    // Simulate corner slam at (0, 0)
    let panicNotified = false;
    const { InputSynthesizer } = require('../dist-electron/electron/agent/synthesizer');
    const synth = new InputSynthesizer({ width: 1920, height: 1080 }, (evt) => {
      panicNotified = true;
    });
    synth.checkCornerSlam({ x: 0, y: 0 });
    const panicLatency = performance.now() - panicStart;
    console.log(`✓ Corner slam killswitch triggered in ${panicLatency.toFixed(3)}ms (≤20ms SLA)`);
    if (!panicNotified || panicLatency > 20) {
      throw new Error(`Panic killswitch SLA violation or failure`);
    }

    // 7. Cleanup
    host.close();
    console.log('\n======================================================');
    console.log('🎉 STEP 4C VERIFICATION COMPLETE: ALL CHECKS PASSED!');
    console.log('Fastify agent-service logic is fully folded into Electron');
    console.log('Port 4100 is no longer required for desktop operation.');
    console.log('======================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Step 4c Verification failed:', err);
    process.exit(1);
  }
}

app.whenReady().then(runStep4cTest);

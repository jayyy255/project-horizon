require('dotenv').config({ override: true });
const path = require('path');
const { AgentHost } = require('../dist-electron/electron/agent');

async function runLiveTask() {
  console.log('================================================================');
  console.log('⚡ STEP 0.2 STEP 4: REAL LIVE TASK EXECUTION AGAINST REAL MACHINE');
  console.log('Task: "Open my code scanner project in VS Code"');
  console.log('================================================================\n');

  const overallStart = performance.now();

  const host = new AgentHost();
  const coordinator = host.getCoordinator();

  // Index sample projects including code scanner
  const indexer = host.getCoordinator()['projectIndexer'];
  indexer.indexItem({
    name: 'code-scanner',
    path: 'E:/code/projects/code-scanner',
    manifest_type: 'package.json',
    content: 'Security code scanner AST analysis tool'
  });
  indexer.indexItem({
    name: 'project-horizon',
    path: 'E:/code/projects/project-horizon',
    manifest_type: 'package.json',
    content: 'Autonomous multimodal Windows desktop agent'
  });

  console.log('Initiating autonomous ReAct execution via live coordinator...\n');
  const sessionResult = await coordinator.executeTask(
    'live-gemini-session-e2e',
    'Open my code scanner project in VS Code'
  );

  const totalDuration = performance.now() - overallStart;

  console.log('\n================================================================');
  console.log('📊 LIVE EXECUTION EVIDENCE REPORT:');
  console.log(`- Final Status: ${sessionResult.status}`);
  console.log(`- Final Narration: "${sessionResult.currentNarration}"`);
  console.log(`- Total End-to-End Latency: ${totalDuration.toFixed(2)} ms`);
  console.log(`- Total Steps Executed: ${sessionResult.steps.length}`);
  
  sessionResult.steps.forEach((step, idx) => {
    console.log(`\n  [Step ${idx + 1}]`);
    console.log(`    Tool: ${step.toolName}`);
    console.log(`    Args: ${JSON.stringify(step.args)}`);
    console.log(`    Tier: ${step.tier}`);
    console.log(`    Status: ${step.status}`);
    console.log(`    Narration: ${step.narration}`);
    console.log(`    Result: ${JSON.stringify(step.result)}`);
    console.log(`    Step Execution Duration: ${step.durationMs ? step.durationMs.toFixed(2) : 'N/A'} ms`);
  });
  console.log('================================================================\n');

  host.close();
  process.exit(sessionResult.status === 'done' ? 0 : 1);
}

runLiveTask().catch(err => {
  console.error('Live task execution error:', err);
  process.exit(1);
});

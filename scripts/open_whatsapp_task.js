require('dotenv').config({ override: true });
const { AgentHost } = require('../dist-electron/electron/agent');

async function runWhatsAppTask() {
  console.log('================================================================');
  console.log('⚡ STARTING PROJECT HORIZON AGENT');
  console.log('Instruction: "Open WhatsApp on my device"');
  console.log('================================================================\n');

  const overallStart = performance.now();
  const host = new AgentHost();
  const coordinator = host.getCoordinator();

  console.log('Agent initialized. Starting ReAct execution loop...\n');

  const sessionResult = await coordinator.executeTask(
    'live-whatsapp-session-' + Date.now(),
    'Open WhatsApp on my device'
  );

  const totalDuration = performance.now() - overallStart;

  console.log('\n================================================================');
  console.log('📊 EXECUTION SUMMARY:');
  console.log(`- Final Status: ${sessionResult.status}`);
  console.log(`- Final Narration: "${sessionResult.currentNarration}"`);
  console.log(`- Total Duration: ${totalDuration.toFixed(2)} ms`);
  console.log(`- Steps Executed: ${sessionResult.steps.length}`);

  sessionResult.steps.forEach((step, idx) => {
    console.log(`\n  [Step ${idx + 1}]`);
    console.log(`    Tool: ${step.toolName}`);
    console.log(`    Args: ${JSON.stringify(step.args)}`);
    console.log(`    Tier: ${step.tier}`);
    console.log(`    Status: ${step.status}`);
    console.log(`    Narration: ${step.narration}`);
    console.log(`    Result: ${JSON.stringify(step.result)}`);
    console.log(`    Step Duration: ${step.durationMs ? step.durationMs.toFixed(2) : 'N/A'} ms`);
  });
  console.log('================================================================\n');

  host.close();
  return sessionResult;
}

runWhatsAppTask()
  .then((res) => {
    if (res.status === 'done') {
      console.log('✅ Task completed successfully!');
      process.exit(0);
    } else {
      console.error('❌ Task finished with status:', res.status);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Fatal error running task:', err);
    process.exit(1);
  });

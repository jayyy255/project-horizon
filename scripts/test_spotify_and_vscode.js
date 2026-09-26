require('dotenv').config({ override: true });
const { AgentHost } = require('../dist-electron/electron/agent');

async function runTasks() {
  console.log('================================================================');
  console.log('⚡ PROJECT HORIZON: TESTING SPOTIFY & VS CODE WORKSPACE DETECTION');
  console.log('================================================================\n');

  const host = new AgentHost();
  const coordinator = host.getCoordinator();

  // Task 1: Launch Spotify
  console.log('--- Task 1: Launch Spotify on device ---');
  const spotifySession = await coordinator.executeTask(
    'live-spotify-' + Date.now(),
    'Open Spotify on my device'
  );
  console.log(`- Status: ${spotifySession.status}`);
  console.log(`- Narration: "${spotifySession.currentNarration}"`);
  spotifySession.steps.forEach(s => {
    console.log(`  Step Tool: ${s.toolName}, Status: ${s.status}, Result: ${JSON.stringify(s.result)}`);
  });

  // Task 2: Check open folder in VS Code
  console.log('\n--- Task 2: Check which folder is open in VS Code ---');
  const workspaceSession = await coordinator.executeTask(
    'live-vscode-ws-' + Date.now(),
    'Check which folder is open in VS Code'
  );
  console.log(`- Status: ${workspaceSession.status}`);
  console.log(`- Narration: "${workspaceSession.currentNarration}"`);
  workspaceSession.steps.forEach(s => {
    console.log(`  Step Tool: ${s.toolName}, Status: ${s.status}, Result: ${JSON.stringify(s.result)}`);
  });

  console.log('\n--- Local System Knowledge Graph Stats ---');
  const graph = coordinator.getSystemGraph();
  console.log(graph.getStats());

  host.close();
}

runTasks().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

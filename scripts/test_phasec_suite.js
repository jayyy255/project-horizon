const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Import compiled dist-electron
const distAgentPath = path.resolve(__dirname, '../dist-electron/electron/agent');
const { CommandCache } = require(path.join(distAgentPath, 'cache'));
const { AgentCoordinator } = require(path.join(distAgentPath, 'coordinator'));
const { SafetyGate } = require(path.join(distAgentPath, 'gate'));
const { ProjectIndexer } = require(path.join(distAgentPath, 'indexer'));
const { InputSynthesizer } = require(path.join(distAgentPath, 'synthesizer'));
const { AuditDatabase } = require(path.join(distAgentPath, 'db'));

const testDbPath = path.join(__dirname, 'test_cache.db');
const testAuditDbPath = path.join(__dirname, 'test_cache_audit.db');
const testIndexerDbPath = path.join(__dirname, 'test_cache_indexer.db');

function cleanup() {
  [testDbPath, testDbPath + '-wal', testDbPath + '-shm',
   testAuditDbPath, testAuditDbPath + '-wal', testAuditDbPath + '-shm',
   testIndexerDbPath, testIndexerDbPath + '-wal', testIndexerDbPath + '-shm'].forEach(f => {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
  });
}

async function runPhaseCSuite() {
  console.log('================================================================');
  console.log('PHASE C TEST SUITE: Learned Per-User Command Cache Verification');
  console.log('================================================================\n');

  cleanup();

  const results = [];
  const cache = new CommandCache(testDbPath, 'test_secret_key_phase_c_2026');

  try {
    // -------------------------------------------------------------
    // Test 1: 3x Consecutive Promotion Rule
    // -------------------------------------------------------------
    console.log('[Test 1] 3x Consecutive Promotion Rule...');
    const instruction = 'open dev terminal';
    const actionPlan = {
      tool_name: 'launch_app',
      args: { app_name: 'cmd.exe', executable_path: 'C:\\Windows\\System32\\cmd.exe' },
      narration: 'Open Windows Command Prompt',
      provenance: 'user_task'
    };

    const res1 = cache.recordVerifiedSuccess('user_1', instruction, actionPlan);
    const lookup1 = cache.lookup('user_1', instruction);

    const res2 = cache.recordVerifiedSuccess('user_1', instruction, actionPlan);
    const lookup2 = cache.lookup('user_1', instruction);

    const res3 = cache.recordVerifiedSuccess('user_1', instruction, actionPlan);
    const lookup3 = cache.lookup('user_1', instruction);

    const pass1 = (
      res1.promoted === false && res1.currentCount === 1 && lookup1 === null &&
      res2.promoted === false && res2.currentCount === 2 && lookup2 === null &&
      res3.promoted === true && res3.currentCount === 3 && lookup3 !== null &&
      lookup3.tool_name === 'launch_app'
    );

    results.push({
      test: '1. 3x Promotion Rule',
      passed: pass1,
      details: `Count progression: ${res1.currentCount} -> ${res2.currentCount} -> ${res3.currentCount}; Promoted on 3rd: ${res3.promoted}`
    });
    console.log(`  => ${pass1 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 2: Encryption at Rest in SQLite
    // -------------------------------------------------------------
    console.log('\n[Test 2] Encryption at Rest (AES-256-GCM)...');
    const rawRow = cache.getRawEncryptedRow('user_1', instruction);
    const pass2 = (
      rawRow !== null &&
      typeof rawRow.encrypted_action_plan === 'string' &&
      rawRow.encrypted_action_plan.length > 20 &&
      typeof rawRow.iv === 'string' &&
      rawRow.iv.length === 24 && // 12 bytes hex
      typeof rawRow.auth_tag === 'string' &&
      rawRow.auth_tag.length === 32 && // 16 bytes hex
      !rawRow.encrypted_action_plan.includes('cmd.exe') &&
      !rawRow.encrypted_action_plan.includes('launch_app')
    );

    results.push({
      test: '2. Encryption at Rest (AES-256-GCM)',
      passed: pass2,
      details: `Ciphertext stored with IV length ${rawRow?.iv?.length} and AuthTag length ${rawRow?.auth_tag?.length}; No plaintext leakage`
    });
    console.log(`  => ${pass2 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 3: Coordinate Clicks (click_element) Strictly Forbidden
    // -------------------------------------------------------------
    console.log('\n[Test 3] Coordinate Click Restriction...');
    const clickInstruction = 'click submit button at top';
    const clickAction = {
      tool_name: 'click_element',
      args: { x: 500, y: 300, visual_delta: { expected_change: 'modal_closed' } },
      narration: 'Click submit button',
      provenance: 'user_task'
    };

    const clickRes1 = cache.recordVerifiedSuccess('user_1', clickInstruction, clickAction);
    const clickRes2 = cache.recordVerifiedSuccess('user_1', clickInstruction, clickAction);
    const clickRes3 = cache.recordVerifiedSuccess('user_1', clickInstruction, clickAction);
    const clickLookup = cache.lookup('user_1', clickInstruction);

    const pass3 = (
      clickRes1.promoted === false && clickRes1.currentCount === 0 &&
      clickRes2.promoted === false && clickRes2.currentCount === 0 &&
      clickRes3.promoted === false && clickRes3.currentCount === 0 &&
      clickLookup === null
    );

    results.push({
      test: '3. Coordinate Click Exclusion',
      passed: pass3,
      details: `click_element blocked from caching: promoted=${clickRes3.promoted}, count=${clickRes3.currentCount}`
    });
    console.log(`  => ${pass3 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 4: Invalidation upon Missing/Deleted Executable Target
    // -------------------------------------------------------------
    console.log('\n[Test 4] Target Existence Validity Check...');
    const tempExe = path.join(__dirname, 'temp_test_tool.exe');
    fs.writeFileSync(tempExe, 'MOCK_EXE_CONTENT');

    const tempInstruction = 'run my custom temp tool';
    const tempAction = {
      tool_name: 'launch_app',
      args: { app_name: 'temp_tool', executable_path: tempExe },
      narration: 'Run temporary custom tool',
      provenance: 'user_task'
    };

    cache.recordVerifiedSuccess('user_1', tempInstruction, tempAction);
    cache.recordVerifiedSuccess('user_1', tempInstruction, tempAction);
    cache.recordVerifiedSuccess('user_1', tempInstruction, tempAction);

    const validBeforeDelete = cache.lookup('user_1', tempInstruction);

    // Delete executable on disk
    fs.unlinkSync(tempExe);

    const validAfterDelete = cache.lookup('user_1', tempInstruction);

    const pass4 = validBeforeDelete !== null && validAfterDelete === null;
    results.push({
      test: '4. Staleness / File Deletion Invalidation',
      passed: pass4,
      details: `Lookup before deletion: valid; Lookup after file deletion: invalidated (null)`
    });
    console.log(`  => ${pass4 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 5: Failure Resets Consecutive Promotion Streak
    // -------------------------------------------------------------
    console.log('\n[Test 5] Failure Resets Consecutive Promotion Streak...');
    const flakeInstruction = 'find flaky build output';
    const flakeAction = {
      tool_name: 'find_path',
      args: { search_term: 'output.log' },
      narration: 'Find flaky build log file',
      provenance: 'user_task'
    };

    cache.recordVerifiedSuccess('user_1', flakeInstruction, flakeAction);
    cache.recordVerifiedSuccess('user_1', flakeInstruction, flakeAction);
    // 2 successes recorded so far
    // Now record failure
    cache.recordFailure('user_1', flakeInstruction);

    // Next success should be count 1, not 3
    const nextRes = cache.recordVerifiedSuccess('user_1', flakeInstruction, flakeAction);
    const pass5 = nextRes.currentCount === 1 && nextRes.promoted === false;

    results.push({
      test: '5. Streak Reset on Failure',
      passed: pass5,
      details: `Count reset after recordFailure: new count=${nextRes.currentCount}, promoted=${nextRes.promoted}`
    });
    console.log(`  => ${pass5 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 6: Per-User Scoping Isolation
    // -------------------------------------------------------------
    console.log('\n[Test 6] Multi-User Isolation...');
    const user1Lookup = cache.lookup('user_1', instruction);
    const user2Lookup = cache.lookup('user_2', instruction);

    const pass6 = user1Lookup !== null && user2Lookup === null;
    results.push({
      test: '6. User Scoping Isolation',
      passed: pass6,
      details: `user_1 lookup hit: ${Boolean(user1Lookup)}, user_2 lookup hit: ${Boolean(user2Lookup)}`
    });
    console.log(`  => ${pass6 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 7: Hard Invariant 1 - Cached Plan Still Triggers Tier 2 Gate
    // -------------------------------------------------------------
    console.log('\n[Test 7] Cached Plan Gate & Tier 2 Invariant...');
    const safetyGate = new SafetyGate({ allowedProjectRoots: [process.cwd()] });
    const auditDb = new AuditDatabase(testAuditDbPath);
    const projectIndexer = new ProjectIndexer(testIndexerDbPath);
    const synthesizer = new InputSynthesizer({ width: 1920, height: 1080 }, () => {});

    // Create a Tier 2 action: launch shell with command arguments requiring confirmation
    const dangerousInstruction = 'restart network adapter via powershell';
    const dangerousAction = {
      tool_name: 'launch_app',
      args: {
        app_name: 'powershell.exe',
        executable_path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        args: ['-Command', 'Restart-NetAdapter -Name Wi-Fi']
      },
      narration: 'Restart network adapter via privileged PowerShell',
      provenance: 'user_task'
    };

    // Promote to cache
    cache.recordVerifiedSuccess('default_user', dangerousInstruction, dangerousAction);
    cache.recordVerifiedSuccess('default_user', dangerousInstruction, dangerousAction);
    cache.recordVerifiedSuccess('default_user', dangerousInstruction, dangerousAction);

    // Retrieve from cache
    const retrieved = cache.lookup('default_user', dangerousInstruction);
    const evaluation = safetyGate.evaluate('sess-test-tier2', retrieved);

    const pass7 = (
      retrieved !== null &&
      evaluation.allowed === true &&
      evaluation.tier === 2 &&
      evaluation.tier2Payload !== undefined
    );

    results.push({
      test: '7. Cached Plan Must Undergo Safety Gate & Tier 2 Invariant',
      passed: pass7,
      details: `Tier=${evaluation.tier}, Awaiting Tier 2 payload present=${Boolean(evaluation.tier2Payload)}`
    });
    console.log(`  => ${pass7 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 8: End-to-End Coordinator Replay from Cache
    // -------------------------------------------------------------
    console.log('\n[Test 8] End-to-End Coordinator Replay from Cache...');
    const coordinator = new AgentCoordinator(safetyGate, projectIndexer, synthesizer, auditDb);

    // Seed coordinator cache with a verified action
    const coordCache = coordinator.getCommandCache();
    const e2eInstruction = 'search index for project config';
    const e2eAction = {
      tool_name: 'find_path',
      args: { search_term: 'package.json' },
      narration: 'Find package configuration file in indexed workspace',
      provenance: 'user_task'
    };

    coordCache.recordVerifiedSuccess('default_user', e2eInstruction, e2eAction);
    coordCache.recordVerifiedSuccess('default_user', e2eInstruction, e2eAction);
    coordCache.recordVerifiedSuccess('default_user', e2eInstruction, e2eAction);

    // Execute through coordinator without planner override
    const e2eSession = await coordinator.executeTask('sess-cache-e2e', e2eInstruction);

    const pass8 = (
      e2eSession.status === 'done' &&
      e2eSession.steps.length === 1 &&
      e2eSession.steps[0].narration.includes('[Command Cache]') &&
      e2eSession.steps[0].status === 'succeeded'
    );

    results.push({
      test: '8. End-to-End Coordinator Replay',
      passed: pass8,
      details: `Session status: ${e2eSession.status}, Step Narration: ${e2eSession.steps[0]?.narration}`
    });
    console.log(`  => ${pass8 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 9: Validity Hash Invalidation on Binary Modification
    // -------------------------------------------------------------
    console.log('\n[Test 9] Validity Hash Invalidation on Binary Modification...');
    const modExe = path.join(__dirname, 'temp_mod_tool.exe');
    fs.writeFileSync(modExe, 'INITIAL_BIN_CONTENT');

    const modInstruction = 'run modifiable binary tool';
    const modAction = {
      tool_name: 'launch_app',
      args: { app_name: 'mod_tool', executable_path: modExe },
      narration: 'Run modifiable binary tool',
      provenance: 'user_task'
    };

    cache.recordVerifiedSuccess('user_1', modInstruction, modAction);
    cache.recordVerifiedSuccess('user_1', modInstruction, modAction);
    cache.recordVerifiedSuccess('user_1', modInstruction, modAction);

    const validBeforeMod = cache.lookup('user_1', modInstruction);

    // Modify file content and mtime
    fs.appendFileSync(modExe, '_MODIFIED_BYTES_ADDED_HERE');

    const validAfterMod = cache.lookup('user_1', modInstruction);
    try { fs.unlinkSync(modExe); } catch {}

    const pass9 = validBeforeMod !== null && validAfterMod === null;
    results.push({
      test: '9. Hash Invalidation on File Modification',
      passed: pass9,
      details: `Lookup before mod: valid; Lookup after binary mod: invalidated (null)`
    });
    console.log(`  => ${pass9 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // -------------------------------------------------------------
    // Test 10: In-Memory Fallback Operation
    // -------------------------------------------------------------
    console.log('\n[Test 10] In-Memory Fallback Operation...');
    const memCache = new CommandCache(':memory:', 'mem_secret_2026');
    const memInstruction = 'launch memory test app';
    const memAction = {
      tool_name: 'launch_app',
      args: { app_name: 'cmd.exe', executable_path: 'C:\\Windows\\System32\\cmd.exe' },
      narration: 'Open Windows Command Prompt in memory',
      provenance: 'user_task'
    };

    memCache.recordVerifiedSuccess('user_mem', memInstruction, memAction);
    memCache.recordVerifiedSuccess('user_mem', memInstruction, memAction);
    const memRes3 = memCache.recordVerifiedSuccess('user_mem', memInstruction, memAction);
    const memLookup = memCache.lookup('user_mem', memInstruction);

    const pass10 = (
      memRes3.promoted === true &&
      memLookup !== null &&
      memLookup.tool_name === 'launch_app'
    );

    results.push({
      test: '10. In-Memory Store Promotion & Replay',
      passed: pass10,
      details: `In-memory 3x promotion: ${memRes3.promoted}; lookup hit: ${Boolean(memLookup)}`
    });
    console.log(`  => ${pass10 ? 'PASS' : 'FAIL'} (${results[results.length - 1].details})`);

    // Clean up
    cache.close();
    memCache.close();
    projectIndexer.close();
    auditDb.close();

  } finally {
    cleanup();
  }

  console.log('\n================================================================');
  console.log('PHASE C TEST SUITE RESULTS:');
  console.log('================================================================');
  let allPassed = true;
  results.forEach(r => {
    if (!r.passed) allPassed = false;
    console.log(`${r.passed ? '✓ PASS' : '✗ FAIL'}: ${r.test} - ${r.details}`);
  });
  console.log('================================================================');
  console.log(`Summary: ${results.filter(r => r.passed).length}/${results.length} tests passed (${allPassed ? '100% SUCCESS' : 'FAILURES PRESENT'})`);
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runPhaseCSuite().catch(err => {
  console.error('[Phase C Suite FATAL Error]', err);
  process.exit(1);
});

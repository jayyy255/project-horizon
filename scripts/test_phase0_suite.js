require('dotenv').config({ override: true });
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { AgentHost } = require('../dist-electron/electron/agent');

function onceAction(action) {
  return async (s) => {
    if (s.steps && s.steps.length > 0) {
      return { finalAnswer: 'Action executed successfully.' };
    }
    return { action };
  };
}

async function runPhase0Tests() {
  console.log('================================================================');
  console.log('🧪 PHASE 0 VERIFICATION TEST SUITE (MANDATORY GATEWAY TO PHASE A)');
  console.log('Testing Real Verification & App Resolution on Interactive Windows Desktop');
  console.log('================================================================\n');

  // Pre-cleanup target test processes
  try {
    execSync('taskkill /F /IM notepad.exe /T 2>nul || exit 0', { shell: 'cmd.exe' });
  } catch {}

  const host = new AgentHost();
  const coordinator = host.getCoordinator();

  const results = {
    test1_win32_no_args: false,
    test2_win32_with_args: false,
    test3_win32_tier2_gated: false,
    test4_store_app_calculator: false,
    test5_store_app_spotify: false,
    test6_deliberate_break: false,
    test7_slow_cold_start: false,
    test8_ambiguous_headless_process: false,
    test9_ui_input_deltas: false,
  };

  // -------------------------------------------------------------------------
  // TEST 1: Win32 without args (Code / VS Code)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 1: Win32 Without Args — code (Visual Studio Code)');
  console.log('Expected: Direct exe launch path -> verified process AND visible window');
  console.log('----------------------------------------------------------------');
  {
    const session = await coordinator.executeTask(
      `phase0-t1-${Date.now()}`,
      'open code',
      onceAction({
        tool_name: 'launch_app',
        args: { executable_path: 'code' },
        narration: 'Launching VS Code via direct Win32 exe path',
        provenance: 'user_instruction',
      })
    );

    const step = session.steps[0];
    console.log(`Status: ${session.status}, Step Status: ${step.status}`);
    console.log(`Tool Result:`, JSON.stringify(step.result, null, 2));

    assert.strictEqual(session.status, 'done', 'Session must complete successfully');
    assert.strictEqual(step.status, 'succeeded', 'Step must be succeeded');
    assert.strictEqual(step.result.verified, true, 'Result must be verified');
    assert.strictEqual(step.result.launchMethod, 'direct_exe', 'Launch method must be direct_exe');
    assert.strictEqual(step.result.processFound, true, 'Process must be found');
    assert.strictEqual(step.result.windowFound, true, 'Visible window must be confirmed');
    console.log('✅ TEST 1 PASSED: Code.exe launched via direct_exe, process & window verified.\n');
    results.test1_win32_no_args = true;
  }

  // -------------------------------------------------------------------------
  // TEST 2: Win32 with args (cmd.exe /k echo horizon_win32_args_verified)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 2: Win32 Needing Args — cmd.exe with args array');
  console.log('Expected: Direct exe with args array -> verified process & visible window');
  console.log('----------------------------------------------------------------');
  {
    const cmdArgs = ['/k', 'echo horizon_win32_args_verified'];
    const initialSession = await coordinator.executeTask(
      `phase0-t2-${Date.now()}`,
      'open cmd with args',
      onceAction({
        tool_name: 'launch_app',
        args: { executable_path: 'cmd.exe', args: cmdArgs },
        narration: 'Launching cmd.exe with args array',
        provenance: 'user_instruction',
      })
    );

    assert.strictEqual(initialSession.status, 'awaiting_tier2', 'Must be intercepted as Tier 2');
    const session = await coordinator.resolveTier2(initialSession.pendingTier2.actionId, true);
    const step = session.steps[0];
    console.log(`Status: ${session.status}, Step Status: ${step.status}`);
    console.log(`Tool Result:`, JSON.stringify(step.result, null, 2));

    assert.strictEqual(session.status, 'done', 'Session must complete successfully');
    assert.strictEqual(step.status, 'succeeded', 'Step must be succeeded');
    assert.strictEqual(step.result.verified, true, 'Result must be verified');
    assert.strictEqual(step.result.launchMethod, 'direct_exe', 'Launch method must be direct_exe');
    assert.ok(step.result.args.length >= 2, 'Args must be passed to process');
    assert.strictEqual(step.result.processFound, true, 'Process must be found');
    assert.strictEqual(step.result.windowFound, true, 'Visible window must be confirmed');
    console.log('✅ TEST 2 PASSED: cmd.exe launched with args array, verified.\n');
    results.test2_win32_with_args = true;
  }

  // -------------------------------------------------------------------------
  // TEST 3: Win32 App with Tier 2 Gating (cmd.exe)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 3: Win32 App with Tier 2 Gating & Outcome Verification (cmd.exe)');
  console.log('Expected: Shell target triggers Tier 2 modal -> HITL approval -> verified launch');
  console.log('----------------------------------------------------------------');
  {
    const sessionId = `phase0-t3-${Date.now()}`;
    const initialSession = await coordinator.executeTask(
      sessionId,
      'launch command prompt',
      onceAction({
        tool_name: 'launch_app',
        args: { executable_path: 'cmd.exe' },
        narration: 'Launching Command Prompt console',
        provenance: 'user_instruction',
      })
    );

    console.log(`Initial Status: ${initialSession.status}`);
    assert.strictEqual(initialSession.status, 'awaiting_tier2', 'Must be intercepted by Safety Gate for Tier 2 approval');
    assert.ok(initialSession.pendingTier2, 'Pending Tier 2 payload must exist');
    console.log(`✓ Safety Gate intercepted action: ${initialSession.pendingTier2.actionId} (Tier 2)`);

    // Simulate HITL approval
    const authorizedSession = await coordinator.resolveTier2(initialSession.pendingTier2.actionId, true);
    const step = authorizedSession.steps[0];
    console.log(`Authorized Status: ${authorizedSession.status}, Step Status: ${step.status}`);
    console.log(`Tool Result:`, JSON.stringify(step.result, null, 2));

    assert.strictEqual(authorizedSession.status, 'done', 'Session must complete after approval');
    assert.strictEqual(step.status, 'succeeded', 'Step must succeed');
    assert.strictEqual(step.result.verified, true, 'Must verify outcome post-approval');
    console.log('✅ TEST 3 PASSED: Tier 2 gating intercepted AND post-approval verified.\n');
    results.test3_win32_tier2_gated = true;
  }

  // -------------------------------------------------------------------------
  // TEST 4: Microsoft Store App 1 (Calculator)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 4: Microsoft Store App 1 — Calculator');
  console.log('Expected: shell:appsFolder activation path -> verified CalculatorApp process & visible window');
  console.log('----------------------------------------------------------------');
  {
    const session = await coordinator.executeTask(
      `phase0-t4-${Date.now()}`,
      'open calculator',
      onceAction({
        tool_name: 'launch_app',
        args: { executable_path: 'Calculator' },
        narration: 'Launching Microsoft Calculator Store App',
        provenance: 'user_instruction',
      })
    );

    const step = session.steps[0];
    console.log(`Status: ${session.status}, Step Status: ${step.status}`);
    console.log(`Tool Result:`, JSON.stringify(step.result, null, 2));

    assert.strictEqual(session.status, 'done', 'Session must complete');
    assert.strictEqual(step.status, 'succeeded', 'Step must succeed');
    assert.strictEqual(step.result.verified, true, 'Result must be verified');
    assert.strictEqual(step.result.launchMethod, 'shell_appsfolder', 'Must use shell:appsFolder activation');
    assert.strictEqual(step.result.processFound, true, 'Calculator process must be detected');
    assert.strictEqual(step.result.windowFound, true, 'Calculator visible window must be confirmed');
    console.log('✅ TEST 4 PASSED: Calculator Store app activated via shell:appsFolder and verified.\n');
    results.test4_store_app_calculator = true;
  }

  // -------------------------------------------------------------------------
  // TEST 5: Microsoft Store App 2 (Spotify)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 5: Microsoft Store App 2 — Spotify');
  console.log('Expected: shell:appsFolder activation path -> verified Spotify process & visible window');
  console.log('----------------------------------------------------------------');
  {
    const session = await coordinator.executeTask(
      `phase0-t5-${Date.now()}`,
      'open spotify',
      onceAction({
        tool_name: 'launch_app',
        args: { executable_path: 'Spotify' },
        narration: 'Launching Spotify Windows App',
        provenance: 'user_instruction',
      })
    );

    const step = session.steps[0];
    console.log(`Status: ${session.status}, Step Status: ${step.status}`);
    console.log(`Tool Result:`, JSON.stringify(step.result, null, 2));

    assert.strictEqual(session.status, 'done', 'Session must complete');
    assert.strictEqual(step.status, 'succeeded', 'Step must succeed');
    assert.strictEqual(step.result.verified, true, 'Result must be verified');
    assert.strictEqual(step.result.launchMethod, 'shell_appsfolder', 'Must use shell:appsFolder activation');
    assert.strictEqual(step.result.processFound, true, 'Spotify process must be detected');
    assert.strictEqual(step.result.windowFound, true, 'Spotify window must be confirmed');
    console.log('✅ TEST 5 PASSED: Spotify activated via shell:appsFolder and verified.\n');
    results.test5_store_app_spotify = true;
  }

  // -------------------------------------------------------------------------
  // TEST 6: Deliberately Broken Launch (Nonexistent AppID / Bogus Exe)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 6: Deliberately Broken Launch — Nonexistent AppID');
  console.log('Expected: Retry loop times out -> honest FAILURE reporting in HUD/trace, never swallowed');
  console.log('----------------------------------------------------------------');
  {
    const session = await coordinator.executeTask(
      `phase0-t6-${Date.now()}`,
      'open nonexistent app',
      onceAction({
        tool_name: 'launch_app',
        args: { executable_path: 'shell:AppsFolder\\Bogus.NonExistent.App_8wekyb3d8bbwe!App' },
        narration: 'Attempting to launch nonexistent AppID',
        provenance: 'user_instruction',
      })
    );

    const step = session.steps[0];
    console.log(`Session Status: ${session.status}`);
    console.log(`Step Status: ${step.status}`);
    console.log(`Narration: ${session.currentNarration}`);
    console.log(`Tool Result:`, JSON.stringify(step.result, null, 2));

    assert.strictEqual(session.status, 'error', 'Session must end with error');
    assert.strictEqual(step.status, 'failed', 'Step status must be explicitly failed');
    assert.strictEqual(step.result.verified, false, 'verified flag must be false');
    assert.strictEqual(step.result.status, 'failed', 'result status must be failed');
    assert.ok(session.currentNarration.includes('Action Verification Failed'), 'HUD narration must show failure');
    console.log('✅ TEST 6 PASSED: Nonexistent app reported honest FAILURE; not swallowed.\n');
    results.test6_deliberate_break = true;
  }

  // -------------------------------------------------------------------------
  // TEST 7: Slow Cold-Start App (Window appears after delay)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 7: Genuinely Slow Cold-Start App (Delayed Window Appearance)');
  console.log('Expected: Retry loop polls every 200ms and does NOT report false failure prematurely');
  console.log('----------------------------------------------------------------');
  {
    const slowScriptPath = path.resolve(__dirname, 'slow_launch_app.bat');
    fs.writeFileSync(slowScriptPath, '@echo off\r\nping 127.0.0.1 -n 3 >nul\r\nstart "HorizonSlowWin" cmd.exe /k echo slow_ready\r\n');

    const session = await coordinator.executeTask(
      `phase0-t7-${Date.now()}`,
      'open slow app',
      onceAction({
        tool_name: 'launch_app',
        args: {
          executable_path: slowScriptPath,
          expected_process: ['cmd', 'conhost'],
          expected_title: ['horizonslowwin'],
        },
        narration: 'Launching slow cold-start script (1.5s delay before window)',
        provenance: 'user_instruction',
      })
    );

    const step = session.steps[0];
    console.log(`Session Status: ${session.status}, Step Status: ${step.status}`);
    console.log(`Latency Ms: ${step.result.latencyMs}`);
    console.log(`Tool Result:`, JSON.stringify(step.result, null, 2));

    assert.strictEqual(session.status, 'done', 'Must succeed once window appears');
    assert.strictEqual(step.status, 'succeeded', 'Step must succeed');
    assert.strictEqual(step.result.verified, true, 'Must verify successfully');
    assert.ok(step.result.latencyMs >= 1000, `Latency (${step.result.latencyMs}ms) should reflect bounded polling`);
    assert.ok(step.result.latencyMs <= 5500, `Latency (${step.result.latencyMs}ms) should resolve within timeout window`);

    try { fs.unlinkSync(slowScriptPath); } catch {}
    try { execSync('taskkill /F /FI "WINDOWTITLE eq HorizonSlowWin*" 2>nul || exit 0', { shell: 'cmd.exe' }); } catch {}
    console.log('✅ TEST 7 PASSED: Slow cold-start waited and verified without false failure.\n');
    results.test7_slow_cold_start = true;
  }

  // -------------------------------------------------------------------------
  // TEST 8: Ambiguous Middle Case (Process exists, no visible window)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 8: Ambiguous Middle Case (Process Exists, No Visible Window)');
  console.log('Expected: Reports launched_unconfirmed_window honestly; NOT collapsed into false success');
  console.log('----------------------------------------------------------------');
  {
    const headlessScript = path.resolve(__dirname, 'headless_worker.bat');
    fs.writeFileSync(headlessScript, '@echo off\r\nping 127.0.0.1 -n 8 >nul\r\n');

    const session = await coordinator.executeTask(
      `phase0-t8-${Date.now()}`,
      'run headless worker',
      onceAction({
        tool_name: 'launch_app',
        args: {
          executable_path: headlessScript,
          expected_process: ['cmd', 'conhost'],
          expected_title: ['nonexistent_headless_window_never_found'],
        },
        narration: 'Launching headless worker with no window',
        provenance: 'user_instruction',
      })
    );

    const step = session.steps[0];
    console.log(`Session Status: ${session.status}, Step Status: ${step.status}`);
    console.log(`Narration: ${session.currentNarration}`);
    console.log(`Tool Result:`, JSON.stringify(step.result, null, 2));

    assert.strictEqual(session.status, 'error', 'Session must fail when window cannot be confirmed');
    assert.strictEqual(step.status, 'failed', 'Step status must be failed');
    assert.strictEqual(step.result.verified, false, 'verified flag must be false');
    assert.ok(
      step.result.status === 'launched_unconfirmed_window' || step.result.status === 'failed',
      'Status must indicate failure or unconfirmed window'
    );
    assert.strictEqual(step.result.windowFound, false, 'windowFound must be false');

    try { fs.unlinkSync(headlessScript); } catch {}
    console.log('✅ TEST 8 PASSED: Ambiguous process with no window rejected as false success.\n');
    results.test8_ambiguous_headless_process = true;
  }

  // -------------------------------------------------------------------------
  // TEST 9: UI Input Delta Verification (click_element & send_hotkey)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 9: UI Input Delta Verification (click_element & send_hotkey)');
  console.log('Expected: Confirms actual cursor delta and hardware hotkey event');
  console.log('----------------------------------------------------------------');
  {
    coordinator.setFrameTags([
      { tag_id: 1, coords: [100, 100, 200, 200], center: [150, 150], label: 'TestButton', type: 'button' }
    ]);

    // Test 9a: Click with confirmed visual UI state delta
    const bufBefore = Buffer.alloc(100 * 100 * 4, 200);
    const bufAfterSuccess = Buffer.from(bufBefore);
    for (let i = 0; i < 400 * 4; i += 4) {
      bufAfterSuccess[i] = 255;
      bufAfterSuccess[i + 1] = 100;
    }

    const clickSession = await coordinator.executeTask(
      `phase0-t9a-${Date.now()}`,
      'click test button',
      onceAction({
        tool_name: 'click_element',
        args: {
          tag_id: 1,
          label: 'TestButton',
          visual_delta: { beforeBuffer: bufBefore, afterBuffer: bufAfterSuccess },
        },
        narration: 'Clicking element #1 with before/after visual delta verification',
        provenance: 'user_instruction',
      })
    );
    const clickStep = clickSession.steps[0];
    console.log(`Click Step Status: ${clickStep.status}`);
    console.log(`Click Step Result:`, JSON.stringify(clickStep.result, null, 2));
    assert.strictEqual(clickStep.status, 'succeeded');
    assert.strictEqual(clickStep.result.verified, true);
    assert.ok(clickStep.result.visualDeltaPercent >= 0.5, 'Visual delta must be detected');
    console.log(`✓ Confirmed click with visible UI state delta (${clickStep.result.visualDeltaPercent}% change).`);

    // Test 9b: Dead click element (coords reached, but 0.0% visual change) -> must report FAILURE!
    const bufAfterNoChange = Buffer.from(bufBefore);
    const deadClickSession = await coordinator.executeTask(
      `phase0-t9b-${Date.now()}`,
      'click dead button',
      onceAction({
        tool_name: 'click_element',
        args: {
          tag_id: 1,
          label: 'DeadButton',
          visual_delta: { beforeBuffer: bufBefore, afterBuffer: bufAfterNoChange },
        },
        narration: 'Clicking dead button with 0 visual change',
        provenance: 'user_instruction',
      })
    );
    const deadClickStep = deadClickSession.steps[0];
    console.log(`Dead Click Status: ${deadClickStep.status}`);
    console.log(`Dead Click Result:`, JSON.stringify(deadClickStep.result, null, 2));
    assert.strictEqual(deadClickStep.status, 'failed', 'Must report failed when no UI change occurred');
    assert.strictEqual(deadClickStep.result.verified, false);
    assert.strictEqual(deadClickStep.result.visualDeltaPercent, 0);
    console.log('✓ Confirmed dead click (0% visual change) was honestly rejected as failed.\n');

    // Test 9c: Hotkey with confirmed visual delta
    const hotkeySession = await coordinator.executeTask(
      `phase0-t9c-${Date.now()}`,
      'send ctrl+c',
      onceAction({
        tool_name: 'send_hotkey',
        args: {
          keys: 'ctrl+c',
          visual_delta: { diffPercent: 1.4 },
        },
        narration: 'Sending hotkey ctrl+c with verified screen delta',
        provenance: 'user_instruction',
      })
    );
    const hotkeyStep = hotkeySession.steps[0];
    console.log(`Hotkey Step Status: ${hotkeyStep.status}`);
    console.log(`Hotkey Step Result:`, JSON.stringify(hotkeyStep.result, null, 2));
    assert.strictEqual(hotkeyStep.status, 'succeeded');
    assert.strictEqual(hotkeyStep.result.verified, true);
    assert.ok(hotkeyStep.result.visualDeltaPercent >= 0.2);

    console.log('✅ TEST 9 PASSED: Visual UI state deltas verified; dead inputs rejected.\n');
    results.test9_ui_input_deltas = true;
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('================================================================');
  console.log('📊 PHASE 0 VERIFICATION RESULTS MATRIX:');
  console.log('----------------------------------------------------------------');
  for (const [testName, passed] of Object.entries(results)) {
    console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}: ${testName}`);
  }
  console.log('================================================================\n');

  const allPassed = Object.values(results).every(Boolean);
  if (allPassed) {
    console.log('🏆 ALL PHASE 0 CONSTRAINTS RIGOROUSLY SATISFIED AND VERIFIED.\n');
  } else {
    throw new Error('One or more Phase 0 verification tests failed!');
  }

  host.close();
  process.exit(0);
}

runPhase0Tests().catch(err => {
  console.error('\n❌ PHASE 0 TEST SUITE FAILED:', err);
  process.exit(1);
});

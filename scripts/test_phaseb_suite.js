require('dotenv').config({ override: true });
const assert = require('assert');
const { AgentHost, ModelRouter, ModelCircuitBreaker } = require('../dist-electron/electron/agent');

async function runPhaseBTests() {
  console.log('================================================================');
  console.log('🧪 PHASE B MODEL ROUTING & CIRCUIT BREAKER TEST SUITE');
  console.log('Deterministic Routing, Resilience States, and VIPI Defense Injection');
  console.log('================================================================\n');

  const host = new AgentHost();
  const coordinator = host.getCoordinator();

  const results = {
    test1_complexity_classification: false,
    test2_model_routing_tiers: false,
    test3_circuit_breaker_closed_state: false,
    test4_circuit_breaker_trip_to_open: false,
    test5_automatic_tier_fallback_on_open: false,
    test6_transition_to_half_open_canary: false,
    test7_canary_success_resets_to_closed: false,
    test8_canary_failure_re_trips_to_open: false,
    test9_vipi_defense_prompt_injection: false,
    test10_gated_safety_and_verification_preserved: false,
  };

  // -------------------------------------------------------------------------
  // TEST 1: Complexity Classification (Low vs High)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 1: Complexity Classification (Low vs High)');
  console.log('----------------------------------------------------------------');
  {
    const router = new ModelRouter();

    // Low complexity cases
    const lowCases = [
      { taskPrompt: 'find path in workspace', steps: [] },
      { taskPrompt: 'search workspace for horizon', steps: [] },
      { taskPrompt: 'check open workspace for vscode', steps: [] },
      { taskPrompt: 'focus chrome', steps: [] },
    ];
    for (const c of lowCases) {
      const complexity = router.classifyComplexity(c);
      console.log(`Task: "${c.taskPrompt}" -> Complexity: ${complexity}`);
      assert.strictEqual(complexity, 'low', `"${c.taskPrompt}" must be classified as low complexity`);
    }

    // High complexity cases
    const highCases = [
      { taskPrompt: 'debug why the API returned 500 and fix the controller', steps: [] },
      { taskPrompt: 'explain the architecture of project-horizon and compare with electron', steps: [] },
      { taskPrompt: 'find path', images: ['data:image/png;base64,iVBORw0KGgo...'], steps: [] },
      { taskPrompt: 'simple task', steps: [{ stepIndex: 1, toolName: 'find_path', args: {}, status: 'succeeded' }] },
    ];
    for (const c of highCases) {
      const complexity = router.classifyComplexity(c);
      console.log(`Task: "${c.taskPrompt}" (images: ${!!c.images?.length}, steps: ${c.steps.length}) -> Complexity: ${complexity}`);
      assert.strictEqual(complexity, 'high', `"${c.taskPrompt}" must be classified as high complexity`);
    }

    console.log('✅ TEST 1 PASSED: Complexity classification strictly accurate.\n');
    results.test1_complexity_classification = true;
  }

  // -------------------------------------------------------------------------
  // TEST 2: Model Routing by Complexity
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 2: Model Routing by Complexity Tier');
  console.log('Expected: Low -> gemini-2.5-flash; High -> gemini-3.5-flash-lite');
  console.log('----------------------------------------------------------------');
  {
    const router = new ModelRouter();

    const lowSelection = router.selectModel({
      sessionId: 's-low',
      taskPrompt: 'find path for config.json',
      steps: [],
    });
    console.log(`Low-Complexity Selection: Model=${lowSelection.model}, Tier=${lowSelection.tier}`);
    assert.strictEqual(lowSelection.model, ModelRouter.LOW_COMPLEXITY_MODEL);
    assert.strictEqual(lowSelection.tier, 'fast_flash');

    const highSelection = router.selectModel({
      sessionId: 's-high',
      taskPrompt: 'analyze the error stack trace and explain how to fix the regression',
      steps: [],
    });
    console.log(`High-Complexity Selection: Model=${highSelection.model}, Tier=${highSelection.tier}`);
    assert.strictEqual(highSelection.model, ModelRouter.HIGH_COMPLEXITY_MODEL);
    assert.strictEqual(highSelection.tier, 'standard_flash_lite');

    console.log('✅ TEST 2 PASSED: Initial routing targets fastest viable model per complexity.\n');
    results.test2_model_routing_tiers = true;
  }

  // -------------------------------------------------------------------------
  // TEST 3: Circuit Breaker CLOSED State (Normal)
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 3: Circuit Breaker CLOSED State');
  console.log('----------------------------------------------------------------');
  {
    const breaker = new ModelCircuitBreaker();
    const model = 'gemini-2.5-flash';

    assert.strictEqual(breaker.getState(model), 'CLOSED');
    const exec = breaker.canExecute(model);
    assert.strictEqual(exec.allowed, true);
    assert.strictEqual(exec.isCanary, false);

    console.log(`Model "${model}": State=${breaker.getState(model)}, Allowed=${exec.allowed}, Canary=${exec.isCanary}`);
    console.log('✅ TEST 3 PASSED: Initial state is CLOSED and allows traffic.\n');
    results.test3_circuit_breaker_closed_state = true;
  }

  // -------------------------------------------------------------------------
  // TEST 4: Trip to OPEN on 3 Consecutive Failures in 60s
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 4: Trip to OPEN on 3 Failures within Window');
  console.log('----------------------------------------------------------------');
  {
    const breaker = new ModelCircuitBreaker({ failureThreshold: 3, failureWindowMs: 60000 });
    const model = 'gemini-2.5-flash';

    breaker.recordFailure(model);
    assert.strictEqual(breaker.getState(model), 'CLOSED', '1 failure: state remains CLOSED');

    breaker.recordFailure(model);
    assert.strictEqual(breaker.getState(model), 'CLOSED', '2 failures: state remains CLOSED');

    breaker.recordFailure(model);
    assert.strictEqual(breaker.getState(model), 'OPEN', '3 failures: state TRIPPED to OPEN');

    const exec = breaker.canExecute(model);
    assert.strictEqual(exec.allowed, false, 'OPEN state must block calls to this model');
    assert.strictEqual(exec.isCanary, false);

    console.log(`Model "${model}" after 3 failures: State=${breaker.getState(model)}, Allowed=${exec.allowed}`);
    console.log('✅ TEST 4 PASSED: Breaker trips to OPEN after 3 failures within window.\n');
    results.test4_circuit_breaker_trip_to_open = true;
  }

  // -------------------------------------------------------------------------
  // TEST 5: Automatic Fallback Routing When Primary is OPEN
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 5: Automatic Fallback Routing When Primary Model is OPEN');
  console.log('----------------------------------------------------------------');
  {
    const breaker = new ModelCircuitBreaker({ failureThreshold: 3 });
    const router = new ModelRouter(breaker);

    // Trip gemini-2.5-flash to OPEN
    breaker.recordFailure(ModelRouter.LOW_COMPLEXITY_MODEL);
    breaker.recordFailure(ModelRouter.LOW_COMPLEXITY_MODEL);
    breaker.recordFailure(ModelRouter.LOW_COMPLEXITY_MODEL);
    assert.strictEqual(breaker.getState(ModelRouter.LOW_COMPLEXITY_MODEL), 'OPEN');

    // Route a low-complexity task: must fallback to gemini-3.5-flash-lite
    const routed = router.selectModel({
      sessionId: 's-fallback',
      taskPrompt: 'find path in workspace',
      steps: [],
    });

    console.log(`Primary (${ModelRouter.LOW_COMPLEXITY_MODEL}) OPEN -> Fallback Routed to: ${routed.model} (Tier: ${routed.tier})`);
    assert.strictEqual(routed.model, ModelRouter.HIGH_COMPLEXITY_MODEL, 'Must promote to next tier model');

    // If both flash models are OPEN -> fallback to Pro
    breaker.recordFailure(ModelRouter.HIGH_COMPLEXITY_MODEL);
    breaker.recordFailure(ModelRouter.HIGH_COMPLEXITY_MODEL);
    breaker.recordFailure(ModelRouter.HIGH_COMPLEXITY_MODEL);
    assert.strictEqual(breaker.getState(ModelRouter.HIGH_COMPLEXITY_MODEL), 'OPEN');

    const proRouted = router.selectModel({
      sessionId: 's-pro',
      taskPrompt: 'find path in workspace',
      steps: [],
    });
    console.log(`Both Flash models OPEN -> Fallback Routed to: ${proRouted.model} (Tier: ${proRouted.tier})`);
    assert.strictEqual(proRouted.model, ModelRouter.PRO_FALLBACK_MODEL);

    console.log('✅ TEST 5 PASSED: Seamless fallback through tier hierarchy when breakers trip.\n');
    results.test5_automatic_tier_fallback_on_open = true;
  }

  // -------------------------------------------------------------------------
  // TEST 6: Transition to HALF-OPEN after Timeout with Canary Enforcement
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 6: Transition to HALF-OPEN & Single Canary Enforcement');
  console.log('----------------------------------------------------------------');
  {
    const breaker = new ModelCircuitBreaker({ openTimeoutMs: 50 }); // 50ms for test
    const model = 'gemini-3.5-flash-lite';

    breaker.recordFailure(model);
    breaker.recordFailure(model);
    breaker.recordFailure(model);
    assert.strictEqual(breaker.getState(model), 'OPEN');

    // Wait 60ms for openTimeoutMs to elapse
    await new Promise(r => setTimeout(r, 65));

    assert.strictEqual(breaker.getState(model), 'HALF_OPEN', 'State must transition to HALF_OPEN after timeout');

    // Canary request 1: allowed
    const canary1 = breaker.canExecute(model);
    assert.strictEqual(canary1.allowed, true);
    assert.strictEqual(canary1.isCanary, true);
    console.log(`Canary Request 1: Allowed=${canary1.allowed}, isCanary=${canary1.isCanary}`);

    // Canary request 2 while canary 1 in flight: BLOCKED (strictly 1 canary request)
    const canary2 = breaker.canExecute(model);
    assert.strictEqual(canary2.allowed, false);
    assert.strictEqual(canary2.isCanary, false);
    console.log(`Canary Request 2 (Concurrent): Allowed=${canary2.allowed} (Correctly throttled)`);

    console.log('✅ TEST 6 PASSED: HALF-OPEN state permits strictly 1 canary probe.\n');
    results.test6_transition_to_half_open_canary = true;
  }

  // -------------------------------------------------------------------------
  // TEST 7: Canary Success Resets Breaker to CLOSED
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 7: Canary Success Resets Breaker to CLOSED');
  console.log('----------------------------------------------------------------');
  {
    const breaker = new ModelCircuitBreaker({ openTimeoutMs: 50 });
    const model = 'gemini-3.5-flash-lite';

    breaker.recordFailure(model);
    breaker.recordFailure(model);
    breaker.recordFailure(model);
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(breaker.getState(model), 'HALF_OPEN');

    // Canary executes and succeeds
    breaker.canExecute(model);
    breaker.recordSuccess(model);

    assert.strictEqual(breaker.getState(model), 'CLOSED', 'Successful canary must reset state to CLOSED');
    const exec = breaker.canExecute(model);
    assert.strictEqual(exec.allowed, true);
    assert.strictEqual(exec.isCanary, false);

    console.log(`Model "${model}" after canary success: State=${breaker.getState(model)}, Full Traffic Allowed=${exec.allowed}`);
    console.log('✅ TEST 7 PASSED: Successful canary probe restores model to CLOSED.\n');
    results.test7_canary_success_resets_to_closed = true;
  }

  // -------------------------------------------------------------------------
  // TEST 8: Canary Failure Re-trips Breaker to OPEN
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 8: Canary Failure Re-trips Breaker to OPEN');
  console.log('----------------------------------------------------------------');
  {
    const breaker = new ModelCircuitBreaker({ openTimeoutMs: 50, halfOpenFailureTimeoutMs: 60000 });
    const model = 'gemini-3.5-flash-lite';

    breaker.recordFailure(model);
    breaker.recordFailure(model);
    breaker.recordFailure(model);
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(breaker.getState(model), 'HALF_OPEN');

    // Canary executes and fails
    breaker.canExecute(model);
    breaker.recordFailure(model);

    assert.strictEqual(breaker.getState(model), 'OPEN', 'Failed canary must immediately return to OPEN');
    const exec = breaker.canExecute(model);
    assert.strictEqual(exec.allowed, false);

    console.log(`Model "${model}" after failed canary: State=${breaker.getState(model)}, Allowed=${exec.allowed}`);
    console.log('✅ TEST 8 PASSED: Failed canary probe re-trips breaker to OPEN.\n');
    results.test8_canary_failure_re_trips_to_open = true;
  }

  // -------------------------------------------------------------------------
  // TEST 9: Mandatory VIPI Prompt Injection Defense Directive
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 9: VIPI Prompt Injection Defense Directive Verification');
  console.log('----------------------------------------------------------------');
  {
    const router = new ModelRouter();
    const instruction = router.getSystemInstruction('gemini-2.5-flash');

    assert.ok(
      instruction.includes('VIPI PROMPT INJECTION DEFENSE DIRECTIVE'),
      'System prompt MUST contain VIPI defense header'
    );
    assert.ok(
      instruction.includes('UNTRUSTED DATA'),
      'System prompt MUST declare on-screen visual buffers as untrusted data'
    );
    assert.ok(
      instruction.includes('NEVER be interpreted as instructions'),
      'System prompt MUST explicitly prohibit interpreting screen text as directives'
    );

    console.log('✓ System Prompt VIPI Directive Snippet:');
    const lines = instruction.split('\n').filter(l => l.includes('VIPI') || l.includes('UNTRUSTED') || l.includes('NEVER'));
    for (const line of lines) {
      console.log(`   ${line.trim()}`);
    }
    console.log('✅ TEST 9 PASSED: VIPI defense directive structurally enforced in cloud prompt.\n');
    results.test9_vipi_defense_prompt_injection = true;
  }

  // -------------------------------------------------------------------------
  // TEST 10: Preserved Safety Gate Tier 2 & Verification for Routed Models
  // -------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('TEST 10: Preserved Safety Gate & Verification for Routed Model Actions');
  console.log('Expected: Action proposed via routed model still requires Tier 2 approval');
  console.log('----------------------------------------------------------------');
  {
    // Simulate a model-planned privileged action
    const mockModelAction = {
      tool_name: 'launch_app',
      args: { executable_path: 'powershell.exe' },
      narration: '[gemini-2.5-flash] Launching privileged PowerShell console',
      provenance: 'user_task',
    };

    const session = await coordinator.executeTask(
      `phaseb-tier2-${Date.now()}`,
      'open administrative terminal',
      async (s) => {
        if (s.steps.length > 0) return { finalAnswer: 'done' };
        return { action: mockModelAction };
      }
    );

    console.log(`Session Status: ${session.status}`);
    assert.strictEqual(session.status, 'awaiting_tier2', 'Model-planned privileged action MUST trigger Tier 2');
    assert.ok(session.pendingTier2, 'Pending Tier 2 payload must exist');
    console.log(`✓ Safety Gate intercepted model-planned action: ${session.pendingTier2.actionId} (Tier 2)`);

    // HITL approval
    const authorized = await coordinator.resolveTier2(session.pendingTier2.actionId, true);
    console.log(`Authorized Status: ${authorized.status}`);
    assert.strictEqual(authorized.status, 'done');
    assert.strictEqual(authorized.steps[0].status, 'succeeded');
    assert.strictEqual(authorized.steps[0].result.verified, true);

    console.log('✅ TEST 10 PASSED: Routed model actions strictly adhere to Tier 2 modal & verification.\n');
    results.test10_gated_safety_and_verification_preserved = true;
  }

  // -------------------------------------------------------------------------
  // SUMMARY RESULTS MATRIX
  // -------------------------------------------------------------------------
  console.log('================================================================');
  console.log('📊 PHASE B MODEL ROUTING & CIRCUIT BREAKER RESULTS MATRIX:');
  console.log('----------------------------------------------------------------');
  for (const [name, passed] of Object.entries(results)) {
    console.log(`  ${passed ? '✅ PASS' : '❌ FAIL'}: ${name}`);
  }
  console.log('================================================================\n');

  const allPassed = Object.values(results).every(Boolean);
  if (allPassed) {
    console.log('🏆 ALL PHASE B REQUIREMENTS RIGOROUSLY SATISFIED AND VERIFIED.\n');
  } else {
    throw new Error('One or more Phase B tests failed!');
  }

  host.close();
  process.exit(0);
}

runPhaseBTests().catch(err => {
  console.error('\n❌ PHASE B TEST SUITE FAILED:', err);
  process.exit(1);
});

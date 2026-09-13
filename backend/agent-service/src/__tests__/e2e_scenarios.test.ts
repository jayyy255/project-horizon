import { describe, it, expect } from 'vitest';
import { AgentCoordinator } from '../react/coordinator.js';
import { SafetyGate } from '../safety/gate.js';
import { ProjectIndexer } from '../indexer/fts5_indexer.js';
import { InputSynthesizer } from '../input/synthesizer.js';
import { AuditDatabase } from '../audit/db.js';

describe('TC-E2E-01: Project Resolution & Launch Scenario', () => {
  it('resolves "open my code scanner project in VS Code" via CLI-first strategy in under 2.5s', async () => {
    const startTime = performance.now();

    // 1. Setup isolated microservice components
    const safetyGate = new SafetyGate({
      allowedProjectRoots: ['C:/Users/Developer/workspace', 'C:/Program Files'],
    });

    const indexer = new ProjectIndexer(':memory:');
    indexer.indexItem({
      name: 'code_scanner_v2',
      path: 'C:/Users/Developer/workspace/code-scanner-production',
      manifest_type: 'package.json',
      content: 'Code scanner analysis tool',
    });

    const inputSynthesizer = new InputSynthesizer();
    const auditDb = new AuditDatabase(':memory:');

    const coordinator = new AgentCoordinator(
      safetyGate,
      indexer,
      inputSynthesizer,
      auditDb
    );

    // 2. Execute TC-E2E-01 task
    const taskPrompt = 'Open my code scanner project in VS Code';
    const finalState = await coordinator.executeTask('sess-e2e-01', taskPrompt);

    const totalDuration = performance.now() - startTime;

    // 3. Verify TC-E2E-01 criteria
    expect(finalState.status).toBe('done');
    expect(finalState.steps.length).toBe(2);

    // Step 1 must be find_path
    expect(finalState.steps[0].toolName).toBe('find_path');
    expect(finalState.steps[0].status).toBe('succeeded');
    const searchResults = finalState.steps[0].result as any[];
    expect(searchResults[0].path).toContain('code-scanner-production');

    // Step 2 must be CLI launch_app (CLI-first bias verified over sequential GUI clicks)
    expect(finalState.steps[1].toolName).toBe('launch_app');
    expect(finalState.steps[1].status).toBe('succeeded');
    const launchResult = finalState.steps[1].result as any;
    expect(launchResult.target).toContain('Code.exe');
    expect(launchResult.args).toContain('C:/Users/Developer/workspace/code-scanner-production');

    // Total duration must be well under 2.5s (2500ms) SLA
    expect(totalDuration).toBeLessThan(2500);
    console.log(`[TC-E2E-01] Full scenario completed in ${totalDuration.toFixed(2)}ms (<2500ms SLA)`);

    // 4. Verify TC-I-04: Audit Database integrity check
    const sessionRecord = auditDb.getSession('sess-e2e-01');
    expect(sessionRecord).toBeDefined();
    expect(sessionRecord?.outcome).toBe('succeeded');

    const toolTraces = auditDb.getToolTraces('sess-e2e-01');
    expect(toolTraces.length).toBe(2);
    expect(toolTraces[0].toolName).toBe('find_path');
    expect(toolTraces[1].toolName).toBe('launch_app');
    expect(toolTraces[0].authorized).toBe(true);
    expect(toolTraces[1].authorized).toBe(true);
  });

  it('verifies PII masking pass before audit DB persistence (§8.5)', () => {
    const rawPrompt = 'Inspect user john.doe@company.com with card 4532-1234-5678-9012 and phone +1-555-123-4567';
    const masked = AuditDatabase.maskPII(rawPrompt);

    expect(masked).not.toContain('john.doe@company.com');
    expect(masked).not.toContain('4532-1234-5678-9012');
    expect(masked).not.toContain('555-123-4567');

    expect(masked).toContain('[EMAIL]');
    expect(masked).toContain('[CARD_NUMBER]');
    expect(masked).toContain('[PHONE]');
  });
});

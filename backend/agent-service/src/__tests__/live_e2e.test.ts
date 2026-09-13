import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { httpServer, wss } from '../server.js';
import WebSocket from 'ws';

describe('Live E2E Multi-Service Integration Tests', () => {
  const testPort = 4199;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(testPort, () => {
        console.log(`[E2E] Agent Service test server listening on http://localhost:${testPort}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      wss.clients.forEach((c) => c.terminate());
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  it('Step 1: Validates live Healthcheck endpoint', async () => {
    const healthRes = await fetch(`http://localhost:${testPort}/api/health`);
    expect(healthRes.status).toBe(200);

    const healthData = (await healthRes.json()) as any;
    expect(healthData.status).toBe('ok');
    expect(healthData.service).toBe('horizon-agent-service');
  });

  it('Step 2 & 3: Executes TC-E2E-01 with live WebSocket HUD telemetry streaming', async () => {
    const ws = new WebSocket(`ws://localhost:${testPort}/ws/hud`);
    const receivedTelemetries: any[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      ws.on('message', (msg) => {
        try {
          receivedTelemetries.push(JSON.parse(msg.toString()));
        } catch {
          // ignore
        }
      });
    });

    // Execute TC-E2E-01 over live HTTP endpoint
    const taskRes = await fetch(`http://localhost:${testPort}/api/task/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'live-e2e-task-01',
        prompt: 'Open my code scanner project in VS Code',
      }),
    });

    expect(taskRes.status).toBe(200);
    const taskData = (await taskRes.json()) as any;

    expect(taskData.status).toBe('done');
    expect(taskData.steps.length).toBe(2);
    expect(taskData.steps[0].toolName).toBe('find_path');
    expect(taskData.steps[1].toolName).toBe('launch_app');

    // Verify WebSocket streamed updates
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedTelemetries.length).toBeGreaterThanOrEqual(1);

    ws.close();
  });

  it('Step 4: Tests TC-SEC-03 Tier 2 interception and authorization API flow', async () => {
    // Propose a task that invokes a shell command or destructive operation
    const destructRes = await fetch(`http://localhost:${testPort}/api/task/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'live-tier2-task-02',
        prompt: 'Clean workspace cache using rmdir /s /q temp_build',
      }),
    });

    expect(destructRes.status).toBe(200);
    const destructData = (await destructRes.json()) as any;

    // Verify intercepted state
    expect(destructData.status).toBe('awaiting_tier2');
    expect(destructData.pendingTier2).toBeDefined();
    expect(destructData.pendingTier2.isDestructive).toBe(true);

    // Authorize Tier 2 confirmation via user approval API
    const authRes = await fetch(`http://localhost:${testPort}/api/task/tier2-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: destructData.pendingTier2.actionId,
        authorized: true,
      }),
    });

    expect(authRes.status).toBe(200);
    const authData = (await authRes.json()) as any;
    expect(authData.status).toBe('done');
  });

  it('Step 5: Tests Live FTS5 Indexer Search endpoint', async () => {
    const searchRes = await fetch(`http://localhost:${testPort}/api/indexer/search?q=horizon`);
    expect(searchRes.status).toBe(200);

    const searchData = (await searchRes.json()) as any;
    expect(searchData.query).toBe('horizon');
    expect(Array.isArray(searchData.results)).toBe(true);
  });
});

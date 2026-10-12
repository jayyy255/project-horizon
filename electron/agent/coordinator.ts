import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { SafetyGate, ProposedAction, GateEvaluationResult } from './gate';
import { ProjectIndexer } from './indexer';
import { InputSynthesizer } from './synthesizer';
import { Tier2ActionPayload } from '../../shared/types';
import { AuditDatabase } from './db';
import { SystemKnowledgeGraph } from './graph';
import { ActionVerifier } from './verifier';
import { ReflexiveMatcher } from './reflexive';
import { ModelRouter, ModelCircuitBreaker } from './router';
import { CommandCache } from './cache';
import { agentDataPath } from './sqlite';
import { parseProjectOpen } from './workspaces';
import { RequestLimiter } from './rateLimit';
import { answerImageQuestion, imagePart, isImageQuestion } from './vision';
import { ContextAttachment, LatencyReport } from '../../shared/types';
import { resolveDocuments } from '../attachments';
import { LatencyTrace } from '../latency';
import { useHostedService } from '../cloud';

export interface ReActStep {
  stepIndex: number;
  toolName: string;
  args: Record<string, unknown>;
  narration: string;
  tier: 1 | 2;
  status: 'pending' | 'in-progress' | 'succeeded' | 'failed';
  result?: unknown;
  durationMs?: number;
  reasoning?: string;
}

export interface ReActSessionState {
  sessionId: string;
  taskPrompt: string;
  images?: string[];
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  status: 'idle' | 'working' | 'done' | 'error' | 'awaiting_tier2';
  currentNarration: string;
  currentTool?: string;
  steps: ReActStep[];
  pendingTier2?: Tier2ActionPayload;
  latency?: LatencyReport;
}

export type StateChangeCallback = (state: ReActSessionState) => void;

export class AgentCoordinator {
  private safetyGate: SafetyGate;
  private projectIndexer: ProjectIndexer;
  private inputSynthesizer: InputSynthesizer;
  private auditDb: AuditDatabase;
  private systemGraph: SystemKnowledgeGraph;
  private onStateChange?: StateChangeCallback;
  private activeSession?: ReActSessionState;
  private activeRequest?: AbortController;
  private activeFrameLookup: Map<number, {
    tag_id: number;
    coords: [number, number, number, number];
    center: [number, number];
    label: string;
    type: string;
  }> = new Map();
  private cursorPosition: { x: number; y: number } = { x: 100, y: 100 };
  private reflexiveMatcher: ReflexiveMatcher = new ReflexiveMatcher();
  private modelRouter: ModelRouter = new ModelRouter();
  private commandCache: CommandCache;
  private requestLimiter = new RequestLimiter(agentDataPath('ai-request-usage.json'));

  constructor(
    safetyGate: SafetyGate,
    projectIndexer: ProjectIndexer,
    inputSynthesizer: InputSynthesizer,
    auditDb: AuditDatabase,
    onStateChange?: StateChangeCallback
  ) {
    this.safetyGate = safetyGate;
    this.projectIndexer = projectIndexer;
    this.inputSynthesizer = inputSynthesizer;
    this.auditDb = auditDb;
    this.systemGraph = new SystemKnowledgeGraph(agentDataPath('horizon_graph.db'));
    this.commandCache = new CommandCache(agentDataPath('horizon_cache.db'), undefined, this.projectIndexer);
    this.onStateChange = onStateChange;
  }

  public getReflexiveMatcher(): ReflexiveMatcher {
    return this.reflexiveMatcher;
  }

  public getModelRouter(): ModelRouter {
    return this.modelRouter;
  }

  public getCommandCache(): CommandCache {
    return this.commandCache;
  }

  public getSystemGraph(): SystemKnowledgeGraph {
    return this.systemGraph;
  }

  public setFrameTags(tags: Array<{
    tag_id: number;
    coords: [number, number, number, number];
    center: [number, number];
    label: string;
    type: string;
  }>): void {
    this.activeFrameLookup.clear();
    for (const t of tags) {
      this.activeFrameLookup.set(t.tag_id, t);
    }
  }

  public getActiveState(): ReActSessionState | undefined {
    return this.activeSession;
  }

  private notify(): void {
    if (this.activeSession && this.onStateChange) {
      this.onStateChange({ ...this.activeSession });
    }
  }

  public abortSession(reason: string = 'Execution halted by Hardware Panic Kill-Switch.'): void {
    this.activeRequest?.abort();
    if (this.activeSession) {
      this.activeSession.status = 'error';
      this.activeSession.currentNarration = reason;
      this.auditDb.updateSessionOutcome(this.activeSession.sessionId, 'cancelled');
      this.notify();
    }
  }

  public async executeTask(
    sessionId: string,
    prompt: string,
    plannerOverrideOrImages?: ((state: ReActSessionState) => Promise<{ action?: ProposedAction; finalAnswer?: string }>) | string[],
    imagesOrPlannerOverride?: string[] | ((state: ReActSessionState) => Promise<{ action?: ProposedAction; finalAnswer?: string }>),
    history?: Array<{ role: 'user' | 'assistant'; text: string }>,
    attachments: ContextAttachment[] = []
  ): Promise<ReActSessionState> {
    if (this.activeSession && ['working', 'awaiting_tier2'].includes(this.activeSession.status)) {
      throw new Error('Finish or cancel the current task before starting another one.');
    }
    if (!prompt.trim()) throw new Error('Enter an instruction before starting a task.');
    let plannerOverride: ((state: ReActSessionState) => Promise<{ action?: ProposedAction; finalAnswer?: string }>) | undefined;
    let images: string[] = [];

    if (typeof plannerOverrideOrImages === 'function') {
      plannerOverride = plannerOverrideOrImages;
      if (Array.isArray(imagesOrPlannerOverride)) {
        images = imagesOrPlannerOverride;
      }
    } else if (Array.isArray(plannerOverrideOrImages)) {
      images = plannerOverrideOrImages;
      if (typeof imagesOrPlannerOverride === 'function') {
        plannerOverride = imagesOrPlannerOverride;
      }
    } else if (Array.isArray(imagesOrPlannerOverride)) {
      images = imagesOrPlannerOverride;
    } else if (typeof imagesOrPlannerOverride === 'function') {
      plannerOverride = imagesOrPlannerOverride;
    }

    this.activeSession = {
      sessionId,
      taskPrompt: prompt,
      images,
      history,
      status: 'working',
      currentNarration: 'Analyzing task and searching workspace...',
      steps: [],
    };

    this.inputSynthesizer.reset();
    this.activeRequest = new AbortController();
    this.activeFrameLookup.clear();
    const projectIntent = !plannerOverride ? parseProjectOpen(prompt) : null;
    const reflexiveIntent = !plannerOverride ? this.reflexiveMatcher.match(prompt) : null;

    this.auditDb.createSession({
      sessionId,
      taskPrompt: prompt,
      startTime: Date.now(),
      outcome: 'in-progress',
    });

    this.notify();

    const hasDocuments = attachments.some(item => item.type === 'pdf' || item.type === 'file');
    const hasFileContext = hasDocuments || attachments.some(item => item.type === 'image');
    const hostedQuestion = useHostedService() && !projectIntent && !reflexiveIntent && !plannerOverride && process.env.MOCK_PLANNER !== 'true';
    if (hasFileContext || hostedQuestion || (!plannerOverride && process.env.MOCK_PLANNER !== 'true' && isImageQuestion(prompt, images))) {
      const trace = new LatencyTrace([...new Set(attachments.map(item => item.type))].join('+') || (images.length ? 'image' : 'text'));
      for (const item of attachments) {
        const captured = item.traceId ? LatencyTrace.get(item.traceId)?.report() : undefined;
        for (const stage of captured?.stages || []) trace.add(`attachment_${stage.name}`, stage.durationMs, stage.status);
      }
      this.activeSession.currentNarration = hasDocuments ? 'Reading your attachment…' : images.length ? 'Reading your screen…' : 'Thinking…';
      this.notify();
      let result: { finalAnswer?: string; error?: string };
      try {
        const documents = await trace.measure('attachment_context_loading', () => resolveDocuments(attachments));
        result = await answerImageQuestion(prompt, images, history, this.requestLimiter, fetch, { documents, trace, signal: this.activeRequest.signal,
          onPartial: text => { if (this.activeSession?.status === 'working') { this.activeSession.currentNarration = text; this.notify(); } } });
      } catch (error) { result = { error: error instanceof Error ? error.message : 'Could not read the attachment. Reattach it.' }; }
      // Attachments never grant permission to execute document instructions.
      if (this.activeSession.status !== 'working') return this.activeSession;
      this.activeSession.status = result.finalAnswer ? 'done' : 'error';
      this.activeSession.currentNarration = result.finalAnswer || result.error || 'Could not answer this image question.';
      this.activeSession.latency = trace.save();
      this.auditDb.updateSessionOutcome(sessionId, result.finalAnswer ? 'succeeded' : 'failed');
      this.notify();
      return this.activeSession;
    }

    // 0. Ground attached images via local perception engine if present
    if (images && images.length > 0 && typeof images[0] === 'string' && images[0].length > 0) {
      this.activeSession.currentNarration = 'Analyzing image with local perception engine (YOLOv8 + OCR)...';
      this.notify();
      try {
        const rawB64 = images[0].replace(/^data:image\/[a-z]+;base64,/, '');
        const somRes = await fetch('http://127.0.0.1:4200/api/parse_som', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: rawB64 }),
          signal: AbortSignal.timeout(25000),
        });
        if (somRes.ok) {
          const somData = await somRes.json();
          if (somData.elements && Array.isArray(somData.elements)) {
            this.setFrameTags(somData.elements);
            console.log(`[AgentCoordinator] Perception grounded ${somData.elements.length} UI elements in ${somData.latency_ms || 0} ms`);
          }
        }
      } catch (err) {
        console.warn('[AgentCoordinator] Perception grounding warning:', err);
      }
    }

    for (let turn = 0; turn < 10; turn++) {
      if (this.inputSynthesizer.isPanicAborted()) {
        this.activeSession.status = 'error';
        this.activeSession.currentNarration = 'Execution halted by Hardware Panic Kill-Switch.';
        this.auditDb.updateSessionOutcome(sessionId, 'cancelled');
        this.notify();
        return this.activeSession;
      }

      let plan: { action?: ProposedAction; finalAnswer?: string; error?: string };

      if (plannerOverride) {
        plan = await plannerOverride(this.activeSession);
      } else if (projectIntent) {
        plan = this.planProjectOpen(this.activeSession, projectIntent.query);
      } else if (this.activeSession.steps.length === 0) {
        // Check Phase C CommandCache before invoking LLM planner or reflexive matching
        const cachedAction = reflexiveIntent ? this.commandCache.lookup('default_user', this.activeSession.taskPrompt) : null;
        if (cachedAction) {
          console.log(`[Command Cache] Cache hit for "${this.activeSession.taskPrompt}": ${cachedAction.tool_name}`);
          const cachedWithPrefix: ProposedAction = {
            ...cachedAction,
            narration: cachedAction.narration.startsWith('[Command Cache]')
              ? cachedAction.narration
              : `[Command Cache] ${cachedAction.narration}`,
          };
          plan = { action: cachedWithPrefix };
        } else {
          const reflexiveStart = performance.now();
          const reflexiveAction = reflexiveIntent;
          const reflexiveLatencyMs = performance.now() - reflexiveStart;

          if (reflexiveAction) {
            console.log(`[Reflexive Matcher] Intercepted unambiguous intent in ${reflexiveLatencyMs.toFixed(2)}ms: ${reflexiveAction.tool_name}`);
            plan = { action: reflexiveAction };
          } else {
            plan = await this.defaultCLIFirstPlanner(this.activeSession);
          }
        }
      } else if (this.activeSession.steps.length > 0 && (this.activeSession.steps[0].narration.startsWith('[Reflexive]') || this.activeSession.steps[0].narration.startsWith('[Command Cache]'))) {
        plan = { finalAnswer: `Action completed: ${this.activeSession.steps[0].narration}` };
      } else {
        plan = await this.defaultCLIFirstPlanner(this.activeSession);
      }

      if (plan.finalAnswer) {
        this.activeSession.status = 'done';
        this.activeSession.currentNarration = plan.finalAnswer;
        this.auditDb.updateSessionOutcome(sessionId, 'succeeded');
        this.notify();
        return this.activeSession;
      }

      if (!plan.action) {
        this.activeSession.status = 'error';
        this.activeSession.currentNarration = plan.error || 'Planner produced no viable action.';
        this.auditDb.updateSessionOutcome(sessionId, 'failed');
        this.notify();
        return this.activeSession;
      }

      const action = plan.action;
      const repeated = this.activeSession.steps.filter(step => step.toolName === action.tool_name && JSON.stringify(step.args) === JSON.stringify(action.args));
      if (repeated.length >= 2) {
        this.activeSession.status = 'error';
        this.activeSession.currentNarration = 'Stopped: the planner repeated the same action without completing your request. Try a more specific instruction or add the project location in Preferences.';
        this.auditDb.updateSessionOutcome(sessionId, 'failed');
        this.notify();
        return this.activeSession;
      }
      const gateResult: GateEvaluationResult = this.safetyGate.evaluate(
        sessionId,
        action,
        this.activeFrameLookup.size > 0 ? new Set(this.activeFrameLookup.keys()) : undefined
      );

      const stepIndex = this.activeSession.steps.length + 1;
      const step: ReActStep = {
        stepIndex,
        toolName: action.tool_name,
        args: gateResult.sanitizedArgs || action.args,
        narration: action.narration,
        tier: gateResult.tier,
        status: 'in-progress',
        reasoning: action.narration,
      };

      this.activeSession.steps.push(step);
      this.activeSession.currentNarration = action.narration;
      this.activeSession.currentTool = action.tool_name;
      this.notify();

      if (!gateResult.allowed) {
        step.status = 'failed';
        step.result = gateResult.rejectionReason;
        this.activeSession.status = 'error';
        this.activeSession.currentNarration = `Safety Gate Rejected: ${gateResult.rejectionReason}`;
        this.auditDb.logToolTrace({
          sessionId,
          stepIndex,
          toolName: action.tool_name,
          argsJson: JSON.stringify(action.args),
          narration: action.narration,
          tier: gateResult.tier,
          authorized: false,
          timestamp: Date.now(),
        });
        this.auditDb.updateSessionOutcome(sessionId, 'failed');
        this.notify();
        return this.activeSession;
      }

      if (gateResult.tier === 2 && gateResult.tier2Payload) {
        this.activeSession.status = 'awaiting_tier2';
        this.activeSession.pendingTier2 = gateResult.tier2Payload;
        this.notify();
        return this.activeSession;
      }

      const stepStart = performance.now();
      const execResult: any = await this.dispatchTool(action.tool_name, step.args);
      step.durationMs = performance.now() - stepStart;
      step.result = execResult;

      const isVerified = execResult && (execResult.verified === true || execResult.status === 'succeeded');
      const isUnconfirmed = execResult?.status === 'launched_unconfirmed_window';

      if (isUnconfirmed) {
        step.status = 'failed';
        this.activeSession.status = 'error';
        this.activeSession.currentNarration = `Verification Ambiguous: ${execResult.details || 'Process launched but no visible window confirmed.'}`;
        this.auditDb.logToolTrace({
          sessionId,
          stepIndex,
          toolName: action.tool_name,
          argsJson: JSON.stringify(step.args),
          narration: action.narration,
          tier: 1,
          authorized: true,
          durationMs: step.durationMs,
          timestamp: Date.now(),
        });
        this.auditDb.updateSessionOutcome(sessionId, 'failed');
        this.notify();
        return this.activeSession;
      }

      if (!isVerified || execResult?.status === 'failed') {
        step.status = 'failed';
        this.commandCache.recordFailure('default_user', this.activeSession.taskPrompt);
        this.activeSession.status = 'error';
        this.activeSession.currentNarration = `Action Verification Failed: ${execResult?.error || execResult?.details || 'Verification check failed.'}`;
        this.auditDb.logToolTrace({
          sessionId,
          stepIndex,
          toolName: action.tool_name,
          argsJson: JSON.stringify(step.args),
          narration: action.narration,
          tier: 1,
          authorized: true,
          durationMs: step.durationMs,
          timestamp: Date.now(),
        });
        this.auditDb.updateSessionOutcome(sessionId, 'failed');
        this.notify();
        return this.activeSession;
      }

      step.status = 'succeeded';
      if (reflexiveIntent) this.commandCache.recordVerifiedSuccess('default_user', this.activeSession.taskPrompt, reflexiveIntent);
      this.auditDb.logToolTrace({
        sessionId,
        stepIndex,
        toolName: action.tool_name,
        argsJson: JSON.stringify(step.args),
        narration: action.narration,
        tier: 1,
        authorized: true,
        durationMs: step.durationMs,
        timestamp: Date.now(),
      });

      this.notify();
    }

    this.activeSession.status = 'error';
    this.activeSession.currentNarration = 'Stopped after 10 steps without completing your request. No successful completion was confirmed.';
    this.auditDb.updateSessionOutcome(sessionId, 'failed');
    this.notify();
    return this.activeSession;
  }

  public async resolveTier2(
    actionId: string,
    authorized: boolean
  ): Promise<ReActSessionState> {
    if (!this.activeSession || this.activeSession.status !== 'awaiting_tier2') {
      throw new Error('No pending Tier 2 action to resolve.');
    }

    const payload = this.activeSession.pendingTier2;
    if (!payload || payload.actionId !== actionId) throw new Error('The approval does not match the pending action.');
    this.activeSession.pendingTier2 = undefined;

    this.auditDb.logTier2Approval({
      actionId,
      sessionId: this.activeSession.sessionId,
      actionPayload: JSON.stringify(payload),
      authorized,
      timestamp: Date.now(),
    });

    if (!authorized) {
      const deniedStep = this.activeSession.steps[this.activeSession.steps.length - 1];
      if (deniedStep) { deniedStep.status = 'failed'; deniedStep.result = { status: 'cancelled', reason: 'Denied by user' }; }
      this.activeSession.status = 'idle';
      this.activeSession.currentNarration = 'Tier 2 action denied by user.';
      this.auditDb.updateSessionOutcome(this.activeSession.sessionId, 'cancelled');
      this.notify();
      return this.activeSession;
    }

    this.activeSession.status = 'working';
    const currentStep = this.activeSession.steps[this.activeSession.steps.length - 1];
    if (currentStep) {
      const start = performance.now();
      const execResult: any = await this.dispatchTool(currentStep.toolName, currentStep.args);
      currentStep.durationMs = performance.now() - start;
      currentStep.result = execResult;

      const isVerified = execResult && (execResult.verified === true || execResult.status === 'succeeded');
      const isUnconfirmed = execResult?.status === 'launched_unconfirmed_window';

      if (isUnconfirmed) {
        currentStep.status = 'failed';
        this.activeSession.status = 'error';
        this.activeSession.currentNarration = `Verification Ambiguous: ${execResult.details || 'Process launched but no visible window confirmed.'}`;
        this.auditDb.logToolTrace({
          sessionId: this.activeSession.sessionId,
          stepIndex: currentStep.stepIndex,
          toolName: currentStep.toolName,
          argsJson: JSON.stringify(currentStep.args),
          narration: currentStep.narration,
          tier: 2,
          authorized: true,
          durationMs: currentStep.durationMs,
          timestamp: Date.now(),
        });
        this.auditDb.updateSessionOutcome(this.activeSession.sessionId, 'failed');
        this.notify();
        return this.activeSession;
      }

      if (!isVerified || execResult?.status === 'failed') {
        currentStep.status = 'failed';
        this.commandCache.recordFailure('default_user', this.activeSession.taskPrompt);
        this.activeSession.status = 'error';
        this.activeSession.currentNarration = `Action Verification Failed: ${execResult?.error || execResult?.details || 'Verification check failed.'}`;
        this.auditDb.logToolTrace({
          sessionId: this.activeSession.sessionId,
          stepIndex: currentStep.stepIndex,
          toolName: currentStep.toolName,
          argsJson: JSON.stringify(currentStep.args),
          narration: currentStep.narration,
          tier: 2,
          authorized: true,
          durationMs: currentStep.durationMs,
          timestamp: Date.now(),
        });
        this.auditDb.updateSessionOutcome(this.activeSession.sessionId, 'failed');
        this.notify();
        return this.activeSession;
      }

      currentStep.status = 'succeeded';
      const reflexive = this.reflexiveMatcher.match(this.activeSession.taskPrompt);
      if (reflexive) this.commandCache.recordVerifiedSuccess('default_user', this.activeSession.taskPrompt, {
        tool_name: currentStep.toolName,
        args: currentStep.args,
        narration: currentStep.narration,
        provenance: 'user_task',
      });
      this.auditDb.logToolTrace({
        sessionId: this.activeSession.sessionId,
        stepIndex: currentStep.stepIndex,
        toolName: currentStep.toolName,
        argsJson: JSON.stringify(currentStep.args),
        narration: currentStep.narration,
        tier: 2,
        authorized: true,
        durationMs: currentStep.durationMs,
        timestamp: Date.now(),
      });
    }

    const completedSingleAction = Boolean(this.reflexiveMatcher.match(this.activeSession.taskPrompt));
    this.activeSession.status = completedSingleAction ? 'done' : 'error';
    this.activeSession.currentNarration = completedSingleAction
      ? 'Task completed successfully.'
      : 'The approved action completed, but the full request has not been verified. This build does not resume planning after approval; submit a follow-up instruction.';
    this.auditDb.updateSessionOutcome(this.activeSession.sessionId, completedSingleAction ? 'succeeded' : 'failed');
    this.notify();
    return this.activeSession;
  }

  private planProjectOpen(state: ReActSessionState, query: string): { action?: ProposedAction; finalAnswer?: string; error?: string } {
    const search = state.steps.find(step => step.toolName === 'find_path');
    if (!search) return { action: { tool_name:'find_path', args:{search_term:query,project_only:true}, narration:`Finding the ${query} project…`, provenance:'user_task' } };
    let candidates = (search.result as {results?:Array<{name:string;path:string;score:number}>})?.results || [];
    if (candidates[0]?.score === 2) candidates = candidates.filter(item => item.score === 2);
    if (!candidates.length) return {error:`Could not find the "${query}" project in your indexed workspaces. Add its parent folder in Preferences → Project Roots, or give the full folder path.`};
    if (candidates.length > 1) return {error:`More than one project matches "${query}". Specify the full name or path: ${candidates.map(item => item.path).join(', ')}`};
    const target = candidates[0].path;
    if (!state.steps.some(step => step.toolName === 'launch_app')) return {action:{tool_name:'launch_app',args:{executable_path:'code',args:['--new-window',target]},narration:`Opening ${candidates[0].name} in VS Code…`,provenance:'user_task'}};
    return {finalAnswer:`Opened ${candidates[0].name} in VS Code (${target}).`};
  }

  private async dispatchTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'find_path': {
        const query = String(args.search_term || '');
        let results = args.project_only ? this.projectIndexer.findProjects(query, 10) : this.projectIndexer.findPath(query, 5);
        if (args.project_only && path.isAbsolute(query)) {
          try { results = fs.statSync(query).isDirectory() ? [{name:path.basename(query),path:path.resolve(query),manifest_type:'folder',score:2}] : []; } catch { results=[]; }
        }
        return {
          verified: true,
          status: 'succeeded',
          results,
          count: results.length,
          details: `Found ${results.length} path results for "${query}".`,
        };
      }
      case 'launch_app': {
        const exe = String(args.executable_path || '').trim();
        const cmdArgs = Array.isArray(args.args) ? (args.args as string[]) : [];
        const baselineWindows = ActionVerifier.getVisibleWindows();

        try {
          const lower = exe.toLowerCase();
          const installed = this.projectIndexer.findInstalledApp(exe);

          let launchMethod: 'direct_exe' | 'shell_appsfolder' = 'direct_exe';
          let launchCommand = '';
          let launchArgs: string[] = [];
          let processPatterns: string[] = [];
          let titlePatterns: string[] = [];
          let appDisplayName = installed?.name || exe;

          // Resolve launch path
          if (lower.startsWith('http://') || lower.startsWith('https://')) {
            launchMethod = 'shell_appsfolder';
            launchCommand = 'explorer.exe';
            launchArgs = [exe];
            processPatterns = ['chrome', 'msedge', 'firefox', 'browser'];
            titlePatterns = ['google', 'search', 'chrome', 'edge', 'browser'];
          } else if (lower.startsWith('shell:appsfolder\\') || lower.startsWith('explorer.exe shell:appsfolder\\')) {
            const rawId = exe.replace(/^(explorer\.exe\s+)?shell:appsfolder\\/i, '').trim();
            launchMethod = 'shell_appsfolder';
            launchCommand = 'explorer.exe';
            launchArgs = [`shell:AppsFolder\\${rawId}`];
            processPatterns = [rawId.split('!')[0], rawId.split('_')[0]];
            titlePatterns = [rawId.split('!')[0].split('.')[0].toLowerCase()];
          } else if (installed && installed.isStoreApp) {
            // Path 2: Microsoft Store / UWP app with AUMID -> shell:appsFolder activation
            launchMethod = 'shell_appsfolder';
            launchCommand = 'explorer.exe';
            launchArgs = [`shell:AppsFolder\\${installed.appId}`];
            appDisplayName = installed.name;
            const packageFamily = installed.appId.split('!')[0];
            const baseName = installed.name.replace(/\s+/g, '');
            processPatterns = [
              installed.name,
              `${installed.name}*`,
              baseName,
              `${baseName}*`,
              `${baseName}App`,
              packageFamily.split('_')[0],
              installed.appId.split('!')[1] || '',
            ].filter(Boolean);
            if (installed.name.toLowerCase().includes('calc')) {
              processPatterns.push('CalculatorApp', 'calc', 'ApplicationFrameHost');
            }
            titlePatterns = [installed.name.toLowerCase(), baseName.toLowerCase()];
          } else if (installed && installed.exePath && fs.existsSync(installed.exePath)) {
            // Path 1: Direct exe + args (file path exists)
            launchMethod = 'direct_exe';
            launchCommand = installed.exePath;
            launchArgs = cmdArgs;
            appDisplayName = installed.name;
            const baseName = path.basename(installed.exePath, '.exe');
            processPatterns = [baseName, installed.name];
            titlePatterns = [installed.name.toLowerCase(), baseName.toLowerCase()];
            if (lower.includes('code') || baseName.toLowerCase().includes('code')) {
              processPatterns.push('Code', 'Code.exe', 'Antigravity IDE', 'antigravity-ide');
              titlePatterns.push('antigravity ide', 'project-horizon', 'visual studio code', 'code');
            }
          } else if (fs.existsSync(exe) && fs.statSync(exe).isDirectory()) {
            const editor = this.projectIndexer.findInstalledApp('code');
            if (!editor?.exePath) throw new Error('VS Code is not installed at a known location.');
            launchCommand = editor.exePath;
            launchArgs = ['--new-window',exe];
            processPatterns = ['Code'];
            titlePatterns = [path.basename(exe).toLowerCase()];
          } else if (fs.existsSync(exe)) {
            // Path 1: Direct file path on disk
            launchMethod = 'direct_exe';
            launchCommand = exe;
            launchArgs = cmdArgs;
            processPatterns = [path.basename(exe, '.exe')];
            titlePatterns = [path.basename(exe, '.exe').toLowerCase()];
          } else {
            // Known system binaries & common fallbacks
            if (lower === 'notepad' || lower === 'notepad.exe') {
              const noteApp = this.projectIndexer.findInstalledApp('notepad');
              launchMethod = 'shell_appsfolder';
              launchCommand = 'explorer.exe';
              launchArgs = [`shell:AppsFolder\\${noteApp?.appId || 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App'}`];
              processPatterns = ['Notepad', 'Notepad*'];
              titlePatterns = ['notepad'];
            } else if (lower === 'calc' || lower === 'calculator' || lower === 'calc.exe') {
              const calcApp = this.projectIndexer.findInstalledApp('calculator');
              launchMethod = 'shell_appsfolder';
              launchCommand = 'explorer.exe';
              launchArgs = [`shell:AppsFolder\\${calcApp?.appId || 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App'}`];
              processPatterns = ['CalculatorApp', 'Calculator*', 'calc', 'ApplicationFrameHost'];
              titlePatterns = ['calculator'];
            } else if (/^(code|code\.cmd|vscode|vs code|visual studio code)$/.test(lower)) {
              const userVsCode = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code', 'Code.exe');
              launchMethod = 'direct_exe';
              launchCommand = fs.existsSync(userVsCode) ? userVsCode : 'code';
              launchArgs = cmdArgs;
              processPatterns = ['Code', 'Code.exe', 'Antigravity IDE', 'antigravity-ide'];
              titlePatterns = ['visual studio code', 'code', 'antigravity ide', 'project-horizon'];
            } else if (lower === 'cmd' || lower === 'cmd.exe') {
              launchMethod = 'direct_exe';
              launchCommand = 'C:\\Windows\\System32\\cmd.exe';
              launchArgs = cmdArgs.length > 0 ? cmdArgs : ['/c', 'start', 'cmd.exe'];
              processPatterns = ['cmd', 'conhost', 'OpenConsole', 'WindowsTerminal'];
              titlePatterns = ['command prompt', 'cmd.exe', 'cmd', 'c:\\windows\\system32\\cmd.exe'];
            } else if (installed) {
              launchMethod = 'shell_appsfolder';
              launchCommand = 'explorer.exe';
              launchArgs = [`shell:AppsFolder\\${installed.appId}`];
              processPatterns = [installed.name, 'ApplicationFrameHost'];
              titlePatterns = [installed.name.toLowerCase()];
            } else {
              // Direct exe attempt fallback
              launchMethod = 'direct_exe';
              launchCommand = exe;
              launchArgs = cmdArgs;
              processPatterns = [path.basename(exe, '.exe')];
              titlePatterns = [exe.toLowerCase()];
            }
          }

          let requestedWorkspace: string | undefined;
          if (/^code(?:\.exe)?$/i.test(path.basename(launchCommand)) || /^(?:code|vs\s*code|visual studio code)$/i.test(exe)) {
            requestedWorkspace = launchArgs.find(arg => path.isAbsolute(arg) && !arg.startsWith('-'));
            if (requestedWorkspace && !fs.existsSync(requestedWorkspace)) throw new Error(`The requested workspace does not exist: ${requestedWorkspace}`);
          }

          // Clean environment to prevent Electron / VS Code variable poisoning
          const cleanEnv = { ...process.env };
          for (const k of Object.keys(cleanEnv)) {
            if (k.startsWith('ELECTRON_') || (k.startsWith('VSCODE_') && k !== 'VSCODE_GIT_ASKPASS_NODE')) {
              delete cleanEnv[k];
            }
          }

          // Spawn target
          let child;
          if (launchMethod === 'shell_appsfolder') {
            child = spawn('cmd.exe', ['/c', 'start', launchCommand, ...launchArgs], {
              detached: true,
              stdio: 'ignore',
              windowsHide: false,
            });
          } else {
            const isBatch = /\.bat$|\.cmd$/i.test(launchCommand);
            const actualCmd = isBatch ? 'cmd.exe' : launchCommand;
            const actualArgs = isBatch ? ['/c', launchCommand, ...launchArgs] : launchArgs;
            child = spawn(actualCmd, actualArgs, {
              detached: true,
              stdio: 'ignore',
              shell: false,
              env: cleanEnv,
              // GUI targets must receive a visible startup window. Hiding Code's
              // initial window also hides the requested workspace on first launch.
              windowsHide: isBatch || /^(cmd|powershell|pwsh)(\.exe)?$/i.test(path.basename(launchCommand)),
            });
          }
          await new Promise<void>((resolve,reject) => {
            child.once('spawn',resolve);
            child.once('error',reject);
          });
          child.unref();

          // If this is a destructive CLI file deletion (del / rmdir), verify disk effect directly
          const isCliDeletion = /^(cmd|powershell|pwsh)(\.exe)?$/i.test(path.basename(launchCommand))
            && cmdArgs.some(arg => /^(del|erase|rmdir|remove-item)(?:\s|$)/i.test(arg.trim()));
          if (isCliDeletion) {
            const targetArg = cmdArgs.find(a => !/^\/[a-zA-Z]$/.test(a) && !/del|erase|rmdir|remove/i.test(a) && (a.includes('\\') || a.includes('/') || a.includes('.'))) || cmdArgs[cmdArgs.length - 1] || '';
            await new Promise(r => setTimeout(r, 400));
            const stillExists = !targetArg || fs.existsSync(targetArg);
            return {
              verified: !stillExists,
              status: !stillExists ? 'succeeded' : 'failed',
              target: launchCommand,
              launchMethod: 'direct_exe',
              args: launchArgs,
              details: !stillExists ? `File deletion verified: target "${targetArg}" was removed from disk.` : `File still exists at "${targetArg}".`
            };
          }

          if (args.expected_process) {
            processPatterns = Array.isArray(args.expected_process)
              ? (args.expected_process as string[])
              : [String(args.expected_process)];
          }
          if (args.expected_title) {
            titlePatterns = Array.isArray(args.expected_title)
              ? (args.expected_title as string[])
              : [String(args.expected_title)];
          }

          // Post-action verification (FR-4.5) via bounded retry loop
          const verification = await ActionVerifier.verifyAppLaunch({
            appName: appDisplayName,
            processPatterns,
            titlePatterns,
            baselineWindows,
            timeoutMs: requestedWorkspace ? 15000 : 5000,
            pollIntervalMs: 200,
            requiredTitlePattern: requestedWorkspace ? path.basename(requestedWorkspace) : undefined,
          });

          return {
            ...verification,
            target: launchCommand,
            launchMethod,
            args: launchArgs,
            pid: verification.pid || child.pid,
          };
        } catch (err: any) {
          return {
            verified: false,
            status: 'failed',
            target: exe,
            error: err.message,
            latencyMs: 0,
            details: `Exception while launching app: ${err.message}`,
          };
        }
      }
      case 'check_open_workspace': {
        const windows = ActionVerifier.getVisibleWindows().filter(window => /^(code|code.exe)$/i.test(window.process) || /visual studio code/i.test(window.title));
        return { verified:windows.length === 0, status:windows.length ? 'failed' : 'succeeded', windows, count:windows.length, state:windows.length ? 'workspace_path_unconfirmed' : 'none_open', details:windows.length ? 'VS Code is open, but window titles alone cannot confirm its active folder. No workspace path was verified.' : 'No visible VS Code window is open.' };
      }
      case 'inspect_viewport': {
        try {
          const { desktopCapturer, screen } = require('electron');
          if (!desktopCapturer || !screen) throw new Error('Desktop capture requires the running Electron app.');
          const display = screen.getPrimaryDisplay();
          const sources = await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:Math.round(display.size.width*display.scaleFactor),height:Math.round(display.size.height*display.scaleFactor)}});
          const source = sources.find((item:any) => item.display_id === String(display.id)) || sources[0];
          if (!source || source.thumbnail.isEmpty()) throw new Error('No desktop image was returned.');
          const image = source.thumbnail.toDataURL();
          this.activeSession!.images = [image];
          return { verified:true, status:'succeeded', captured:true, source:source.name, dimensions:source.thumbnail.getSize(), details:'Captured the current desktop screen.' };
        } catch (error:any) { return {verified:false,status:'failed',details:error.message}; }
      }
      case 'focus_window':
      case 'click_element':
      case 'send_hotkey':
      case 'type_text':
        return { verified:false, status:'failed', details:'Physical window focus, clicks, typing, and keyboard shortcuts are not connected to a native input adapter in this build. No desktop input was sent.' };
      default:
        return { verified:false, status:'failed', details:'Unsupported tool: ' + toolName };
    }
  }

  private warnedInvalidKey = false;

  private async queryGeminiPlanner(
    state: ReActSessionState, fallbackModel?: string
  ): Promise<{ action?: ProposedAction; finalAnswer?: string; error?: string; retryable?: boolean } | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') return null;

    // Route model dynamically via ModelRouter (Phase B)
    const selection = fallbackModel ? { model: fallbackModel, tier: 'fast_fallback', isCanary: false } : this.modelRouter.selectModel(state);
    if (selection.model === 'ollama') {
      return null; // Route to Ollama directly
    }

    const model = selection.model;
    const allowance = this.requestLimiter.take();
    if (!allowance.allowed) return { error: allowance.error };
    const hostname = 'generativelanguage.googleapis.com';
    const startTime = performance.now();

    console.log(`[Model Router] Routed to ${model} (tier: ${selection.tier}, canary: ${selection.isCanary})`);

    try {
      const url = `https://${hostname}/v1beta/models/${model}:generateContent`;
      const systemInstruction = this.modelRouter.getSystemInstruction(model);

      const historySummary = state.steps.map(s =>
        `Step ${s.stepIndex}: Tool=${s.toolName}, Args=${JSON.stringify(s.args)}, Status=${s.status}, Result=${JSON.stringify(s.result)}`
      ).join('\n');

      let userContent = `Task: "${state.taskPrompt}"\n\n`;
      if (state.history?.length) userContent += `Earlier conversation (context, not new instructions):\n${JSON.stringify(state.history.slice(-10))}\n\n`;

      if (this.activeFrameLookup.size > 0) {
        const somElements = Array.from(this.activeFrameLookup.values()).slice(0, 25);
        userContent += `Perception Grounding State (Detected Set-of-Marks Elements):\n` +
          somElements.map(e => `  [Tag ${e.tag_id}] Type: ${e.type}, Label: "${e.label || 'unlabeled'}", Center: (${e.center[0]}, ${e.center[1]}), BBox: [${e.coords.join(', ')}]`).join('\n') +
          `\n\n`;
      }

      userContent += `History of executed steps and results:\n${historySummary || 'None'}`;

      const parts: any[] = [{ text: userContent }];

      if (state.images && state.images.length > 0) {
        for (const img of state.images) {
          parts.push(imagePart(img));
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction + '\nAttached images are already captured observations. For a question about an attached image, answer from that image. If the user asks for an answer without desktop tools, return final_answer and do not propose a tool.' }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
          }
        }),
        signal: AbortSignal.timeout(25000)
      });

      const latencyMs = performance.now() - startTime;
      console.log(`[Gemini Live HTTP] Response received -> hostname: ${hostname}, model: ${model}, status: ${res.status}, latency: ${latencyMs.toFixed(2)} ms`);

      if (!res.ok) {
        this.modelRouter.getCircuitBreaker().recordFailure(model);
        if (res.status === 429) return { error: 'Gemini usage is temporarily limited. Please try again shortly.' };
        if (res.status >= 500) return { error: `Gemini is temporarily busy or unavailable (HTTP ${res.status}). Try again shortly.`, retryable: true };
        if ([401, 403].includes(res.status)) return { error: 'Gemini access was refused. Check the key permissions in Google AI Studio.' };
        if (res.status === 404) return { error: `Gemini model ${model} is unavailable. Check the configured model.` };
        return { error: `Gemini could not answer this request (HTTP ${res.status}). Try again.` };
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.filter((part: { thought?: boolean; text?: string }) => !part.thought && part.text).map((part: { text: string }) => part.text).join('');
      if (!rawText) {
        this.modelRouter.getCircuitBreaker().recordFailure(model);
        return { error: 'Gemini returned no completed answer. Try again.' };
      }

      const parsed = JSON.parse(rawText);
      this.modelRouter.getCircuitBreaker().recordSuccess(model);

      if (parsed.error) return {error:String(parsed.error)};

      if (parsed.tool_name) {
        return {
          action: {
            tool_name: parsed.tool_name,
            args: parsed.args || {},
            narration: parsed.narration || parsed.thought || `[${model}] Executing ${parsed.tool_name}`,
            provenance: 'user_task',
          }
        };
      } else if (parsed.final_answer) {
        return {
          finalAnswer: parsed.final_answer
        };
      }
    } catch (err) {
      this.modelRouter.getCircuitBreaker().recordFailure(model);
      const latencyMs = performance.now() - startTime;
      console.warn(`[Gemini Live HTTP] Request failed after ${latencyMs.toFixed(2)} ms:`, err);
      return { error: err instanceof SyntaxError ? 'Gemini returned an invalid response. Try again.' : err instanceof Error && /TimeoutError|AbortError/.test(err.name) ? 'Gemini took too long to respond. Try again.' : 'Could not connect to Gemini. Check your connection and try again.' };
    }
    return null;
  }

  public isVisualOrOCRTask(state: ReActSessionState): boolean {
    if (state.images && state.images.length > 0) return true;
    const prompt = state.taskPrompt.toLowerCase();
    const visualKeywords = [
      'image', 'screenshot', 'screen', 'crop', 'visual', 'ocr', 
      'extract text', 'read text', 'read screen', 'inspect', 
      'photo', 'picture', 'lasso', 'viewport', 'button', 'icon'
    ];
    if (visualKeywords.some(k => prompt.includes(k))) return true;
    if (state.steps.some(s => s.toolName === 'inspect_viewport')) return true;
    return false;
  }

  private async queryOllamaPlanner(
    state: ReActSessionState
  ): Promise<{ action?: ProposedAction; finalAnswer?: string } | null> {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const isVisual = this.isVisualOrOCRTask(state);

    // User preference: Llama 3.2 Vision for images and OCR, Qwen 2.5 for other normal tasks
    const visionModel = process.env.OLLAMA_VISION_MODEL || 'llama3.2-vision';
    const textModel = process.env.OLLAMA_TEXT_MODEL || 'qwen2.5:3b';

    const candidateOllamaModels = isVisual
      ? [visionModel, 'llama3.2-vision:latest', 'llama3.2', textModel, 'qwen2.5:3b']
      : [textModel, 'qwen2.5:3b', 'qwen2.5', 'llama3.2', visionModel];

    const systemInstruction = `You are Project Horizon, an autonomous multimodal Windows desktop agent running locally via Ollama (${isVisual ? 'Vision' : 'Standard'} engine).
Available tools:
- find_path(search_term: string): Search local workspace using SQLite FTS5 for files/projects.
- launch_app(executable_path: string, args?: string[]): Launch local Windows application.
- focus_window(process_name?: string, window_title?: string): Focus a window.
- inspect_viewport(): Retrieve on-screen UI elements.
- click_element(tag_id: number): Click on-screen element using Bézier curve.
- type_text(text: string, press_enter?: boolean): Type text.

Respond ONLY with a valid JSON object matching:
{
  "thought": "Internal chain-of-thought",
  "narration": "User-facing concise explanation",
  "tool_name": "tool_name_here" (or null if task finished),
  "args": { ... },
  "final_answer": "Final message once complete" (or null if calling tool)
}`;

    const historySummary = state.steps.map(s =>
      `Step ${s.stepIndex}: Tool=${s.toolName}, Args=${JSON.stringify(s.args)}, Status=${s.status}`
    ).join('\n');

    const userContent = `Task: "${state.taskPrompt}"\n\nHistory:\n${historySummary || 'None'}`;

    for (const model of candidateOllamaModels) {
      try {
        const userMsg: { role: string; content: string; images?: string[] } = {
          role: 'user',
          content: userContent
        };
        if (isVisual && state.images && state.images.length > 0) {
          userMsg.images = state.images.map(img => img.replace(/^data:image\/[a-z]+;base64,/, ''));
        }

        const res = await fetch(`${ollamaHost}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemInstruction },
              userMsg
            ],
            format: 'json',
            stream: false,
            options: {
              temperature: 0.1
            }
          }),
          signal: AbortSignal.timeout(12000)
        });

        if (!res.ok) {
          continue;
        }

        const data = await res.json();
        const rawText = data.message?.content;
        if (!rawText) continue;

        const parsed = JSON.parse(rawText);
        if (parsed.tool_name) {
          this.modelRouter.getCircuitBreaker().recordSuccess('ollama');
          return {
            action: {
              tool_name: parsed.tool_name,
              args: parsed.args || {},
              narration: parsed.narration || parsed.thought || `[Ollama:${model}] Executing ${parsed.tool_name}`,
              provenance: 'user_task',
            }
          };
        } else if (parsed.final_answer) {
          this.modelRouter.getCircuitBreaker().recordSuccess('ollama');
          return {
            finalAnswer: parsed.final_answer
          };
        }
      } catch {
        // Try next candidate model
      }
    }
    this.modelRouter.getCircuitBreaker().recordFailure('ollama');
    return null;
  }


  private async defaultCLIFirstPlanner(
    state: ReActSessionState
  ): Promise<{ action?: ProposedAction; finalAnswer?: string; error?: string }> {
    // If deterministic unit test mode is explicitly requested via env variable
    if (process.env.MOCK_PLANNER === 'true') {
      return this.fallbackDeterministicPlanner(state);
    }

    if (useHostedService()) return { error: 'This desktop action is not available through Horizon’s answer service. Project opening and supported local commands remain available.' };
    // 1. Primary Cloud Planner: Google Gemini (gemini-3.5-flash-lite)
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
      const geminiPlan = await this.queryGeminiPlanner(state);
      if (geminiPlan?.retryable) {
        const fallback = await this.queryGeminiPlanner(state, process.env.HORIZON_GEMINI_CLOUD_FALLBACK_MODEL || 'gemini-3.1-flash-lite');
        return fallback || geminiPlan;
      }
      if (geminiPlan) {
        return geminiPlan;
      }
    }

    // 2. Local Fallback Planner: Local Ollama (RTX 4060 GPU - Qwen 2.5:3b / Llama 3.2 Vision)
    const ollamaPlan = await this.queryOllamaPlanner(state);
    if (ollamaPlan) {
      return ollamaPlan;
    }

    // Sample plans are reserved for explicit tests; a live failure must remain a failure.
    console.warn('[AgentCoordinator] Gemini and Ollama planners are unavailable.');
    return { error: 'Horizon could not reach a reasoning model. Check your Gemini API configuration or local Ollama service, then try again.' };
  }

  /**
   * Deterministic fallback ONLY used when process.env.MOCK_PLANNER === 'true' for offline unit tests.
   */
  public fallbackDeterministicPlanner(
    state: ReActSessionState
  ): { action?: ProposedAction; finalAnswer?: string } {
    const executedTools = state.steps.map(s => s.toolName);

    if (/whatsapp/i.test(state.taskPrompt)) {
      if (!executedTools.includes('launch_app')) {
        return {
          action: {
            tool_name: 'launch_app',
            args: {
              executable_path: 'whatsapp:',
              args: [],
            },
            narration: 'Launching WhatsApp on your device...',
            provenance: 'user_task',
          },
        };
      }
      return {
        finalAnswer: 'WhatsApp has been launched successfully on your device.',
      };
    }

    if (/spotify/i.test(state.taskPrompt)) {
      if (!executedTools.includes('launch_app')) {
        return {
          action: {
            tool_name: 'launch_app',
            args: {
              executable_path: 'start explorer.exe shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify',
              args: [],
            },
            narration: 'Launching Spotify via Windows Application Activation Manager...',
            provenance: 'user_task',
          },
        };
      }
      return {
        finalAnswer: 'Spotify has been launched successfully on your device.',
      };
    }

    if (/check.*(?:folder|workspace)|what.*(?:folder|workspace)|which.*(?:folder|workspace)|open.*folder/i.test(state.taskPrompt)) {
      const ws = this.systemGraph.getOpenWorkspace('vscode');
      return {
        finalAnswer: ws
          ? `The folder currently open in VS Code is "${ws.folderName}" at "${ws.folderPath}" (detected via ${ws.source}).`
          : 'No active workspace was detected in VS Code.',
      };
    }

    if (/delete|remove|rmdir|del |powershell|cmd|clean workspace/i.test(state.taskPrompt)) {
      if (!executedTools.includes('launch_app')) {
        let target = 'temp_build';
        const m = state.taskPrompt.match(/in\s+([A-Za-z0-9_:\\\/\.\-]+)/i) || state.taskPrompt.match(/delete\s+(?:the\s+test\s+file\s+in\s+)?([A-Za-z0-9_:\\\/\.\-]+)/i);
        if (m) target = m[1].trim();
        return {
          action: {
            tool_name: 'launch_app',
            args: {
              executable_path: 'C:/Windows/System32/cmd.exe',
              args: ['/c', 'del', '/f', '/q', target],
            },
            narration: `Executing deletion of ${target} via shell (requires Tier 2 confirmation)...`,
            provenance: 'user_task',
          },
        };
      }
      return {
        finalAnswer: 'Target deletion completed successfully after Tier 2 authorization.',
      };
    }

    if (!executedTools.includes('find_path')) {
      const match = state.taskPrompt.match(/(?:open|find|launch)\s+(.+?)(?:\s+in\s+|$)/i);
      const query = match ? match[1] : state.taskPrompt;
      return {
        action: {
          tool_name: 'find_path',
          args: { search_term: query },
          narration: `Searching workspace for "${query}" via FTS5...`,
          provenance: 'user_task',
        },
      };
    }

    if (executedTools.includes('find_path') && !executedTools.includes('launch_app')) {
      const findStep = state.steps.find(s => s.toolName === 'find_path');
      const results = (findStep?.result as any[]) || [];
      const targetPath = results.length > 0 ? results[0].path : 'E:/code/projects/target-app';

      return {
        action: {
          tool_name: 'launch_app',
          args: {
            executable_path: 'C:/Program Files/Microsoft VS Code/Code.exe',
            args: [targetPath],
          },
          narration: `Opening project in VS Code at "${targetPath}" (CLI-first)...`,
          provenance: 'user_task',
        },
      };
    }

    return {
      finalAnswer: 'Workspace loaded in VS Code in 1.4s with zero misclicks (TC-E2E-01 validated).',
    };
  }
}


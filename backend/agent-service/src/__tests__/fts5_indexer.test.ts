import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ProjectIndexer } from '../indexer/fts5_indexer.js';

describe('TC-U-02: FTS5 Indexer and find_path Benchmark', () => {
  let indexer: ProjectIndexer;

  beforeAll(() => {
    indexer = new ProjectIndexer(':memory:');

    // Generate 10,000 realistic synthetic paths across diverse workspace folders
    const bulkData = [];
    const prefixes = ['frontend', 'backend', 'services', 'tools', 'libs', 'apps', 'infra', 'packages'];
    const names = ['auth', 'router', 'cache', 'database', 'logger', 'payment', 'scanner', 'parser', 'engine'];

    for (let i = 0; i < 10000; i++) {
      const prefix = prefixes[i % prefixes.length];
      const name = `${names[i % names.length]}_${i}`;
      bulkData.push({
        name,
        path: `C:/Users/Developer/workspace/${prefix}/${name}`,
        manifest_type: i % 3 === 0 ? 'package.json' : i % 3 === 1 ? 'Cargo.toml' : 'requirements.txt',
        content: `project dependency configuration file ${name} module version 1.0.${i}`,
      });
    }

    // Insert high-priority needle target
    bulkData.push({
      name: 'code_scanner_v2',
      path: 'C:/Users/Developer/projects/code-scanner-production',
      manifest_type: 'package.json',
      content: 'System wide automated code scanner with static analysis AST parser and security audit',
    });

    indexer.bulkIndex(bulkData);
  });

  afterAll(() => {
    indexer.close();
  });

  it('correctly ranks the top match for a specific project query', () => {
    const results = indexer.findPath('code scanner', 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('code_scanner_v2');
    expect(results[0].path).toContain('code-scanner-production');
  });

  it('executes search against 10,000+ paths in under 15ms (TC-U-02 SLA requirement)', () => {
    const startTime = performance.now();
    const results = indexer.findPath('parser engine', 10);
    const durationMs = performance.now() - startTime;

    expect(results.length).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(15);
    console.log(`[TC-U-02 Benchmark] Query 10k items completed in ${durationMs.toFixed(3)}ms (<15ms SLA)`);
  });

  it('handles single token and multi-word searches gracefully', () => {
    const results = indexer.findPath('database', 5);
    expect(results.length).toBe(5);
    expect(results[0].name).toContain('database');
  });

  it('returns empty array cleanly on blank or whitespace query', () => {
    expect(indexer.findPath('')).toEqual([]);
    expect(indexer.findPath('   ')).toEqual([]);
  });
});

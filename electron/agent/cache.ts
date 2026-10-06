import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { resolveSqlite } from './sqlite';
import { ProposedAction } from './gate';
import { ProjectIndexer } from './indexer';

export interface CacheEntry {
  userId: string;
  normalizedInstruction: string;
  actionPlan: ProposedAction;
  successCount: number;
  lastVerifiedAt: number;
  validityHash: string;
}

export interface EncryptedCacheRow {
  user_id: string;
  normalized_instruction: string;
  encrypted_action_plan: string;
  iv: string;
  auth_tag: string;
  success_count: number;
  last_verified_at: number;
  validity_hash: string;
}


/**
 * Phase C: Learned Per-User Command Cache (NFR-3.1, NFR-3.2)
 *
 * Requirements:
 * 1. Storage & Schema: SQLite table `command_cache` encrypted with AES-256-GCM.
 * 2. 3x Promotion Rule: Actions must achieve 3 consecutive verified successes
 *    before promotion into the cache. Single or 2x successes are kept in staging.
 * 3. Invalidation & Validity Check: Target existence and validity_hash verified before replay.
 * 4. Coordinate Click Restriction: Clicks (`click_element`) are STRICTLY FORBIDDEN from caching.
 * 5. Security & Isolation: Scoped by user_id. Cached actions STILL pass through Safety Gate & Tier 2.
 */
export class CommandCache {
  private db: any = null;
  private encryptionKey: Buffer;
  private projectIndexer?: ProjectIndexer;

  // In-memory fallback if SQLite is unavailable
  private inMemoryStaging: Map<string, { actionPlan: ProposedAction; count: number; hash: string; lastSuccess: number }> = new Map();
  private inMemoryCache: Map<string, CacheEntry> = new Map();

  constructor(dbPath: string = ':memory:', encryptionSecret?: string, projectIndexer?: ProjectIndexer) {
    this.projectIndexer = projectIndexer;

    // Derive 256-bit encryption key
    const secret = encryptionSecret || process.env.HORIZON_CACHE_SECRET || 'horizon_default_master_cache_key_2026';
    this.encryptionKey = crypto.createHash('sha256').update(secret).digest();

    const Sqlite = resolveSqlite();
    if (Sqlite) {
      try {
        if (dbPath !== ':memory:') {
          const dir = path.dirname(dbPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new Sqlite(dbPath);
        this.initialize();
      } catch (err) {
        console.warn('[CommandCache] SQLite initialization fallback to memory store:', err);
        this.db = null;
      }
    }
  }

  private initialize(): void {
    if (!this.db) return;
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS command_staging (
        user_id TEXT NOT NULL,
        normalized_instruction TEXT NOT NULL,
        action_plan TEXT NOT NULL,
        success_count INTEGER NOT NULL,
        last_success_at INTEGER NOT NULL,
        validity_hash TEXT NOT NULL,
        PRIMARY KEY (user_id, normalized_instruction)
      );

      CREATE TABLE IF NOT EXISTS command_cache (
        user_id TEXT NOT NULL,
        normalized_instruction TEXT NOT NULL,
        encrypted_action_plan TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        success_count INTEGER NOT NULL,
        last_verified_at INTEGER NOT NULL,
        validity_hash TEXT NOT NULL,
        PRIMARY KEY (user_id, normalized_instruction)
      );
    `);
  }

  public setProjectIndexer(indexer: ProjectIndexer): void {
    this.projectIndexer = indexer;
  }

  /**
   * Normalizes raw user instructions (lowercased, stripped punctuation, normalized whitespace).
   */
  public normalizeInstruction(instruction: string): string {
    return (instruction || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generates a validity hash for the target application or tool args.
   */
  public computeValidityHash(action: ProposedAction): string {
    const data: Record<string, unknown> = {
      tool_name: action.tool_name,
      args: action.args || {},
    };

    if (action.tool_name === 'launch_app') {
      const exe = String(action.args?.executable_path || '');
      if (fs.existsSync(exe)) {
        try {
          const stat = fs.statSync(exe);
          data.file_mtime = stat.mtimeMs;
          data.file_size = stat.size;
        } catch {}
      }
    }

    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
  }

  /**
   * Encrypts plaintext JSON action plan via AES-256-GCM.
   */
  private encryptActionPlan(plan: ProposedAction): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const plaintext = JSON.stringify(plan);
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  /**
   * Decrypts AES-256-GCM ciphertext back into ProposedAction.
   */
  private decryptActionPlan(ciphertext: string, ivHex: string, authTagHex: string): ProposedAction {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  /**
   * Records a verified successful execution.
   * Promotion rule: Only promoted after 3 consecutive verified successes.
   * Coordinate clicks (click_element) are NEVER cached.
   */
  public recordVerifiedSuccess(
    userId: string = 'default_user',
    rawInstruction: string,
    action: ProposedAction
  ): { promoted: boolean; currentCount: number } {
    // Restriction: NEVER cache coordinate clicks
    if (action.tool_name === 'click_element') {
      return { promoted: false, currentCount: 0 };
    }

    const norm = this.normalizeInstruction(rawInstruction);
    if (!norm) return { promoted: false, currentCount: 0 };

    const validityHash = this.computeValidityHash(action);
    const now = Date.now();
    const actionPlanJson = JSON.stringify(action);

    if (this.db) {
      // Check existing staging count
      const existingStaging = this.db.prepare(
        'SELECT * FROM command_staging WHERE user_id = ? AND normalized_instruction = ?'
      ).get(userId, norm);

      let count = 1;
      if (existingStaging) {
        // If same action plan was executed again, increment count
        if (existingStaging.action_plan === actionPlanJson) {
          count = existingStaging.success_count + 1;
        } else {
          count = 1; // Different plan -> reset count
        }
      }

      // Update staging
      this.db.prepare(`
        INSERT INTO command_staging (user_id, normalized_instruction, action_plan, success_count, last_success_at, validity_hash)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, normalized_instruction) DO UPDATE SET
          action_plan = excluded.action_plan,
          success_count = excluded.success_count,
          last_success_at = excluded.last_success_at,
          validity_hash = excluded.validity_hash
      `).run(userId, norm, actionPlanJson, count, now, validityHash);

      // Check promotion threshold (>= 3)
      if (count >= 3) {
        const encrypted = this.encryptActionPlan(action);
        this.db.prepare(`
          INSERT INTO command_cache (
            user_id, normalized_instruction, encrypted_action_plan, iv, auth_tag,
            success_count, last_verified_at, validity_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, normalized_instruction) DO UPDATE SET
            encrypted_action_plan = excluded.encrypted_action_plan,
            iv = excluded.iv,
            auth_tag = excluded.auth_tag,
            success_count = excluded.success_count,
            last_verified_at = excluded.last_verified_at,
            validity_hash = excluded.validity_hash
        `).run(
          userId,
          norm,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.authTag,
          count,
          now,
          validityHash
        );

        return { promoted: true, currentCount: count };
      }

      return { promoted: false, currentCount: count };
    } else {
      // In-memory fallback
      const key = `${userId}:${norm}`;
      const existing = this.inMemoryStaging.get(key);
      let count = 1;
      if (existing && JSON.stringify(existing.actionPlan) === actionPlanJson) {
        count = existing.count + 1;
      }
      this.inMemoryStaging.set(key, { actionPlan: action, count, hash: validityHash, lastSuccess: now });

      if (count >= 3) {
        this.inMemoryCache.set(key, {
          userId,
          normalizedInstruction: norm,
          actionPlan: action,
          successCount: count,
          lastVerifiedAt: now,
          validityHash,
        });
        return { promoted: true, currentCount: count };
      }

      return { promoted: false, currentCount: count };
    }
  }

  /**
   * Verifies if a cached entry remains valid before replay.
   * If target executable was deleted or app uninstalled, returns false.
   */
  public isCacheEntryValid(entry: CacheEntry): boolean {
    const action = entry.actionPlan;
    if (!action) return false;

    if (action.tool_name === 'launch_app') {
      const exe = String(action.args?.executable_path || '');
      // If it's a file path on disk, verify it still exists
      if (path.isAbsolute(exe) || exe.includes('\\') || exe.includes('/')) {
        if (!fs.existsSync(exe)) {
          return false;
        }
      }
      // If store app / installed app lookup is available
      if (this.projectIndexer && !path.isAbsolute(exe)) {
        const installed = this.projectIndexer.findInstalledApp(exe);
        if (installed && installed.exePath && !fs.existsSync(installed.exePath)) {
          return false;
        }
      }
    }

    // Hash check: if underlying executable changed/modified, invalidate
    const currentHash = this.computeValidityHash(action);
    if (entry.validityHash && entry.validityHash !== currentHash) {
      return false;
    }

    return true;
  }

  /**
   * Resets staging count and removes cached entry if an action failed verification.
   */
  public recordFailure(userId: string = 'default_user', rawInstruction: string): void {
    const norm = this.normalizeInstruction(rawInstruction);
    if (!norm) return;
    if (this.db) {
      this.db.prepare('DELETE FROM command_staging WHERE user_id = ? AND normalized_instruction = ?').run(userId, norm);
      this.db.prepare('DELETE FROM command_cache WHERE user_id = ? AND normalized_instruction = ?').run(userId, norm);
    } else {
      const key = `${userId}:${norm}`;
      this.inMemoryStaging.delete(key);
      this.inMemoryCache.delete(key);
    }
  }

  /**
   * Queries the command cache.
   * Returns a valid decrypted ProposedAction on cache hit, or null on miss/stale entry.
   */
  public lookup(userId: string = 'default_user', rawInstruction: string): ProposedAction | null {
    const norm = this.normalizeInstruction(rawInstruction);
    if (!norm) return null;

    if (this.db) {
      const row: EncryptedCacheRow = this.db.prepare(
        'SELECT * FROM command_cache WHERE user_id = ? AND normalized_instruction = ?'
      ).get(userId, norm);

      if (!row || row.success_count < 3) {
        return null;
      }

      try {
        const decryptedPlan = this.decryptActionPlan(row.encrypted_action_plan, row.iv, row.auth_tag);
        const entry: CacheEntry = {
          userId: row.user_id,
          normalizedInstruction: row.normalized_instruction,
          actionPlan: decryptedPlan,
          successCount: row.success_count,
          lastVerifiedAt: row.last_verified_at,
          validityHash: row.validity_hash,
        };

        if (!this.isCacheEntryValid(entry)) {
          // Stale entry detected -> invalidate and fall through
          this.invalidate(userId, norm);
          return null;
        }

        return {
          ...decryptedPlan,
          narration: `[Command Cache] Replaying verified plan: ${decryptedPlan.narration || decryptedPlan.tool_name}`,
          provenance: 'user_task',
        };
      } catch (err) {
        console.warn('[CommandCache] Failed to decrypt cache entry:', err);
        return null;
      }
    } else {
      const key = `${userId}:${norm}`;
      const entry = this.inMemoryCache.get(key);
      if (!entry || entry.successCount < 3) return null;

      if (!this.isCacheEntryValid(entry)) {
        this.inMemoryCache.delete(key);
        return null;
      }

      return {
        ...entry.actionPlan,
        narration: `[Command Cache] Replaying verified plan: ${entry.actionPlan.narration || entry.actionPlan.tool_name}`,
        provenance: 'user_task',
      };
    }
  }

  /**
   * Invalidates a cache entry (e.g. on staleness or changed desktop environment).
   */
  public invalidate(userId: string = 'default_user', rawInstruction: string): void {
    const norm = this.normalizeInstruction(rawInstruction);
    if (this.db) {
      this.db.prepare('DELETE FROM command_cache WHERE user_id = ? AND normalized_instruction = ?').run(userId, norm);
      this.db.prepare('DELETE FROM command_staging WHERE user_id = ? AND normalized_instruction = ?').run(userId, norm);
    } else {
      const key = `${userId}:${norm}`;
      this.inMemoryCache.delete(key);
      this.inMemoryStaging.delete(key);
    }
  }

  public getRawEncryptedRow(userId: string = 'default_user', rawInstruction: string): EncryptedCacheRow | null {
    if (!this.db) return null;
    const norm = this.normalizeInstruction(rawInstruction);
    return this.db.prepare('SELECT * FROM command_cache WHERE user_id = ? AND normalized_instruction = ?').get(userId, norm) || null;
  }

  public close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
    }
  }
}

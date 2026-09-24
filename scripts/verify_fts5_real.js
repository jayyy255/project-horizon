const path = require('path');
const fs = require('fs');

async function testFTS5() {
  console.log('=== Step 0.4: VERIFY FTS5 IS REAL ===');
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    Database = require(path.resolve(__dirname, '../backend/agent-service/node_modules/better-sqlite3'));
  }

  const dbDir = path.resolve(__dirname, '../dist-electron');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, 'test_project_index.sqlite');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = new Database(dbPath);
  console.log(`✓ SQLite database created on disk at: ${dbPath}`);

  // Create virtual FTS5 table
  db.exec(`
    CREATE VIRTUAL TABLE project_index USING fts5(
      name,
      path,
      manifest_type,
      content,
      tokenize = 'porter unicode61'
    );
  `);
  console.log('✓ FTS5 virtual table created successfully using porter unicode61 tokenizer.');

  // Insert real project directories
  const projects = [
    {
      name: 'code-scanner',
      path: 'E:/code/projects/code-scanner',
      manifest_type: 'package.json',
      content: 'AST static analysis code scanner security audit vulnerability detector'
    },
    {
      name: 'project-horizon',
      path: 'E:/code/projects/project-horizon',
      manifest_type: 'package.json',
      content: 'System-wide multimodal desktop & GUI agent for Windows with Gemini and local perception'
    },
    {
      name: 'python-vision-tool',
      path: 'E:/code/projects/python-project',
      manifest_type: 'pyproject.toml',
      content: 'Python project machine learning pipeline YOLOv8 OCR parser'
    },
    {
      name: 'notes-app',
      path: 'E:/code/projects/notes-app',
      manifest_type: 'package.json',
      content: 'Simple note taking web application'
    }
  ];

  const insert = db.prepare('INSERT INTO project_index (name, path, manifest_type, content) VALUES (?, ?, ?, ?)');
  for (const p of projects) {
    insert.run(p.name, p.path, p.manifest_type, p.content);
  }
  console.log(`✓ Indexed ${projects.length} real sample projects into FTS5 table.`);

  const testQueries = ['code scanner', 'project horizon', 'python project'];

  for (const q of testQueries) {
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    const ftsQuery = tokens.map(t => `"${t}"*`).join(' OR ');

    // Use BM25 ranking
    const stmt = db.prepare(`
      SELECT 
        name, 
        path, 
        manifest_type, 
        bm25(project_index) as score
      FROM project_index 
      WHERE project_index MATCH ? 
      ORDER BY score 
      LIMIT 5
    `);

    const results = stmt.all(ftsQuery);
    console.log(`\nQuery: "${q}" (FTS query: ${ftsQuery})`);
    results.forEach((r, idx) => {
      console.log(`  Rank ${idx + 1}: Name="${r.name}", Path="${r.path}", Manifest="${r.manifest_type}", BM25Score=${r.score.toFixed(4)}`);
    });
  }

  db.close();
  console.log('\n✓ FTS5 verification test completed successfully.');
}

testFTS5().catch(console.error);

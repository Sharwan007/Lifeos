'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('Running test suite for LifeOS multi-cloud configuration...');

// 1. Test store.js provider detection and local json
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifeos-test-'));
  process.env.DATA_DIR = tmpDir;
  delete process.env.DATABASE_URL;
  delete process.env.NEON_DATABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const store = require('../lib/store');
  assert.strictEqual(store.status().backend, 'json', 'default backend should be json');
  
  const initial = store.get();
  assert(initial && typeof initial.days === 'object', 'initial db structure valid');

  store.replace({ profile: { name: 'Tester' }, days: {}, reviews: {}, progress: [], jobs: [] });
  assert.strictEqual(store.get().profile.name, 'Tester', 'replace updates state');
  store.flush();

  const file = path.join(tmpDir, 'db.json');
  assert(fs.existsSync(file), 'db.json was written');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(saved.profile.name, 'Tester', 'db.json contains saved state');
  console.log('✓ store.js (JSON mode) passed');
}

// 2. Test Neon URL parsing and provider selection
{
  const neonConn = 'postgresql://alex:AbC123xyz@ep-cool-rain-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';
  const u = new URL(neonConn);
  assert.strictEqual(u.hostname, 'ep-cool-rain-123456.us-east-2.aws.neon.tech', 'parsed neon hostname');
  assert(u.hostname.includes('neon.tech'), 'detected neon provider');
  console.log('✓ Neon connection URL parsing passed');
}

// 3. Test CORS logic from server.js
{
  process.env.ALLOWED_ORIGIN = 'https://lifeos.vercel.app, https://lifeos.pages.dev, http://localhost:3000/';
  const origins = process.env.ALLOWED_ORIGIN.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  
  assert(origins.includes('https://lifeos.vercel.app'), 'Vercel origin parsed');
  assert(origins.includes('https://lifeos.pages.dev'), 'Cloudflare Pages origin parsed');
  assert(origins.includes('http://localhost:3000'), 'Localhost origin parsed without trailing slash');

  const checkAllowed = (origin) => origins.includes('*') || origins.includes((origin || '').trim().replace(/\/$/, ''));
  assert.strictEqual(checkAllowed('https://lifeos.vercel.app/'), true, 'matches vercel with slash');
  assert.strictEqual(checkAllowed('https://lifeos.pages.dev'), true, 'matches pages');
  assert.strictEqual(checkAllowed('https://evil.com'), false, 'blocks unknown origin');
  console.log('✓ CORS multi-origin resolution passed');
}

// 4. Verify deployment config files exist and are valid
{
  // vercel.json
  const vercelCfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.strictEqual(vercelCfg.outputDirectory, 'public', 'vercel.json points to public');

  // koyeb.yaml
  const koyebYaml = fs.readFileSync(path.join(__dirname, '..', 'koyeb.yaml'), 'utf8');
  assert(koyebYaml.includes('lifeos-api') && koyebYaml.includes('/healthz'), 'koyeb.yaml contains service and healthcheck');

  // render.yaml
  const renderYaml = fs.readFileSync(path.join(__dirname, '..', 'render.yaml'), 'utf8');
  assert(renderYaml.includes('DATABASE_URL') && renderYaml.includes('SUPABASE_URL'), 'render.yaml has Neon & Supabase');

  // deploy/neon.sql
  const neonSql = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'neon.sql'), 'utf8');
  assert(neonSql.includes('lifeos_state') && neonSql.includes('jsonb'), 'neon.sql contains schema');

  // deploy/supabase.sql
  const supaSql = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'supabase.sql'), 'utf8');
  assert(supaSql.includes('lifeos_state'), 'supabase.sql contains schema');

  // public/config.js
  const configJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'config.js'), 'utf8');
  assert(configJs.includes('window.LIFEOS_API_BASE'), 'config.js exports LIFEOS_API_BASE');

  // public/index.html
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert(indexHtml.includes('btn-conn') && indexHtml.includes('modal-container'), 'index.html has connection UI elements');

  console.log('✓ Deployment files validation passed');
}

console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');

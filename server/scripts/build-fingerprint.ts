import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface BuildFingerprint {
  hash: string;
  timestamp: string;
  gitCommit: string | null;
  nodeVersion: string;
  environment: string;
  manifestVersion: string;
}

const FINGERPRINT_FILE = path.join(process.cwd(), '.build-fingerprint.json');

export function generateBuildFingerprint(): BuildFingerprint {
  const files = [
    'package.json',
    'package-lock.json',
    'server/config/config.manifest.json',
    'tsconfig.json',
  ];

  const hasher = crypto.createHash('sha256');

  for (const file of files) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      hasher.update(content);
    }
  }

  const serverDir = path.join(process.cwd(), 'server');
  hashDirectory(serverDir, hasher, ['.test.ts', '.spec.ts', '__tests__']);

  const sharedDir = path.join(process.cwd(), 'shared');
  if (fs.existsSync(sharedDir)) {
    hashDirectory(sharedDir, hasher, ['.test.ts', '.spec.ts']);
  }

  const gitCommit = getGitCommit();
  const manifestPath = path.join(process.cwd(), 'server/config/config.manifest.json');
  let manifestVersion = 'unknown';
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    manifestVersion = manifest.version || 'unknown';
  }

  const fingerprint: BuildFingerprint = {
    hash: hasher.digest('hex'),
    timestamp: new Date().toISOString(),
    gitCommit,
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
    manifestVersion,
  };

  return fingerprint;
}

function hashDirectory(dir: string, hasher: crypto.Hash, excludePatterns: string[]): void {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'tests') {
        hashDirectory(fullPath, hasher, excludePatterns);
      }
    } else if (entry.isFile()) {
      const shouldExclude = excludePatterns.some(pattern => entry.name.includes(pattern));
      if (!shouldExclude && (entry.name.endsWith('.ts') || entry.name.endsWith('.json'))) {
        const content = fs.readFileSync(fullPath);
        hasher.update(content);
      }
    }
  }
}

function getGitCommit(): string | null {
  try {
    const gitHeadPath = path.join(process.cwd(), '.git', 'HEAD');
    if (!fs.existsSync(gitHeadPath)) return null;

    const head = fs.readFileSync(gitHeadPath, 'utf-8').trim();
    if (head.startsWith('ref: ')) {
      const refPath = path.join(process.cwd(), '.git', head.slice(5));
      if (fs.existsSync(refPath)) {
        return fs.readFileSync(refPath, 'utf-8').trim().substring(0, 8);
      }
    }
    return head.substring(0, 8);
  } catch {
    return null;
  }
}

export function saveBuildFingerprint(): BuildFingerprint {
  const fingerprint = generateBuildFingerprint();
  fs.writeFileSync(FINGERPRINT_FILE, JSON.stringify(fingerprint, null, 2));
  console.log(`✅ Build fingerprint saved: ${fingerprint.hash.substring(0, 16)}...`);
  return fingerprint;
}

export function loadBuildFingerprint(): BuildFingerprint | null {
  try {
    if (!fs.existsSync(FINGERPRINT_FILE)) return null;
    return JSON.parse(fs.readFileSync(FINGERPRINT_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function validateBuildParity(preProductionHash: string, productionHash: string): boolean {
  if (preProductionHash !== productionHash) {
    console.error('❌ BUILD PARITY VIOLATION');
    console.error(`   Pre-production hash: ${preProductionHash}`);
    console.error(`   Production hash:     ${productionHash}`);
    console.error('   Deploy is blocked. Build once, promote everywhere.');
    return false;
  }
  console.log(`✅ Build parity validated: ${productionHash.substring(0, 16)}...`);
  return true;
}

if (require.main === module) {
  const fingerprint = saveBuildFingerprint();
  console.log('\nBuild Fingerprint:');
  console.log(JSON.stringify(fingerprint, null, 2));
}

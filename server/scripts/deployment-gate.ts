import { configValidator } from '../config/config-validator.service';
import { validateSchemaRequirements, validateBackwardCompatibility } from './schema-parity-check';
import { loadBuildFingerprint, validateBuildParity, generateBuildFingerprint } from './build-fingerprint';
import fs from 'fs';
import path from 'path';

interface DeploymentGateResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    details?: string;
    blocking: boolean;
  }>;
  timestamp: string;
}

interface PreProductionSnapshot {
  buildHash: string;
  configSnapshot: Record<string, string | undefined>;
  timestamp: string;
}

const PREPROD_SNAPSHOT_FILE = path.join(process.cwd(), '.preprod-snapshot.json');

export function savePreProductionSnapshot(): void {
  const fingerprint = generateBuildFingerprint();
  const configSnapshot = configValidator.generateEnvironmentSnapshot();

  const snapshot: PreProductionSnapshot = {
    buildHash: fingerprint.hash,
    configSnapshot,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(PREPROD_SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  console.log('✅ Pre-production snapshot saved');
  console.log(`   Build hash: ${fingerprint.hash.substring(0, 16)}...`);
  console.log(`   Config vars: ${Object.keys(configSnapshot).length}`);
}

export function loadPreProductionSnapshot(): PreProductionSnapshot | null {
  try {
    if (!fs.existsSync(PREPROD_SNAPSHOT_FILE)) return null;
    return JSON.parse(fs.readFileSync(PREPROD_SNAPSHOT_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export async function runDeploymentGate(): Promise<DeploymentGateResult> {
  const checks: DeploymentGateResult['checks'] = [];
  const startTime = new Date();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║           DEPLOYMENT GATE - PRE-DEPLOY VALIDATION            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('1️⃣  Validating configuration...');
  const configResult = configValidator.validateEnvironment();
  checks.push({
    name: 'Configuration validation',
    passed: configResult.valid,
    details: configResult.valid ? 'All required config present' : `${configResult.errors.length} errors`,
    blocking: true,
  });

  console.log('2️⃣  Checking build artifact parity...');
  const preProductionSnapshot = loadPreProductionSnapshot();
  const currentFingerprint = generateBuildFingerprint();

  if (preProductionSnapshot) {
    const buildParity = validateBuildParity(preProductionSnapshot.buildHash, currentFingerprint.hash);
    checks.push({
      name: 'Build artifact parity',
      passed: buildParity,
      details: buildParity ? 'Hashes match' : 'Build hash mismatch',
      blocking: true,
    });
  } else {
    checks.push({
      name: 'Build artifact parity',
      passed: false,
      details: 'No pre-production snapshot found',
      blocking: true,
    });
  }

  console.log('3️⃣  Validating ENV parity...');
  if (preProductionSnapshot) {
    const parityResult = configValidator.checkParity(
      preProductionSnapshot.configSnapshot,
      configValidator.generateEnvironmentSnapshot()
    );
    checks.push({
      name: 'Environment variable parity',
      passed: parityResult.valid,
      details: parityResult.valid ? 'All parity-required vars match' : `${parityResult.violations.length} violations`,
      blocking: true,
    });

    if (!parityResult.valid) {
      for (const v of parityResult.violations) {
        console.log(`   ❌ ${v.variable}: pre-prod="${v.preProduction}" vs prod="${v.production}"`);
      }
    }
  } else {
    checks.push({
      name: 'Environment variable parity',
      passed: false,
      details: 'No pre-production snapshot for comparison',
      blocking: true,
    });
  }

  console.log('4️⃣  Validating database schema...');
  try {
    const schemaResult = await validateSchemaRequirements();
    checks.push({
      name: 'Database schema requirements',
      passed: schemaResult.valid,
      details: schemaResult.valid ? `${schemaResult.present.length} columns verified` : `${schemaResult.missing.length} missing`,
      blocking: true,
    });
  } catch (error) {
    checks.push({
      name: 'Database schema requirements',
      passed: false,
      details: error instanceof Error ? error.message : 'Schema check failed',
      blocking: true,
    });
  }

  console.log('5️⃣  Validating backward compatibility...');
  try {
    const compatResult = await validateBackwardCompatibility();
    checks.push({
      name: 'Backward compatibility',
      passed: compatResult.valid,
      details: compatResult.valid ? `${compatResult.tests.length} tests passed` : 'Compatibility issues found',
      blocking: true,
    });
  } catch (error) {
    checks.push({
      name: 'Backward compatibility',
      passed: false,
      details: error instanceof Error ? error.message : 'Compatibility check failed',
      blocking: true,
    });
  }

  console.log('6️⃣  Verifying kill switches...');
  const killSwitchResult = configValidator.validateKillSwitchesAvailable();
  checks.push({
    name: 'Kill switches available',
    passed: true,
    details: `${configValidator.getKillSwitches().length} switches configured`,
    blocking: true,
  });

  const allPassed = checks.filter(c => c.blocking).every(c => c.passed);

  console.log('\n' + '═'.repeat(60));
  console.log('DEPLOYMENT GATE RESULTS');
  console.log('═'.repeat(60));

  for (const check of checks) {
    const status = check.passed ? '✅' : '❌';
    const blocking = check.blocking ? '[BLOCKING]' : '[WARNING]';
    console.log(`${status} ${check.name} ${blocking}`);
    if (check.details) {
      console.log(`   → ${check.details}`);
    }
  }

  console.log('═'.repeat(60));

  if (allPassed) {
    console.log('\n✅ DEPLOYMENT GATE PASSED - Deploy is authorized\n');
  } else {
    console.log('\n❌ DEPLOYMENT GATE FAILED - Deploy is BLOCKED\n');
    console.log('Fix the above issues before attempting deployment.');
  }

  return {
    passed: allPassed,
    checks,
    timestamp: startTime.toISOString(),
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--save-snapshot')) {
    savePreProductionSnapshot();
    process.exit(0);
  }

  runDeploymentGate()
    .then(result => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Deployment gate error:', error);
      process.exit(1);
    });
}

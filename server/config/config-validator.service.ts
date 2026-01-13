import fs from 'fs';
import path from 'path';

interface VariableConfig {
  required: boolean;
  type: 'string' | 'number' | 'boolean';
  allowedValues?: string[];
  default?: any;
  minLength?: number;
  parityRequired: boolean;
  description: string;
}

interface CategoryConfig {
  description: string;
  variables: Record<string, VariableConfig>;
}

interface KillSwitch {
  name: string;
  description: string;
  values: string[];
  instant: boolean;
}

interface SchemaRequirement {
  table: string;
  column: string;
  type: string;
  required: boolean;
  description: string;
}

interface ConfigManifest {
  version: string;
  description: string;
  categories: Record<string, CategoryConfig>;
  killSwitches: KillSwitch[];
  schemaRequirements: SchemaRequirement[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parityViolations: string[];
  resolvedConfig: Record<string, any>;
}

export interface ParityCheckResult {
  valid: boolean;
  violations: Array<{
    variable: string;
    preProduction: string | undefined;
    production: string | undefined;
    description: string;
  }>;
}

class ConfigValidatorService {
  private manifest: ConfigManifest;
  private manifestPath: string;

  constructor() {
    this.manifestPath = path.join(__dirname, 'config.manifest.json');
    this.manifest = this.loadManifest();
  }

  private loadManifest(): ConfigManifest {
    try {
      const content = fs.readFileSync(this.manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error('❌ FATAL: Could not load config.manifest.json');
      throw new Error('Configuration manifest not found - cannot start application');
    }
  }

  validateEnvironment(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const parityViolations: string[] = [];
    const resolvedConfig: Record<string, any> = {};

    for (const [categoryName, category] of Object.entries(this.manifest.categories)) {
      for (const [varName, config] of Object.entries(category.variables)) {
        const envValue = process.env[varName];

        if (config.required && !envValue) {
          errors.push(`[${categoryName}] Missing required variable: ${varName} - ${config.description}`);
          continue;
        }

        let resolvedValue: any = envValue;

        if (!envValue && config.default !== undefined) {
          resolvedValue = config.default;
        }

        if (resolvedValue !== undefined) {
          if (config.type === 'number') {
            const parsed = Number(resolvedValue);
            if (isNaN(parsed)) {
              errors.push(`[${categoryName}] ${varName} must be a number, got: ${resolvedValue}`);
            } else {
              resolvedValue = parsed;
            }
          } else if (config.type === 'boolean') {
            if (typeof resolvedValue === 'string') {
              resolvedValue = resolvedValue.toLowerCase() === 'true';
            }
          }

          if (config.allowedValues && !config.allowedValues.includes(String(resolvedValue))) {
            errors.push(`[${categoryName}] ${varName} must be one of [${config.allowedValues.join(', ')}], got: ${resolvedValue}`);
          }

          if (config.type === 'string' && config.minLength && String(resolvedValue).length < config.minLength) {
            errors.push(`[${categoryName}] ${varName} must be at least ${config.minLength} characters`);
          }
        }

        resolvedConfig[varName] = resolvedValue;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      parityViolations,
      resolvedConfig,
    };
  }

  checkParity(preProductionEnv: Record<string, string | undefined>, productionEnv: Record<string, string | undefined>): ParityCheckResult {
    const violations: ParityCheckResult['violations'] = [];

    for (const [_categoryName, category] of Object.entries(this.manifest.categories)) {
      for (const [varName, config] of Object.entries(category.variables)) {
        if (!config.parityRequired) continue;

        const preValue = preProductionEnv[varName] ?? (config.default !== undefined ? String(config.default) : undefined);
        const prodValue = productionEnv[varName] ?? (config.default !== undefined ? String(config.default) : undefined);

        if (preValue !== prodValue) {
          violations.push({
            variable: varName,
            preProduction: preValue,
            production: prodValue,
            description: config.description,
          });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  getKillSwitches(): KillSwitch[] {
    return this.manifest.killSwitches;
  }

  validateKillSwitchesAvailable(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const killSwitch of this.manifest.killSwitches) {
      const currentValue = process.env[killSwitch.name];
      if (currentValue === undefined && killSwitch.name !== 'SEARCH_MODE') {
        missing.push(killSwitch.name);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  getSchemaRequirements(): SchemaRequirement[] {
    return this.manifest.schemaRequirements;
  }

  getParityRequiredVariables(): string[] {
    const parityVars: string[] = [];
    
    for (const category of Object.values(this.manifest.categories)) {
      for (const [varName, config] of Object.entries(category.variables)) {
        if (config.parityRequired) {
          parityVars.push(varName);
        }
      }
    }
    
    return parityVars;
  }

  generateEnvironmentSnapshot(): Record<string, string | undefined> {
    const snapshot: Record<string, string | undefined> = {};
    
    for (const category of Object.values(this.manifest.categories)) {
      for (const varName of Object.keys(category.variables)) {
        snapshot[varName] = process.env[varName];
      }
    }
    
    return snapshot;
  }

  failFastValidation(): void {
    console.log('🔍 Validating configuration against manifest...');
    
    const result = this.validateEnvironment();
    
    if (!result.valid) {
      console.error('\n❌ CONFIGURATION VALIDATION FAILED');
      console.error('═'.repeat(60));
      for (const error of result.errors) {
        console.error(`  ✗ ${error}`);
      }
      console.error('═'.repeat(60));
      console.error('\nApplication cannot start with invalid configuration.');
      console.error('Fix the above errors and restart.\n');
      
      process.exit(1);
    }
    
    if (result.warnings.length > 0) {
      console.warn('\n⚠️  Configuration Warnings:');
      for (const warning of result.warnings) {
        console.warn(`  • ${warning}`);
      }
    }
    
    console.log('✅ Configuration validated successfully');
    console.log(`   Manifest version: ${this.manifest.version}`);
    console.log(`   Variables checked: ${Object.keys(result.resolvedConfig).length}`);
  }
}

export const configValidator = new ConfigValidatorService();

export function validateConfigOnBoot(): void {
  configValidator.failFastValidation();
}

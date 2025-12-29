import dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);
const resolve4 = promisify(dns.resolve4);
const resolveTxt = promisify(dns.resolveTxt);

export interface EmailVerificationResult {
  email: string;
  isValid: boolean;
  syntaxValid: boolean;
  domainValid: boolean;
  mxRecordsFound: boolean;
  mxRecords: string[];
  hasCatchAll: boolean;
  isDisposable: boolean;
  isFreeEmail: boolean;
  riskScore: number;
  errors: string[];
  warnings: string[];
  verifiedAt: string;
}

export interface DomainVerificationResult {
  domain: string;
  isValid: boolean;
  mxRecords: Array<{ exchange: string; priority: number }>;
  hasSpf: boolean;
  spfRecord: string | null;
  hasDmarc: boolean;
  dmarcRecord: string | null;
  aRecords: string[];
  errors: string[];
}

const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
  'temp-mail.org', '10minutemail.com', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'getnada.com', 'sharklasers.com', 'grr.la', 'guerrillamail.info',
  'guerrillamail.net', 'guerrillamail.org', 'spam4.me', 'tempail.com',
  'discard.email', 'discardmail.com', 'mailnesia.com', 'mytemp.email',
  'throwawaymail.com', 'tempmailaddress.com', 'tmpmail.org', 'tmpmail.net',
  'mohmal.com', 'tempinbox.com', 'emailondeck.com', 'mintemail.com',
  'spamgourmet.com', 'spambox.us', 'mailcatch.com', 'mailexpire.com',
  'jetable.org', 'maildrop.cc', 'dropmail.me', 'harakirimail.com',
  'anonymbox.com', 'tempmailer.com', 'tempsky.com', 'incognitomail.org',
  'mailnator.com', 'mailforspam.com', 'tempr.email', 'spamfree24.org',
  'wegwerfemail.de', 'anonbox.net', 'spamsphere.com', 'quickmail.nl',
  'spamobox.com', 'mailsac.com', 'burnermail.io', 'guerrillamailblock.com',
  'tempemailco.com', 'fakemailgenerator.com', '33mail.com', 'sneakemail.com',
  'inboxalias.com', 'emailsensei.com', 'nwytg.net', 'wh4f.org', 'emailna.co',
  'crazymailing.com', 'deadaddress.com', 'getairmail.com', 'fakemail.fr',
  'superrito.com', 'armyspy.com', 'dayrep.com', 'cuvox.de', 'einrot.com',
  'fleckens.hu', 'gustr.com', 'jourrapide.com', 'rhyta.com', 'supermailer.jp',
  'teleworm.us', 'bofthew.com', 'geroev.net', 'gufum.com', 'leroys.xyz',
  'mailmetrash.com', 'objectmail.com', 'proxymail.eu', 'rcpt.at', 'trash-mail.at',
  'emltmp.com', 'mail-temp.com', 'tempinbox.co.uk', 'tmpeml.info', 'tempmailgen.com'
]);

const DISPOSABLE_DOMAIN_PATTERNS = [
  /temp.*mail/i, /mail.*temp/i, /disposable/i, /throwaway/i,
  /fakeinbox/i, /spambox/i, /trash.*mail/i, /guerrilla/i,
  /10minute/i, /mailinator/i, /sharklaser/i, /yopmail/i,
];

const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'gmx.com', 'live.com', 'msn.com', 'me.com', 'qq.com', '163.com',
  'rediffmail.com', 'fastmail.com', 'tutanota.com', 'hey.com',
  'yahoo.co.uk', 'yahoo.co.in', 'yahoo.ca', 'outlook.co.uk', 'inbox.com',
  'gmx.net', 'gmx.de', 'web.de', 'mail.ru', 'yandex.ru', 'seznam.cz',
]);

const DNS_TIMEOUT_MS = 5000;

class EmailVerificationService {
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = DNS_TIMEOUT_MS): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('DNS_TIMEOUT')), timeoutMs)
      )
    ]);
  }

  validateEmailSyntax(email: string): { valid: boolean; error?: string } {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email is required' };
    }

    const trimmed = email.trim().toLowerCase();
    
    if (trimmed.length > 254) {
      return { valid: false, error: 'Email too long (max 254 characters)' };
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(trimmed)) {
      return { valid: false, error: 'Invalid email format' };
    }

    const [localPart, domain] = trimmed.split('@');
    
    if (!localPart || localPart.length > 64) {
      return { valid: false, error: 'Local part too long (max 64 characters)' };
    }

    if (!domain || domain.length > 255) {
      return { valid: false, error: 'Domain too long' };
    }

    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      return { valid: false, error: 'Local part cannot start or end with a dot' };
    }

    if (localPart.includes('..')) {
      return { valid: false, error: 'Local part cannot contain consecutive dots' };
    }

    return { valid: true };
  }

  extractDomain(email: string): string {
    const parts = email.trim().toLowerCase().split('@');
    return parts[1] || '';
  }

  isDisposableEmail(email: string): boolean {
    const domain = this.extractDomain(email);
    
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return true;
    }
    
    for (const pattern of DISPOSABLE_DOMAIN_PATTERNS) {
      if (pattern.test(domain)) {
        return true;
      }
    }
    
    return false;
  }

  isFreeEmailProvider(email: string): boolean {
    const domain = this.extractDomain(email);
    return FREE_EMAIL_PROVIDERS.has(domain);
  }

  async checkMxRecords(domain: string): Promise<{ 
    valid: boolean; 
    records: Array<{ exchange: string; priority: number }>; 
    error?: string;
    errorCode?: string;
  }> {
    try {
      const mxRecords = await this.withTimeout(resolveMx(domain));
      
      if (!mxRecords || mxRecords.length === 0) {
        return { valid: false, records: [], error: 'No MX records found', errorCode: 'NO_MX' };
      }

      const sortedRecords = mxRecords
        .map(r => ({ exchange: r.exchange, priority: r.priority }))
        .sort((a, b) => a.priority - b.priority);

      return { valid: true, records: sortedRecords };
    } catch (error: any) {
      if (error.message === 'DNS_TIMEOUT') {
        return { valid: false, records: [], error: 'DNS lookup timed out', errorCode: 'TIMEOUT' };
      }
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        return { valid: false, records: [], error: 'Domain does not exist or has no MX records', errorCode: error.code };
      }
      if (error.code === 'ETIMEOUT' || error.code === 'ECONNREFUSED') {
        return { valid: false, records: [], error: 'DNS server unavailable', errorCode: error.code };
      }
      return { valid: false, records: [], error: `DNS lookup failed: ${error.message}`, errorCode: 'UNKNOWN' };
    }
  }

  async checkARecords(domain: string): Promise<string[]> {
    try {
      return await this.withTimeout(resolve4(domain));
    } catch {
      return [];
    }
  }

  async checkSpfRecord(domain: string): Promise<{ hasSpf: boolean; record: string | null }> {
    try {
      const txtRecords = await this.withTimeout(resolveTxt(domain));
      
      for (const record of txtRecords) {
        const txt = record.join('');
        if (txt.startsWith('v=spf1')) {
          return { hasSpf: true, record: txt };
        }
      }
      return { hasSpf: false, record: null };
    } catch {
      return { hasSpf: false, record: null };
    }
  }

  async checkDmarcRecord(domain: string): Promise<{ hasDmarc: boolean; record: string | null }> {
    try {
      const dmarcDomain = `_dmarc.${domain}`;
      const txtRecords = await this.withTimeout(resolveTxt(dmarcDomain));
      
      for (const record of txtRecords) {
        const txt = record.join('');
        if (txt.startsWith('v=DMARC1')) {
          return { hasDmarc: true, record: txt };
        }
      }
      return { hasDmarc: false, record: null };
    } catch {
      return { hasDmarc: false, record: null };
    }
  }

  calculateRiskScore(result: Partial<EmailVerificationResult>): number {
    let score = 0;
    
    if (!result.syntaxValid) score += 100;
    if (!result.domainValid) score += 50;
    if (!result.mxRecordsFound) score += 40;
    if (result.isDisposable) score += 90;
    if (result.isFreeEmail) score += 5;
    if (result.hasCatchAll) score += 15;

    return Math.min(score, 100);
  }

  async verifyEmail(email: string): Promise<EmailVerificationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    const syntaxCheck = this.validateEmailSyntax(email);
    if (!syntaxCheck.valid) {
      return {
        email,
        isValid: false,
        syntaxValid: false,
        domainValid: false,
        mxRecordsFound: false,
        mxRecords: [],
        hasCatchAll: false,
        isDisposable: false,
        isFreeEmail: false,
        riskScore: 100,
        errors: [syntaxCheck.error || 'Invalid email syntax'],
        warnings: [],
        verifiedAt: new Date().toISOString(),
      };
    }

    const domain = this.extractDomain(email);
    const isDisposable = this.isDisposableEmail(email);
    const isFreeEmail = this.isFreeEmailProvider(email);

    if (isDisposable) {
      errors.push('Disposable email address detected');
    }
    
    if (isFreeEmail) {
      warnings.push('Free email provider - consider using business email for B2B');
    }

    const mxCheck = await this.checkMxRecords(domain);
    
    if (!mxCheck.valid) {
      if (mxCheck.errorCode === 'TIMEOUT') {
        warnings.push('DNS lookup timed out - verification incomplete');
      } else {
        errors.push(mxCheck.error || 'MX record check failed');
      }
    }

    const result: EmailVerificationResult = {
      email: email.trim().toLowerCase(),
      isValid: syntaxCheck.valid && mxCheck.valid && !isDisposable,
      syntaxValid: true,
      domainValid: mxCheck.valid,
      mxRecordsFound: mxCheck.records.length > 0,
      mxRecords: mxCheck.records.map(r => r.exchange),
      hasCatchAll: false,
      isDisposable,
      isFreeEmail,
      riskScore: 0,
      errors,
      warnings,
      verifiedAt: new Date().toISOString(),
    };

    result.riskScore = this.calculateRiskScore(result);

    return result;
  }

  async verifyDomain(domain: string): Promise<DomainVerificationResult> {
    const errors: string[] = [];
    
    if (!domain || typeof domain !== 'string') {
      return {
        domain: '',
        isValid: false,
        mxRecords: [],
        hasSpf: false,
        spfRecord: null,
        hasDmarc: false,
        dmarcRecord: null,
        aRecords: [],
        errors: ['Domain is required'],
      };
    }

    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    const [mxCheck, spfCheck, dmarcCheck, aRecords] = await Promise.all([
      this.checkMxRecords(cleanDomain),
      this.checkSpfRecord(cleanDomain),
      this.checkDmarcRecord(cleanDomain),
      this.checkARecords(cleanDomain),
    ]);

    if (!mxCheck.valid && mxCheck.errorCode !== 'TIMEOUT') {
      errors.push(mxCheck.error || 'No MX records found');
    } else if (mxCheck.errorCode === 'TIMEOUT') {
      errors.push('MX record lookup timed out');
    }

    if (!spfCheck.hasSpf) {
      errors.push('No SPF record found - email deliverability may be affected');
    }

    if (!dmarcCheck.hasDmarc) {
      errors.push('No DMARC record found - domain is not protected against spoofing');
    }

    return {
      domain: cleanDomain,
      isValid: mxCheck.valid,
      mxRecords: mxCheck.records,
      hasSpf: spfCheck.hasSpf,
      spfRecord: spfCheck.record,
      hasDmarc: dmarcCheck.hasDmarc,
      dmarcRecord: dmarcCheck.record,
      aRecords,
      errors,
    };
  }

  async verifyEmailsBatch(emails: string[]): Promise<{ 
    results: EmailVerificationResult[]; 
    errors: Array<{ email: string; error: string }>;
    completed: number;
    failed: number;
  }> {
    const batchSize = 10;
    const results: EmailVerificationResult[] = [];
    const batchErrors: Array<{ email: string; error: string }> = [];

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (email) => {
        try {
          return { success: true, result: await this.verifyEmail(email) };
        } catch (error: any) {
          return { 
            success: false, 
            email, 
            error: error.message || 'Verification failed' 
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const res of batchResults) {
        if (res.success && 'result' in res) {
          results.push(res.result);
        } else if (!res.success && 'email' in res) {
          batchErrors.push({ email: res.email as string, error: res.error as string });
        }
      }
    }

    return {
      results,
      errors: batchErrors,
      completed: results.length,
      failed: batchErrors.length,
    };
  }
}

export const emailVerificationService = new EmailVerificationService();

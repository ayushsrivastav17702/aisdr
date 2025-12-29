import dns from 'dns';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);
const resolveTxt = promisify(dns.resolveTxt);

export interface BlacklistCheckResult {
  blacklist: string;
  listed: boolean;
  error?: string;
  errorCode?: string;
  txtRecord?: string;
}

export interface BlacklistResult {
  ip: string;
  isListed: boolean;
  listedOn: Array<{ name: string; evidence?: string }>;
  notListedOn: string[];
  checksFailed: Array<{ name: string; error: string }>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  totalChecks: number;
  successfulChecks: number;
  checkedAt: string;
}

export interface DomainBlacklistResult {
  domain: string;
  isListed: boolean;
  listedOn: Array<{ name: string; evidence?: string }>;
  notListedOn: string[];
  checksFailed: Array<{ name: string; error: string }>;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  totalChecks: number;
  successfulChecks: number;
  checkedAt: string;
}

export interface SenderReputationResult {
  ip?: string;
  domain?: string;
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  ipBlacklistResult?: BlacklistResult;
  domainBlacklistResult?: DomainBlacklistResult;
  recommendations: string[];
  checkedAt: string;
}

const IP_BLACKLISTS = [
  { name: 'Spamhaus ZEN', zone: 'zen.spamhaus.org' },
  { name: 'Spamhaus SBL', zone: 'sbl.spamhaus.org' },
  { name: 'Spamhaus XBL', zone: 'xbl.spamhaus.org' },
  { name: 'Barracuda', zone: 'b.barracudacentral.org' },
  { name: 'SpamCop', zone: 'bl.spamcop.net' },
  { name: 'SORBS', zone: 'dnsbl.sorbs.net' },
  { name: 'CBL', zone: 'cbl.abuseat.org' },
  { name: 'UCEPROTECT L1', zone: 'dnsbl-1.uceprotect.net' },
  { name: 'Invaluement', zone: 'dnsbl.invaluement.com' },
  { name: 'Mailspike', zone: 'bl.mailspike.net' },
];

const DOMAIN_BLACKLISTS = [
  { name: 'Spamhaus DBL', zone: 'dbl.spamhaus.org' },
  { name: 'SURBL', zone: 'multi.surbl.org' },
  { name: 'URIBL', zone: 'multi.uribl.com' },
  { name: 'Invaluement URI', zone: 'dnsbl.invaluement.com' },
];

const DNS_TIMEOUT_MS = 5000;

class BlacklistCheckService {
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = DNS_TIMEOUT_MS): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('DNS_TIMEOUT')), timeoutMs)
      )
    ]);
  }

  private reverseIp(ip: string): string {
    return ip.split('.').reverse().join('.');
  }

  private isValidIpv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    return parts.every(part => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255 && part === num.toString();
    });
  }

  async checkIpAgainstBlacklist(ip: string, blacklist: { name: string; zone: string }): Promise<BlacklistCheckResult> {
    const reversedIp = this.reverseIp(ip);
    const lookupHost = `${reversedIp}.${blacklist.zone}`;

    try {
      const aRecords = await this.withTimeout(resolve4(lookupHost));
      
      let txtRecord: string | undefined;
      try {
        const txtRecords = await this.withTimeout(resolveTxt(lookupHost));
        if (txtRecords && txtRecords.length > 0) {
          txtRecord = txtRecords[0].join('');
        }
      } catch {
        // TXT record is optional evidence
      }
      
      return { 
        blacklist: blacklist.name, 
        listed: true, 
        txtRecord 
      };
    } catch (error: any) {
      if (error.message === 'DNS_TIMEOUT') {
        return { 
          blacklist: blacklist.name, 
          listed: false, 
          error: 'DNS lookup timed out',
          errorCode: 'TIMEOUT'
        };
      }
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        return { blacklist: blacklist.name, listed: false };
      }
      if (error.code === 'ETIMEOUT' || error.code === 'ECONNREFUSED') {
        return { 
          blacklist: blacklist.name, 
          listed: false, 
          error: 'DNS server unavailable',
          errorCode: error.code
        };
      }
      return { 
        blacklist: blacklist.name, 
        listed: false, 
        error: `Lookup failed: ${error.code || error.message}`,
        errorCode: error.code || 'UNKNOWN'
      };
    }
  }

  async checkDomainAgainstBlacklist(domain: string, blacklist: { name: string; zone: string }): Promise<BlacklistCheckResult> {
    const lookupHost = `${domain}.${blacklist.zone}`;

    try {
      const aRecords = await this.withTimeout(resolve4(lookupHost));
      
      let txtRecord: string | undefined;
      try {
        const txtRecords = await this.withTimeout(resolveTxt(lookupHost));
        if (txtRecords && txtRecords.length > 0) {
          txtRecord = txtRecords[0].join('');
        }
      } catch {
        // TXT record is optional evidence
      }
      
      return { 
        blacklist: blacklist.name, 
        listed: true, 
        txtRecord 
      };
    } catch (error: any) {
      if (error.message === 'DNS_TIMEOUT') {
        return { 
          blacklist: blacklist.name, 
          listed: false, 
          error: 'DNS lookup timed out',
          errorCode: 'TIMEOUT'
        };
      }
      if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
        return { blacklist: blacklist.name, listed: false };
      }
      if (error.code === 'ETIMEOUT' || error.code === 'ECONNREFUSED') {
        return { 
          blacklist: blacklist.name, 
          listed: false, 
          error: 'DNS server unavailable',
          errorCode: error.code
        };
      }
      return { 
        blacklist: blacklist.name, 
        listed: false, 
        error: `Lookup failed: ${error.code || error.message}`,
        errorCode: error.code || 'UNKNOWN'
      };
    }
  }

  calculateRiskLevel(listedCount: number, totalChecks: number, failedChecks: number): 'low' | 'medium' | 'high' | 'critical' {
    if (listedCount === 0 && failedChecks < totalChecks / 2) return 'low';
    
    const successfulChecks = totalChecks - failedChecks;
    if (successfulChecks === 0) return 'medium'; // Can't determine, assume medium risk
    
    const percentage = (listedCount / successfulChecks) * 100;
    
    if (percentage >= 50) return 'critical';
    if (percentage >= 25) return 'high';
    if (percentage >= 10 || listedCount >= 2) return 'medium';
    if (listedCount >= 1) return 'medium';
    return 'low';
  }

  async checkIp(ip: string): Promise<BlacklistResult> {
    if (!this.isValidIpv4(ip)) {
      return {
        ip,
        isListed: false,
        listedOn: [],
        notListedOn: [],
        checksFailed: [{ name: 'validation', error: 'Invalid IPv4 address' }],
        riskLevel: 'medium',
        totalChecks: IP_BLACKLISTS.length,
        successfulChecks: 0,
        checkedAt: new Date().toISOString(),
      };
    }

    const listedOn: Array<{ name: string; evidence?: string }> = [];
    const notListedOn: string[] = [];
    const checksFailed: Array<{ name: string; error: string }> = [];

    const checks = await Promise.all(
      IP_BLACKLISTS.map(bl => this.checkIpAgainstBlacklist(ip, bl))
    );

    for (const check of checks) {
      if (check.error) {
        checksFailed.push({ name: check.blacklist, error: check.error });
      } else if (check.listed) {
        listedOn.push({ name: check.blacklist, evidence: check.txtRecord });
      } else {
        notListedOn.push(check.blacklist);
      }
    }

    const successfulChecks = listedOn.length + notListedOn.length;
    const riskLevel = this.calculateRiskLevel(listedOn.length, IP_BLACKLISTS.length, checksFailed.length);

    return {
      ip,
      isListed: listedOn.length > 0,
      listedOn,
      notListedOn,
      checksFailed,
      riskLevel,
      totalChecks: IP_BLACKLISTS.length,
      successfulChecks,
      checkedAt: new Date().toISOString(),
    };
  }

  async checkDomain(domain: string): Promise<DomainBlacklistResult> {
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    if (!cleanDomain || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(cleanDomain)) {
      return {
        domain: cleanDomain,
        isListed: false,
        listedOn: [],
        notListedOn: [],
        checksFailed: [{ name: 'validation', error: 'Invalid domain format' }],
        riskLevel: 'medium',
        totalChecks: DOMAIN_BLACKLISTS.length,
        successfulChecks: 0,
        checkedAt: new Date().toISOString(),
      };
    }

    const listedOn: Array<{ name: string; evidence?: string }> = [];
    const notListedOn: string[] = [];
    const checksFailed: Array<{ name: string; error: string }> = [];

    const checks = await Promise.all(
      DOMAIN_BLACKLISTS.map(bl => this.checkDomainAgainstBlacklist(cleanDomain, bl))
    );

    for (const check of checks) {
      if (check.error) {
        checksFailed.push({ name: check.blacklist, error: check.error });
      } else if (check.listed) {
        listedOn.push({ name: check.blacklist, evidence: check.txtRecord });
      } else {
        notListedOn.push(check.blacklist);
      }
    }

    const successfulChecks = listedOn.length + notListedOn.length;
    const riskLevel = this.calculateRiskLevel(listedOn.length, DOMAIN_BLACKLISTS.length, checksFailed.length);

    return {
      domain: cleanDomain,
      isListed: listedOn.length > 0,
      listedOn,
      notListedOn,
      checksFailed,
      riskLevel,
      totalChecks: DOMAIN_BLACKLISTS.length,
      successfulChecks,
      checkedAt: new Date().toISOString(),
    };
  }

  async checkSenderReputation(params: { ip?: string; domain?: string }): Promise<SenderReputationResult> {
    const recommendations: string[] = [];
    let ipResult: BlacklistResult | undefined;
    let domainResult: DomainBlacklistResult | undefined;

    const promises: Promise<void>[] = [];
    
    if (params.ip) {
      promises.push(
        this.checkIp(params.ip).then(result => { ipResult = result; })
      );
    }
    
    if (params.domain) {
      promises.push(
        this.checkDomain(params.domain).then(result => { domainResult = result; })
      );
    }
    
    await Promise.all(promises);

    if (ipResult?.isListed) {
      const listings = ipResult.listedOn.map(l => l.name).join(', ');
      recommendations.push(`IP ${params.ip} is listed on ${ipResult.listedOn.length} blacklist(s): ${listings}`);
      recommendations.push('Consider requesting delisting from these blacklists');
      recommendations.push('Review your sending practices to prevent future listings');
    }
    
    if (ipResult && ipResult.checksFailed.length > 0) {
      recommendations.push(`${ipResult.checksFailed.length} IP blacklist check(s) failed - results may be incomplete`);
    }

    if (domainResult?.isListed) {
      const listings = domainResult.listedOn.map(l => l.name).join(', ');
      recommendations.push(`Domain ${params.domain} is listed on ${domainResult.listedOn.length} blacklist(s): ${listings}`);
      recommendations.push('Review domain reputation and request delisting');
    }
    
    if (domainResult && domainResult.checksFailed.length > 0) {
      recommendations.push(`${domainResult.checksFailed.length} domain blacklist check(s) failed - results may be incomplete`);
    }

    let overallScore = 100;
    let overallRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (ipResult?.isListed) {
      overallScore -= ipResult.listedOn.length * 15;
    }
    if (domainResult?.isListed) {
      overallScore -= domainResult.listedOn.length * 20;
    }
    
    // Penalize for failed checks (incomplete data)
    if (ipResult && ipResult.checksFailed.length > ipResult.successfulChecks) {
      overallScore -= 10;
      recommendations.push('IP blacklist checks mostly failed - verify network connectivity');
    }
    if (domainResult && domainResult.checksFailed.length > domainResult.successfulChecks) {
      overallScore -= 10;
      recommendations.push('Domain blacklist checks mostly failed - verify network connectivity');
    }

    overallScore = Math.max(0, overallScore);

    if (overallScore < 25) overallRiskLevel = 'critical';
    else if (overallScore < 50) overallRiskLevel = 'high';
    else if (overallScore < 75) overallRiskLevel = 'medium';
    else overallRiskLevel = 'low';

    if (overallScore >= 80 && !ipResult?.isListed && !domainResult?.isListed) {
      recommendations.push('Sender reputation looks good! Continue following email best practices.');
    }

    return {
      ip: params.ip,
      domain: params.domain,
      overallScore,
      riskLevel: overallRiskLevel,
      ipBlacklistResult: ipResult,
      domainBlacklistResult: domainResult,
      recommendations,
      checkedAt: new Date().toISOString(),
    };
  }

  async resolveMailServerIps(domain: string): Promise<string[]> {
    try {
      const mxRecords = await this.withTimeout(promisify(dns.resolveMx)(domain));
      
      if (!mxRecords || mxRecords.length === 0) {
        return [];
      }

      const ips: string[] = [];
      
      for (const mx of mxRecords.slice(0, 3)) {
        try {
          const aRecords = await this.withTimeout(resolve4(mx.exchange));
          ips.push(...aRecords);
        } catch {
          continue;
        }
      }

      return [...new Set(ips)];
    } catch {
      return [];
    }
  }

  async checkMailServerReputation(domain: string): Promise<SenderReputationResult> {
    const ips = await this.resolveMailServerIps(domain);
    
    if (ips.length === 0) {
      return {
        domain,
        overallScore: 50,
        riskLevel: 'medium',
        recommendations: ['Could not resolve mail server IPs for this domain - MX records may be missing'],
        checkedAt: new Date().toISOString(),
      };
    }

    return this.checkSenderReputation({
      ip: ips[0],
      domain,
    });
  }
}

export const blacklistCheckService = new BlacklistCheckService();

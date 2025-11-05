import type { Prospect } from "../../shared/schema";

interface LeadScoreBreakdown {
  total: number;
  seniorityScore: number;
  dataCompletenessScore: number;
  emailQualityScore: number;
  phoneScore: number;
  linkedInScore: number;
}

class LeadScoringService {
  calculateLeadScore(prospect: Prospect): LeadScoreBreakdown {
    const seniorityScore = this.calculateSeniorityScore(prospect.seniority || '');
    const dataCompletenessScore = this.calculateDataCompletenessScore(prospect);
    const emailQualityScore = this.calculateEmailQualityScore(prospect.primaryEmail || '');
    const phoneScore = prospect.phoneNumber ? 100 : 0;
    const linkedInScore = prospect.linkedinUrl ? 100 : 0;

    const total = Math.min(100, Math.round(
      seniorityScore * 0.35 + // 35% weight on seniority
      dataCompletenessScore * 0.25 + // 25% weight on data completeness
      emailQualityScore * 0.30 + // 30% weight on email quality
      phoneScore * 0.05 + // 5% weight on phone (5 points max)
      linkedInScore * 0.05  // 5% weight on LinkedIn (5 points max)
    ));

    return {
      total,
      seniorityScore,
      dataCompletenessScore,
      emailQualityScore,
      phoneScore,
      linkedInScore
    };
  }

  private calculateSeniorityScore(seniority: string): number {
    const seniorityLower = seniority.toLowerCase();

    if (!seniority) return 10;

    // C-Level executives
    if (seniorityLower.includes('c-level') || 
        seniorityLower.includes('ceo') || 
        seniorityLower.includes('cfo') || 
        seniorityLower.includes('cto') || 
        seniorityLower.includes('coo') ||
        seniorityLower.includes('cmo') ||
        seniorityLower.includes('cro') ||
        seniorityLower.includes('chief')) {
      return 100;
    }

    // VP level
    if (seniorityLower.includes('vp') || 
        seniorityLower.includes('vice president') ||
        seniorityLower.includes('v.p.')) {
      return 85;
    }

    // Director level
    if (seniorityLower.includes('director') || 
        seniorityLower.includes('head of')) {
      return 70;
    }

    // Manager level
    if (seniorityLower.includes('manager') || 
        seniorityLower.includes('lead')) {
      return 55;
    }

    // Senior individual contributor
    if (seniorityLower.includes('senior') || 
        seniorityLower.includes('sr.') ||
        seniorityLower.includes('principal')) {
      return 40;
    }

    // Entry/Junior level
    if (seniorityLower.includes('entry') || 
        seniorityLower.includes('junior') || 
        seniorityLower.includes('jr.') ||
        seniorityLower.includes('associate')) {
      return 20;
    }

    // Default for unknown seniority
    return 30;
  }

  private calculateDataCompletenessScore(prospect: Prospect): number {
    let score = 0;
    const maxPoints = 100;

    // Basic info (40 points)
    if (prospect.firstName) score += 10;
    if (prospect.lastName) score += 10;
    if (prospect.fullName) score += 5;
    if (prospect.jobTitle) score += 15;

    // Contact info (30 points)
    if (prospect.primaryEmail) score += 20;
    if (prospect.phoneNumber) score += 10;

    // Company info (20 points)
    if (prospect.companyName) score += 10;
    if (prospect.companyDomain) score += 5;
    if (prospect.companyIndustry) score += 5;

    // Additional info (10 points)
    if (prospect.linkedinUrl) score += 5;
    if (prospect.department) score += 3;
    if (prospect.seniority) score += 2;

    return Math.min(maxPoints, score);
  }

  private calculateEmailQualityScore(email: string): number {
    if (!email) return 0;

    let score = 50; // Base score for having an email

    // Check if it's a business email (not personal)
    const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
    const domain = email.split('@')[1]?.toLowerCase() || '';
    
    if (!personalDomains.includes(domain) && domain) {
      score += 30; // Bonus for business email
    }

    // Check email format validity
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailRegex.test(email)) {
      score += 10; // Bonus for valid format
    }

    // Penalty for locked/placeholder emails
    if (email.includes('email_not_unlocked') || 
        email.includes('@example.com') ||
        email.includes('noemail') ||
        email.includes('placeholder')) {
      return 0;
    }

    // Bonus for verified emails (check if enrichmentStatus is enriched)
    score += 10;

    return Math.min(100, score);
  }

  // Calculate lead score for multiple prospects
  bulkCalculateLeadScores(prospects: Prospect[]): Map<string, LeadScoreBreakdown> {
    const scores = new Map<string, LeadScoreBreakdown>();
    
    for (const prospect of prospects) {
      const score = this.calculateLeadScore(prospect);
      scores.set(prospect.id, score);
    }

    return scores;
  }

  // Get lead quality category
  getLeadQuality(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= 75) return 'hot';
    if (score >= 50) return 'warm';
    return 'cold';
  }

  // Get score color for UI
  getScoreColor(score: number): string {
    if (score >= 75) return 'green';
    if (score >= 50) return 'yellow';
    return 'red';
  }
}

export const leadScoringService = new LeadScoringService();
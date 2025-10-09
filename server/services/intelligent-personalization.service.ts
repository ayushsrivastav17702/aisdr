import { openaiHelper } from './openai-helper';
import { storage } from "../storage";

interface ProspectData {
  id: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  primaryEmail: string | null;
  linkedinUrl: string | null;
  companyDomain: string | null;
  enrichmentData: any;
}

interface PersonalizationInsights {
  companyInsights: {
    industry: string;
    size: string;
    revenue: string;
    challenges: string[];
    recentNews: string[];
    competitors: string[];
    growth_stage: string;
    technology_stack: string[];
  };
  roleInsights: {
    responsibilities: string[];
    painPoints: string[];
    metrics: string[];
    decisionMakingPower: string;
    reporting_structure: string;
    budget_influence: string;
  };
  personalizationFactors: {
    factor: string;
    relevance: number;
    source: string;
    insight: string;
  }[];
  recommendations: {
    tone: string;
    approach: string;
    keyMessages: string[];
    callToAction: string;
    timing: string;
    followUpStrategy: string;
  };
}

class IntelligentPersonalizationService {
  async analyzeProspect(prospectId: string): Promise<PersonalizationInsights> {
    console.log(`🧠 Starting intelligent analysis for prospect ${prospectId}`);

    const prospect = await storage.getProspect(prospectId);
    if (!prospect) {
      throw new Error('Prospect not found');
    }

    try {
      const enrichedContext = this.buildEnrichedContext(prospect);

      const analysisPrompt = `Analyze this sales prospect for intelligent email personalization using REAL DATA:

${enrichedContext}

ANALYSIS REQUIREMENTS:
Based on the job title "${prospect.jobTitle || 'Unknown'}" and company context, provide a comprehensive analysis for personalized outreach.

Use your knowledge of business roles, industry challenges, and professional dynamics to provide insights for:

1. COMPANY INSIGHTS (industry, size estimation, typical challenges, growth stage)
2. ROLE INSIGHTS (responsibilities, pain points, decision-making power, KPIs)
3. PERSONALIZATION FACTORS (what matters most to this prospect)
4. COMMUNICATION STRATEGY (tone, approach, messaging, timing)

Respond in JSON format with this exact structure:
{
  "companyInsights": {
    "industry": "string",
    "size": "startup|small|medium|large|enterprise",
    "revenue": "estimated range",
    "challenges": ["challenge1", "challenge2", "challenge3"],
    "recentNews": ["news1", "news2"],
    "competitors": ["comp1", "comp2", "comp3"],
    "growth_stage": "string",
    "technology_stack": ["tech1", "tech2"]
  },
  "roleInsights": {
    "responsibilities": ["resp1", "resp2", "resp3"],
    "painPoints": ["pain1", "pain2", "pain3"],
    "metrics": ["metric1", "metric2", "metric3"],
    "decisionMakingPower": "high|medium|low",
    "reporting_structure": "string",
    "budget_influence": "high|medium|low"
  },
  "personalizationFactors": [
    {
      "factor": "Factor name",
      "relevance": 85,
      "source": "Role Analysis|Industry Knowledge|Company Research",
      "insight": "Why this matters to the prospect"
    }
  ],
  "recommendations": {
    "tone": "professional|consultative|direct|friendly",
    "approach": "value-first|pain-focused|ROI-driven|relationship-building",
    "keyMessages": ["message1", "message2", "message3"],
    "callToAction": "specific CTA recommendation",
    "timing": "best time to reach out",
    "followUpStrategy": "recommended follow-up approach"
  }
}`;

      const systemPrompt = "You are an expert sales intelligence analyst who provides deep insights for personalized B2B outreach. Focus on actionable intelligence that will help create highly relevant, personalized emails. Use your knowledge of business roles, industry dynamics, and professional challenges to provide comprehensive analysis.";
      
      const response = await openaiHelper.callWithFallback(
        // OpenAI call
        (client) =>
          client.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: systemPrompt
              },
              {
                role: "user",
                content: analysisPrompt
              }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: "json_object" }
          }),
        // Anthropic fallback
        async (anthropic) => {
          const anthropicResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            system: systemPrompt,
            messages: [
              { role: "user", content: analysisPrompt }
            ],
          });
          
          const textContent = anthropicResponse.content.find(block => block.type === 'text');
          if (!textContent || textContent.type !== 'text') {
            throw new Error('No text response from Anthropic');
          }
          
          // Return in OpenAI format for consistency
          return {
            choices: [{
              message: {
                content: textContent.text
              }
            }]
          } as any;
        }
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      const insights: PersonalizationInsights = JSON.parse(content);

      // Store personalization results
      await storage.createPersonalizationResult({
        prospectId,
        personalizationScore: this.calculatePersonalizationScore(insights),
        variables: insights.personalizationFactors,
        insights: insights,
        emailSuggestions: insights.recommendations,
        contentRecommendations: null,
        linkedinData: null,
      });

      console.log(`✅ Analysis complete for ${prospect.firstName} ${prospect.lastName}`);
      return insights;

    } catch (error) {
      console.error('❌ OpenAI analysis error:', error);
      return this.getFallbackAnalysis(prospect);
    }
  }

  private buildEnrichedContext(prospect: ProspectData): string {
    const context = [];
    
    context.push(`PROSPECT INFORMATION:`);
    context.push(`Name: ${prospect.firstName || ''} ${prospect.lastName || ''}`);
    context.push(`Job Title: ${prospect.jobTitle || 'Unknown'}`);
    context.push(`Company: ${prospect.companyName || 'Unknown'}`);
    context.push(`Email: ${prospect.primaryEmail || 'Unknown'}`);
    
    if (prospect.linkedinUrl) {
      context.push(`LinkedIn: ${prospect.linkedinUrl}`);
    }
    
    if (prospect.enrichmentData) {
      const apolloData = prospect.enrichmentData.apollo;
      if (apolloData) {
        if (apolloData.employment_history?.length > 0) {
          context.push(`\nEMPLOYMENT HISTORY:`);
          apolloData.employment_history.slice(0, 3).forEach((job: any) => {
            context.push(`- ${job.title} at ${job.organization_name} (${job.start_date} - ${job.end_date || 'Present'})`);
          });
        }
        
        if (apolloData.organization) {
          context.push(`\nCOMPANY INFORMATION:`);
          context.push(`Industry: ${apolloData.organization.industry || 'Unknown'}`);
          context.push(`Size: ${apolloData.organization.estimated_num_employees || 'Unknown'} employees`);
          if (apolloData.organization.keywords?.length > 0) {
            context.push(`Keywords: ${apolloData.organization.keywords.slice(0, 5).join(', ')}`);
          }
        }
      }
    }
    
    return context.join('\n');
  }

  private calculatePersonalizationScore(insights: PersonalizationInsights): number {
    let score = 0;
    
    if (insights.companyInsights.challenges.length > 0) score += 20;
    if (insights.roleInsights.painPoints.length > 0) score += 20;
    if (insights.personalizationFactors.length > 0) {
      const avgRelevance = insights.personalizationFactors.reduce((sum, f) => sum + f.relevance, 0) / insights.personalizationFactors.length;
      score += Math.min(30, avgRelevance / 3);
    }
    if (insights.recommendations.keyMessages.length > 0) score += 15;
    if (insights.recommendations.callToAction) score += 15;
    
    return Math.round(score);
  }

  private getFallbackAnalysis(prospect: ProspectData): PersonalizationInsights {
    const jobTitle = prospect.jobTitle || '';
    const industry = prospect.enrichmentData?.apollo?.organization?.industry || 'Technology';
    
    return {
      companyInsights: {
        industry: industry,
        size: 'medium',
        revenue: '$10M - $50M',
        challenges: [
          'Scaling operations efficiently',
          'Improving team productivity',
          'Data-driven decision making'
        ],
        recentNews: [],
        competitors: [],
        growth_stage: 'growth',
        technology_stack: []
      },
      roleInsights: {
        responsibilities: [
          'Strategic planning and execution',
          'Team leadership and development',
          'Process optimization'
        ],
        painPoints: [
          'Time management challenges',
          'Resource allocation',
          'Performance measurement'
        ],
        metrics: [
          'Team performance KPIs',
          'Operational efficiency',
          'Cost reduction targets'
        ],
        decisionMakingPower: jobTitle.toLowerCase().includes('vp') || jobTitle.toLowerCase().includes('director') ? 'high' : 'medium',
        reporting_structure: 'Reports to executive leadership',
        budget_influence: 'medium'
      },
      personalizationFactors: [
        {
          factor: 'Role-based pain points',
          relevance: 75,
          source: 'Role Analysis',
          insight: 'Focus on efficiency and productivity gains'
        }
      ],
      recommendations: {
        tone: 'professional',
        approach: 'value-first',
        keyMessages: [
          'Improve team efficiency',
          'Data-driven insights',
          'Proven ROI'
        ],
        callToAction: 'Schedule a 15-minute discovery call',
        timing: 'Tuesday-Thursday, 10am-3pm',
        followUpStrategy: 'Follow up in 3-5 business days with value-add content'
      }
    };
  }
}

export const intelligentPersonalizationService = new IntelligentPersonalizationService();

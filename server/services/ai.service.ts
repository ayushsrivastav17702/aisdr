import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';

// Use GPT-4o as the default model for optimal performance and availability
const DEFAULT_OPENAI_MODEL = "gpt-4o";

/*
The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
If the user doesn't specify a model, always prefer using "claude-sonnet-4-20250514" as it is the latest model.
*/
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

interface AIFilters {
  jobTitles?: string[];
  seniority?: string[];
  departments?: string[];
  industries?: string[];
  companySize?: {
    min?: number;
    max?: number;
  };
  locations?: string[];
  companyNames?: string[];
  keywords?: string[];
}

interface ApolloFilters {
  person_titles?: string[];
  person_seniorities?: string[];
  person_departments?: string[];
  organization_industry_tag_ids?: string[];
  organization_num_employees_ranges?: string[];
  person_locations?: string[];
  q_organization_name?: string;
  q_keywords?: string;
}

class AIService {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  async parseNaturalLanguageQuery(query: string): Promise<{
    aiFilters: AIFilters;
    apolloFilters: ApolloFilters;
  }> {
    const preferredProvider = process.env.AI_PROVIDER || 'openai';
    
    // If AI_PROVIDER is explicitly set, try that first
    if (preferredProvider === 'anthropic' && this.anthropic) {
      try {
        console.log('🤖 Using Anthropic for AI search parsing (AI_PROVIDER=anthropic)...');
        return await this.parseWithAnthropic(query);
      } catch (anthropicError: any) {
        console.error('Anthropic parsing failed:', anthropicError?.message || anthropicError);
        
        // Try OpenAI as fallback
        if (this.openai) {
          try {
            console.log('🤖 Anthropic failed, falling back to OpenAI...');
            return await this.parseWithOpenAI(query);
          } catch (openaiError) {
            console.error('OpenAI parsing also failed:', openaiError);
          }
        }
        
        console.log('📝 Using keyword extraction fallback...');
        return this.fallbackKeywordExtraction(query);
      }
    }
    
    // Try OpenAI first (default or explicitly set)
    if (this.openai) {
      try {
        console.log('🤖 Using OpenAI for AI search parsing...');
        return await this.parseWithOpenAI(query);
      } catch (openaiError: any) {
        console.error('OpenAI parsing failed:', openaiError?.message || openaiError);
        
        // If OpenAI fails, try Anthropic as fallback
        if (this.anthropic) {
          try {
            console.log('🤖 OpenAI failed, falling back to Anthropic...');
            return await this.parseWithAnthropic(query);
          } catch (anthropicError) {
            console.error('Anthropic parsing also failed:', anthropicError);
          }
        } else {
          console.warn('⚠️ Anthropic not configured - cannot fallback. Set ANTHROPIC_API_KEY to enable fallback.');
        }
        
        // If both AI providers fail, use keyword extraction
        console.log('📝 Using keyword extraction fallback...');
        return this.fallbackKeywordExtraction(query);
      }
    }
    
    // If OpenAI not available, try Anthropic
    if (this.anthropic) {
      try {
        console.log('🤖 Using Anthropic for AI search parsing...');
        return await this.parseWithAnthropic(query);
      } catch (anthropicError) {
        console.error('Anthropic parsing failed:', anthropicError);
        console.log('📝 Using keyword extraction fallback...');
        return this.fallbackKeywordExtraction(query);
      }
    }
    
    // No AI providers available - use keyword extraction
    console.warn('⚠️ No AI providers configured. Using keyword extraction. Set OPENAI_API_KEY or ANTHROPIC_API_KEY for better results.');
    return this.fallbackKeywordExtraction(query);
  }

  private async parseWithOpenAI(query: string): Promise<{
    aiFilters: AIFilters;
    apolloFilters: ApolloFilters;
  }> {
    if (!this.openai) throw new Error('OpenAI not initialized');

    const systemPrompt = `You are an expert at parsing natural language queries for prospect search. 
    Convert the user's query into structured filters for finding business prospects.
    
    Extract and structure the following information:
    - Job titles and roles (CEO, CTO, VP Engineering, merchandiser, Merchandising Manager, Visual Merchandiser, etc.)
    - Seniority levels (C-Level, VP, Director, Manager, Senior, Entry, etc.)
    - Departments (Engineering, Marketing, Sales, Merchandising, Operations, etc.)
    - Industries (Fintech, Healthcare, SaaS, Retail, Fashion, Sportswear, etc.)
    - Company names (Nike, Google, Apple, etc.) - CRITICAL: Extract company names separately AND include in keywords
    - Company size (employee ranges)
    - Locations (cities, states, countries)
    - Keywords for additional search terms
    
    IMPORTANT RULES:
    1. For job titles, include ALL variations (e.g., "merchandiser" -> ["merchandiser", "merchandising manager", "visual merchandiser", "product merchandiser"])
    2. For company names, ALWAYS put them in BOTH companyNames array AND keywords
    3. Be flexible with job title matching - include related roles
    
    Respond with JSON in this exact format:
    {
      "aiFilters": {
        "jobTitles": ["array of job titles with variations"],
        "seniority": ["array of seniority levels"],
        "departments": ["array of departments"],
        "industries": ["array of industries"],
        "companySize": {"min": number, "max": number},
        "locations": ["array of locations"],
        "companyNames": ["array of company names"],
        "keywords": ["array of keywords including company names"]
      },
      "apolloFilters": {
        "person_titles": ["array of job titles"],
        "person_seniorities": ["array of seniority levels"],
        "person_departments": ["array of departments"],
        "organization_industry_tag_ids": ["array of industry IDs"],
        "organization_num_employees_ranges": ["array of employee ranges"],
        "person_locations": ["array of locations"],
        "q_organization_name": "company name",
        "q_keywords": "space-separated keywords"
      }
    }`;

    const response = await this.openai.chat.completions.create({
      model: DEFAULT_OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      aiFilters: result.aiFilters || {},
      apolloFilters: this.convertToApolloFilters(result.aiFilters || {})
    };
  }

  private async parseWithAnthropic(query: string): Promise<{
    aiFilters: AIFilters;
    apolloFilters: ApolloFilters;
  }> {
    if (!this.anthropic) throw new Error('Anthropic not initialized');

    const systemPrompt = `You are an expert at parsing natural language queries for prospect search. 
    Convert the user's query into structured filters for finding business prospects.
    
    Extract and structure the following information:
    - Job titles and roles (CEO, CTO, VP Engineering, merchandiser, Merchandising Manager, Visual Merchandiser, etc.)
    - Seniority levels (C-Level, VP, Director, Manager, Senior, Entry, etc.)
    - Departments (Engineering, Marketing, Sales, Merchandising, Operations, etc.)
    - Industries (Fintech, Healthcare, SaaS, Retail, Fashion, Sportswear, etc.)
    - Company names (Nike, Google, Apple, etc.) - CRITICAL: Extract company names separately AND include in keywords
    - Company size (employee ranges)
    - Locations (cities, states, countries)
    - Keywords for additional search terms
    
    IMPORTANT RULES:
    1. For job titles, include ALL variations (e.g., "merchandiser" -> ["merchandiser", "merchandising manager", "visual merchandiser", "product merchandiser"])
    2. For company names, ALWAYS put them in BOTH companyNames array AND keywords
    3. Be flexible with job title matching - include related roles
    
    Respond with JSON in this exact format:
    {
      "aiFilters": {
        "jobTitles": ["array of job titles with variations"],
        "seniority": ["array of seniority levels"],
        "departments": ["array of departments"],
        "industries": ["array of industries"],
        "companySize": {"min": number, "max": number},
        "locations": ["array of locations"],
        "companyNames": ["array of company names"],
        "keywords": ["array of keywords including company names"]
      }
    }`;

    const response = await this.anthropic.messages.create({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: "user", content: query }
      ],
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Anthropic');
    }

    const result = JSON.parse(textContent.text);
    return {
      aiFilters: result.aiFilters || {},
      apolloFilters: this.convertToApolloFilters(result.aiFilters || {})
    };
  }

  private fallbackKeywordExtraction(query: string): {
    aiFilters: AIFilters;
    apolloFilters: ApolloFilters;
  } {
    const jobTitleKeywords = ['ceo', 'cto', 'cfo', 'vp', 'director', 'manager', 'engineer', 'developer'];
    const locationKeywords = ['nyc', 'new york', 'san francisco', 'sf', 'bay area', 'boston', 'austin'];
    const industryKeywords = ['fintech', 'saas', 'healthcare', 'ai', 'blockchain', 'crypto'];
    
    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/);
    
    const extractedTitles = jobTitleKeywords.filter(keyword => 
      lowerQuery.includes(keyword)
    );
    
    const extractedLocations = locationKeywords.filter(keyword => 
      lowerQuery.includes(keyword)
    );
    
    const extractedIndustries = industryKeywords.filter(keyword => 
      lowerQuery.includes(keyword)
    );

    const aiFilters: AIFilters = {
      jobTitles: extractedTitles,
      locations: extractedLocations,
      industries: extractedIndustries,
      keywords: words.filter(word => word.length > 3)
    };

    return {
      aiFilters,
      apolloFilters: this.convertToApolloFilters(aiFilters)
    };
  }

  private convertToApolloFilters(aiFilters: AIFilters): ApolloFilters {
    const apolloFilters: ApolloFilters = {};

    if (aiFilters.jobTitles?.length) {
      apolloFilters.person_titles = aiFilters.jobTitles;
    }

    if (aiFilters.seniority?.length) {
      apolloFilters.person_seniorities = aiFilters.seniority.map(this.mapSeniorityToApollo);
    }

    if (aiFilters.departments?.length) {
      apolloFilters.person_departments = aiFilters.departments.map(this.mapDepartmentToApollo);
    }

    if (aiFilters.industries?.length) {
      apolloFilters.organization_industry_tag_ids = aiFilters.industries.map(this.mapIndustryToApolloId);
    }

    if (aiFilters.companySize?.min || aiFilters.companySize?.max) {
      apolloFilters.organization_num_employees_ranges = [this.mapCompanySizeToApollo(aiFilters.companySize)];
    }

    if (aiFilters.locations?.length) {
      apolloFilters.person_locations = aiFilters.locations;
    }

    if (aiFilters.companyNames?.length) {
      // Use first company name for organization search (Apollo supports single company filter)
      apolloFilters.q_organization_name = aiFilters.companyNames[0];
    }

    if (aiFilters.keywords?.length) {
      apolloFilters.q_keywords = aiFilters.keywords.join(' ');
    }

    return apolloFilters;
  }

  private mapSeniorityToApollo(seniority: string): string {
    const mapping: { [key: string]: string } = {
      'c-level': 'c_level',
      'vp': 'vp',
      'director': 'director',
      'manager': 'manager',
      'senior': 'senior',
      'entry': 'entry'
    };
    return mapping[seniority.toLowerCase()] || seniority;
  }

  private mapDepartmentToApollo(department: string): string {
    const mapping: { [key: string]: string } = {
      'engineering': 'engineering',
      'marketing': 'marketing',
      'sales': 'sales',
      'finance': 'finance',
      'hr': 'human_resources',
      'operations': 'operations'
    };
    return mapping[department.toLowerCase()] || department;
  }

  private mapIndustryToApolloId(industry: string): string {
    // Apollo.io industry tag IDs - these would need to be mapped from their API
    const mapping: { [key: string]: string } = {
      'fintech': '5567cdcc7369646289050000',
      'saas': '5567cdcc7369646289040000',
      'healthcare': '5567cdcc7369646289030000',
      'technology': '5567cdcc7369646289020000',
      'financial services': '5567cdcc7369646289010000'
    };
    return mapping[industry.toLowerCase()] || industry;
  }

  private mapCompanySizeToApollo(companySize: { min?: number; max?: number }): string {
    const { min = 0, max = Infinity } = companySize;
    
    if (min >= 1 && max <= 10) return '1,10';
    if (min >= 11 && max <= 50) return '11,50';
    if (min >= 51 && max <= 200) return '51,200';
    if (min >= 201 && max <= 500) return '201,500';
    if (min >= 501 && max <= 1000) return '501,1000';
    if (min >= 1001 && max <= 5000) return '1001,5000';
    if (min >= 5001 && max <= 10000) return '5001,10000';
    if (min >= 10001) return '10001+';
    
    return '1+';
  }

  // Generate text using AI
  async generateText(prompt: string, maxTokens: number = 1000): Promise<string> {
    const provider = process.env.AI_PROVIDER || (this.openai ? 'openai' : 'anthropic');
    
    try {
      if (provider === 'openai' && this.openai) {
        const response = await this.openai.chat.completions.create({
          model: DEFAULT_OPENAI_MODEL,
          messages: [
            { role: "user", content: prompt }
          ],
          max_completion_tokens: maxTokens,
        });
        return response.choices[0].message.content || '';
      } else if (provider === 'anthropic' && this.anthropic) {
        const response = await this.anthropic.messages.create({
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: "user", content: prompt }
          ]
        });
        const textContent = response.content.find(block => block.type === 'text');
        return textContent && 'text' in textContent ? textContent.text : '';
      } else {
        throw new Error('No AI provider available');
      }
    } catch (error) {
      console.error('AI text generation failed:', error);
      throw error;
    }
  }
}

export const aiService = new AIService();

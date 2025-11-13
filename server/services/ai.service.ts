import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';

// Use GPT-4o as the default model for optimal performance and availability
const DEFAULT_OPENAI_MODEL = "gpt-4o";

/*
The newest Anthropic model is "claude-sonnet-4-20250514", not "claude-3-7-sonnet-20250219", "claude-3-5-sonnet-20241022" nor "claude-3-sonnet-20240229". 
If the user doesn't specify a model, always prefer using "claude-sonnet-4-20250514" as it is the latest model.
*/
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// OpenRouter model - can use any OpenRouter-compatible model
// Popular options: openai/gpt-4o, anthropic/claude-sonnet-4, google/gemini-pro, meta-llama/llama-3.1-405b
const DEFAULT_OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4o";

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
  private openaiBackup: OpenAI | null = null;
  private openRouter: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private useBackupKey: boolean = false;
  
  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    
    if (process.env.OPENAI_API_KEY_BACKUP) {
      this.openaiBackup = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_BACKUP });
      console.log('✅ Backup OpenAI API key configured');
    }
    
    if (process.env.OPEN_ROUTER) {
      this.openRouter = new OpenAI({ 
        apiKey: process.env.OPEN_ROUTER,
        baseURL: 'https://openrouter.ai/api/v1'
      });
      console.log('✅ OpenRouter configured for AI processing');
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
  }

  private getOpenAIClient(): OpenAI | null {
    if (this.useBackupKey && this.openaiBackup) {
      console.log('🔄 Using backup OpenAI API key');
      return this.openaiBackup;
    }
    return this.openai;
  }

  private async callOpenAI<T>(
    apiCall: (client: OpenAI) => Promise<T>
  ): Promise<T> {
    const client = this.getOpenAIClient();
    if (!client) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      return await apiCall(client);
    } catch (error: any) {
      // Check if it's a quota error (429)
      if (error?.status === 429 && !this.useBackupKey && this.openaiBackup) {
        console.log('⚠️ Primary OpenAI API key quota exceeded, switching to backup key...');
        this.useBackupKey = true;
        
        // Retry with backup key
        return await apiCall(this.openaiBackup);
      }
      throw error;
    }
  }

  async parseNaturalLanguageQuery(query: string): Promise<{
    aiFilters: AIFilters;
    apolloFilters: ApolloFilters;
  }> {
    const preferredProvider = process.env.AI_PROVIDER || 'openai';
    
    // If AI_PROVIDER is explicitly set to openrouter, try that first
    if (preferredProvider === 'openrouter' && this.openRouter) {
      try {
        console.log('🤖 Using OpenRouter for AI search parsing (AI_PROVIDER=openrouter)...');
        return await this.parseWithOpenRouter(query);
      } catch (openRouterError: any) {
        console.error('OpenRouter parsing failed:', openRouterError?.message || openRouterError);
        
        // Try OpenAI as fallback
        if (this.openai) {
          try {
            console.log('🤖 OpenRouter failed, falling back to OpenAI...');
            return await this.parseWithOpenAI(query);
          } catch (openaiError) {
            console.error('OpenAI parsing also failed:', openaiError);
          }
        }
        
        // Try Anthropic as next fallback
        if (this.anthropic) {
          try {
            console.log('🤖 Falling back to Anthropic...');
            return await this.parseWithAnthropic(query);
          } catch (anthropicError) {
            console.error('Anthropic parsing also failed:', anthropicError);
          }
        }
        
        console.log('📝 Using keyword extraction fallback...');
        return this.fallbackKeywordExtraction(query);
      }
    }
    
    // If AI_PROVIDER is explicitly set to anthropic, try that first
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
        
        // If OpenAI fails, try OpenRouter next if available
        if (this.openRouter) {
          try {
            console.log('🤖 OpenAI failed, falling back to OpenRouter...');
            return await this.parseWithOpenRouter(query);
          } catch (openRouterError) {
            console.error('OpenRouter parsing also failed:', openRouterError);
          }
        }
        
        // Then try Anthropic as final AI fallback
        if (this.anthropic) {
          try {
            console.log('🤖 Falling back to Anthropic...');
            return await this.parseWithAnthropic(query);
          } catch (anthropicError) {
            console.error('Anthropic parsing also failed:', anthropicError);
          }
        } else {
          console.warn('⚠️ Anthropic not configured - cannot fallback. Set ANTHROPIC_API_KEY to enable fallback.');
        }
        
        // If all AI providers fail, use keyword extraction
        console.log('📝 Using keyword extraction fallback...');
        return this.fallbackKeywordExtraction(query);
      }
    }
    
    // If OpenAI not available, try OpenRouter
    if (this.openRouter) {
      try {
        console.log('🤖 Using OpenRouter for AI search parsing...');
        return await this.parseWithOpenRouter(query);
      } catch (openRouterError) {
        console.error('OpenRouter parsing failed:', openRouterError);
        
        // Try Anthropic as fallback
        if (this.anthropic) {
          try {
            console.log('🤖 OpenRouter failed, falling back to Anthropic...');
            return await this.parseWithAnthropic(query);
          } catch (anthropicError) {
            console.error('Anthropic parsing also failed:', anthropicError);
          }
        }
        
        console.log('📝 Using keyword extraction fallback...');
        return this.fallbackKeywordExtraction(query);
      }
    }
    
    // If OpenRouter not available, try Anthropic
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
    console.warn('⚠️ No AI providers configured. Using keyword extraction. Set OPENAI_API_KEY, OPEN_ROUTER, or ANTHROPIC_API_KEY for better results.');
    return this.fallbackKeywordExtraction(query);
  }

  private async parseWithOpenAI(query: string): Promise<{
    aiFilters: AIFilters;
    apolloFilters: ApolloFilters;
  }> {
    if (!this.openai && !this.openaiBackup) throw new Error('OpenAI not initialized');

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

    const response = await this.callOpenAI((client) => 
      client.chat.completions.create({
        model: DEFAULT_OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: query }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      })
    );

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      aiFilters: result.aiFilters || {},
      apolloFilters: this.convertToApolloFilters(result.aiFilters || {})
    };
  }

  private async parseWithOpenRouter(query: string): Promise<{
    aiFilters: AIFilters;
    apolloFilters: ApolloFilters;
  }> {
    if (!this.openRouter) throw new Error('OpenRouter not initialized');

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

    // JSON Mode Compatibility Check
    // OpenAI's response_format: { type: "json_object" } is only supported by:
    // - OpenAI models (gpt-4o, gpt-4, gpt-3.5-turbo)
    // - Anthropic models (claude-sonnet-4, etc.) via OpenRouter
    // Models like Gemini, Llama, and most open-source models do NOT support this feature
    // For unsupported models, we omit response_format and parse markdown code blocks instead
    // See AI_PROVIDER.md for full compatibility matrix and model recommendations
    const supportsJsonMode = DEFAULT_OPENROUTER_MODEL.includes('openai/') || 
                             DEFAULT_OPENROUTER_MODEL.includes('anthropic/');
    
    const requestParams: any = {
      model: DEFAULT_OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query }
      ],
      max_tokens: 2048,
    };
    
    // Only add response_format for models that support it
    if (supportsJsonMode) {
      requestParams.response_format = { type: "json_object" };
    }

    const response = await this.openRouter.chat.completions.create(requestParams);

    const rawContent = response.choices[0].message.content || '{}';
    
    // Handle potential markdown code blocks for models that don't support JSON mode
    let jsonText = rawContent;
    if (!supportsJsonMode) {
      const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/) || rawContent.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1];
      }
    }
    
    const result = JSON.parse(jsonText.trim());
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
    console.log('⚠️ Using fallback keyword extraction for query:', query);
    
    const jobTitleKeywords = [
      'ceo', 'cto', 'cfo', 'coo', 'vp', 'vice president', 
      'director', 'manager', 'head', 'lead', 'chief',
      'engineer', 'developer', 'designer', 'analyst', 'architect',
      'merchandiser', 'merchandising', 'buyer', 'planner', 'coordinator',
      'sales', 'marketing', 'product', 'operations', 'finance'
    ];
    
    const locationKeywords = [
      // North America
      'nyc', 'new york', 'san francisco', 'sf', 'bay area', 'boston', 'austin',
      'seattle', 'los angeles', 'la', 'chicago', 'miami', 'atlanta', 'denver',
      'dallas', 'houston', 'portland', 'philadelphia', 'dc', 'washington',
      'toronto', 'vancouver', 'montreal',
      // Europe
      'london', 'paris', 'berlin', 'amsterdam', 'madrid', 'barcelona', 'rome',
      'dublin', 'stockholm', 'copenhagen', 'oslo', 'helsinki', 'zurich', 'geneva',
      'munich', 'frankfurt', 'vienna', 'brussels', 'lisbon',
      // Asia Pacific
      'singapore', 'hong kong', 'tokyo', 'shanghai', 'beijing', 'seoul',
      'bangalore', 'mumbai', 'delhi', 'hyderabad', 'sydney', 'melbourne',
      'auckland', 'bangkok', 'manila', 'jakarta', 'kuala lumpur',
      // Middle East & Africa
      'dubai', 'abu dhabi', 'tel aviv', 'riyadh', 'cairo', 'johannesburg',
      'cape town', 'nairobi',
      // Latin America
      'mexico city', 'são paulo', 'rio de janeiro', 'buenos aires', 'santiago',
      'bogota', 'lima'
    ];
    
    const industryKeywords = [
      'fintech', 'saas', 'healthcare', 'ai', 'blockchain', 'crypto',
      'retail', 'ecommerce', 'fashion', 'technology', 'software', 'hardware'
    ];
    
    // Extract potential company names - use a smarter approach
    // Known major companies to detect even in fallback mode
    const knownCompanies = [
      'nike', 'adidas', 'puma', 'reebok', 'under armour', 'google', 'apple', 'microsoft',
      'amazon', 'meta', 'facebook', 'netflix', 'tesla', 'uber', 'airbnb', 'spotify',
      'salesforce', 'oracle', 'sap', 'ibm', 'intel', 'cisco', 'hp', 'dell', 'lenovo',
      'target', 'walmart', 'costco', 'nordstrom', 'macys', 'gap', 'zara', 'h&m',
      'uniqlo', 'lululemon', 'patagonia', 'columbia', 'north face', 'vans', 'converse',
      'disney', 'warner', 'universal', 'sony', 'samsung', 'lg', 'toyota', 'honda'
    ];
    
    const commonWords = ['the', 'a', 'an', 'in', 'on', 'to', 'of', 'and', 'or', 'with', 'find', 'looking', 'search', 'get', 'at', 'from', 'for'];
    const words = query.split(/\s+/);
    
    const lowerQuery = query.toLowerCase();
    
    const extractedTitles = jobTitleKeywords.filter(keyword => 
      lowerQuery.includes(keyword)
    );
    
    const extractedLocations = locationKeywords.filter(keyword => 
      lowerQuery.includes(keyword)
    );
    
    const extractedIndustries = industryKeywords.filter(keyword => 
      lowerQuery.includes(keyword)
    );
    
    // Extract known company names
    const extractedCompanies = knownCompanies.filter(company => 
      lowerQuery.includes(company)
    );

    // If no job titles found but query contains common job-related words, use them
    if (extractedTitles.length === 0) {
      const potentialTitles = words.filter(word => 
        word.length > 4 && !commonWords.includes(word.toLowerCase())
      );
      if (potentialTitles.length > 0) {
        extractedTitles.push(...potentialTitles.slice(0, 3)); // Use up to 3 potential titles
      }
    }

    // Filter keywords: include meaningful words and capitalized tokens (potential company names)
    const keywords = words.filter(word => {
      const wordLower = word.toLowerCase();
      if (commonWords.includes(wordLower)) return false;
      
      // Include if length > 3
      if (word.length > 3) return true;
      
      // Include short capitalized words (potential companies like IBM, Gap, HP, 3M)
      // Allow words starting with capital letter OR digit (for companies like 3M, 23andMe)
      if (word.length >= 2 && /^[A-Z0-9][A-Za-z0-9]*$/.test(word)) {
        return true;
      }
      
      return false;
    });

    const aiFilters: AIFilters = {
      jobTitles: extractedTitles.length > 0 ? extractedTitles : undefined,
      locations: extractedLocations.length > 0 ? extractedLocations : undefined,
      industries: extractedIndustries.length > 0 ? extractedIndustries : undefined,
      companyNames: extractedCompanies.length > 0 ? extractedCompanies : undefined,
      keywords: keywords.length > 0 ? keywords : undefined
    };

    console.log('📝 Fallback extracted filters:', JSON.stringify(aiFilters, null, 2));

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
      // Industry IDs are complex and require exact Apollo.io mapping
      // For now, include industries in keywords for better matching
      // This ensures search works even without exact industry tag IDs
      const industryKeywords = aiFilters.industries.join(' ');
      if (apolloFilters.q_keywords) {
        apolloFilters.q_keywords += ' ' + industryKeywords;
      } else {
        apolloFilters.q_keywords = industryKeywords;
      }
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
    // Apollo.io industry tag IDs - mapping common industries
    const mapping: { [key: string]: string } = {
      'fintech': '5567cdcc7369646289050000',
      'saas': '5567cdcc7369646289040000',
      'healthcare': '5567cdcc7369646289030000',
      'technology': '5567cdcc7369646289020000',
      'financial services': '5567cdcc7369646289010000',
      'fashion': '5567cdcc7369646d0b3d0000',
      'retail': '5567cdcc7369646d0b3d0000', // Same as fashion/apparel
      'apparel': '5567cdcc7369646d0b3d0000',
      'e-commerce': '5567cdcc7369646d0b420000',
      'manufacturing': '5567cdcc7369646d0b440000',
      'software': '5567cdcc7369646289040000', // Same as SaaS
      'consulting': '5567cdcc7369646d0b460000',
      'education': '5567cdcc7369646d0b480000',
      'real estate': '5567cdcc7369646d0b4a0000',
      'telecommunications': '5567cdcc7369646d0b4c0000',
      'media': '5567cdcc7369646d0b4e0000',
      'advertising': '5567cdcc7369646d0b500000',
      'automotive': '5567cdcc7369646d0b520000',
      'travel': '5567cdcc7369646d0b540000',
      'hospitality': '5567cdcc7369646d0b560000',
      'food': '5567cdcc7369646d0b580000',
      'beverage': '5567cdcc7369646d0b5a0000',
      'logistics': '5567cdcc7369646d0b5c0000',
      'transportation': '5567cdcc7369646d0b5e0000'
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

  // Generate text using AI (OpenAI with Anthropic fallback)
  async generateText(prompt: string, maxTokens: number = 1000): Promise<string> {
    // Try OpenAI first (with automatic backup key fallback)
    if (this.openai || this.openaiBackup) {
      try {
        const response = await this.callOpenAI((client) => 
          client.chat.completions.create({
            model: DEFAULT_OPENAI_MODEL,
            messages: [
              { role: "user", content: prompt }
            ],
            max_completion_tokens: maxTokens,
          })
        );
        return response.choices[0].message.content || '';
      } catch (error: any) {
        console.error('OpenAI text generation failed:', error?.message || error);
        
        // If OpenAI fails (including backup), try Anthropic as fallback
        if (this.anthropic) {
          console.log('⚠️ OpenAI failed, falling back to Anthropic for text generation...');
          try {
            const anthropicResponse = await this.anthropic.messages.create({
              model: DEFAULT_ANTHROPIC_MODEL,
              max_tokens: maxTokens,
              messages: [
                { role: "user", content: prompt }
              ],
            });
            
            const textContent = anthropicResponse.content.find(block => block.type === 'text');
            if (textContent && textContent.type === 'text') {
              return textContent.text;
            }
            throw new Error('No text response from Anthropic');
          } catch (anthropicError: any) {
            console.error('Anthropic text generation also failed:', anthropicError?.message || anthropicError);
            throw new Error(`AI text generation failed. OpenAI error: ${error?.message}. Anthropic error: ${anthropicError?.message}`);
          }
        } else {
          console.warn('⚠️ Anthropic not configured - cannot fallback. Set ANTHROPIC_API_KEY to enable fallback.');
          throw error;
        }
      }
    }
    
    // If no OpenAI available, try Anthropic directly
    if (this.anthropic) {
      try {
        console.log('🤖 Using Anthropic for text generation (OpenAI not configured)...');
        const response = await this.anthropic.messages.create({
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: "user", content: prompt }
          ],
        });
        
        const textContent = response.content.find(block => block.type === 'text');
        if (textContent && textContent.type === 'text') {
          return textContent.text;
        }
        throw new Error('No text response from Anthropic');
      } catch (error) {
        console.error('Anthropic text generation failed:', error);
        throw error;
      }
    }
    
    throw new Error('No AI provider configured. Please set OPENAI_API_KEY, OPENAI_API_KEY_BACKUP, or ANTHROPIC_API_KEY.');
  }

  // Generate email sequence with AI
  async generateEmailSequence(params: {
    prompt: string;
    method: 'ai' | 'auto-ai';
  }): Promise<{
    description: string;
    steps: Array<{
      subject: string;
      body: string;
      delayDays: number;
    }>;
  }> {
    const { prompt, method } = params;
    
    let systemPrompt = '';
    let expectedSteps = 1;
    
    if (method === 'auto-ai') {
      // Auto Create with AI - generates a complete multi-step sequence
      systemPrompt = `You are an expert SDR email copywriter. Generate a complete, multi-step email outreach sequence based on the user's prompt.

The sequence should include:
1. Initial outreach email (sent immediately)
2. Follow-up email (2-3 days later)
3. Value-add email (4-5 days after follow-up)
4. Break-up email (5-7 days after value-add)

For each email, provide:
- subject: Clear, compelling subject line
- body: Professional email body in HTML format using <p> tags for paragraphs
- delayDays: Number of days after the previous email (0 for first email)

Rules:
- Keep emails concise (100-150 words max)
- Use personalization placeholders: {{firstName}}, {{companyName}}, {{title}}
- Be professional but friendly
- Include clear call-to-action
- Use HTML <p> tags for proper spacing

Return a JSON object with this structure:
{
  "description": "Brief description of the sequence",
  "steps": [
    {"subject": "...", "body": "...", "delayDays": 0},
    {"subject": "...", "body": "...", "delayDays": 3},
    ...
  ]
}`;
      expectedSteps = 4;
    } else {
      // Generate with AI - generates a single email
      systemPrompt = `You are an expert SDR email copywriter. Generate a single, compelling outreach email based on the user's prompt.

Provide:
- subject: Clear, compelling subject line
- body: Professional email body in HTML format using <p> tags for paragraphs
- delayDays: 0 (immediate send)

Rules:
- Keep email concise (100-150 words max)
- Use personalization placeholders: {{firstName}}, {{companyName}}, {{title}}
- Be professional but friendly
- Include clear call-to-action
- Use HTML <p> tags for proper spacing

Return a JSON object with this structure:
{
  "description": "Brief description",
  "steps": [
    {"subject": "...", "body": "...", "delayDays": 0}
  ]
}`;
      expectedSteps = 1;
    }
    
    const userPrompt = `Generate an email sequence with the following requirements:\n\n${prompt}`;
    
    // Try OpenAI first (with automatic backup key fallback)
    if (this.openai || this.openaiBackup) {
      try {
        const response = await this.callOpenAI((client) => 
          client.chat.completions.create({
            model: DEFAULT_OPENAI_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            max_completion_tokens: method === 'auto-ai' ? 2000 : 800,
            response_format: { type: "json_object" },
          })
        );
        
        const content = response.choices[0].message.content || '{}';
        const result = JSON.parse(content);
        
        // Validate the response
        if (!result.steps || !Array.isArray(result.steps) || result.steps.length === 0) {
          throw new Error('Invalid AI response: missing or empty steps array');
        }
        
        return result;
      } catch (error: any) {
        console.error('OpenAI sequence generation failed:', error?.message || error);
        
        // If OpenAI fails (including backup), try Anthropic as fallback
        if (this.anthropic) {
          console.log('⚠️ OpenAI failed, falling back to Anthropic for sequence generation...');
          try {
            const anthropicResponse = await this.anthropic.messages.create({
              model: DEFAULT_ANTHROPIC_MODEL,
              max_tokens: method === 'auto-ai' ? 2000 : 800,
              messages: [
                { role: "user", content: `${systemPrompt}\n\n${userPrompt}` }
              ],
            });
            
            const textContent = anthropicResponse.content.find(block => block.type === 'text');
            if (!textContent || textContent.type !== 'text') {
              throw new Error('No text response from Anthropic');
            }
            
            // Extract JSON from the response (Anthropic might include extra text)
            const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error('Could not extract JSON from Anthropic response');
            }
            
            const result = JSON.parse(jsonMatch[0]);
            
            // Validate the response
            if (!result.steps || !Array.isArray(result.steps) || result.steps.length === 0) {
              throw new Error('Invalid AI response: missing or empty steps array');
            }
            
            return result;
          } catch (anthropicError: any) {
            console.error('Anthropic sequence generation also failed:', anthropicError?.message || anthropicError);
            throw new Error(`AI sequence generation failed. OpenAI error: ${error?.message}. Anthropic error: ${anthropicError?.message}`);
          }
        } else {
          console.warn('⚠️ Anthropic not configured - cannot fallback. Set ANTHROPIC_API_KEY to enable fallback.');
          throw error;
        }
      }
    }
    
    // If no OpenAI available, try Anthropic directly
    if (this.anthropic) {
      try {
        console.log('🤖 Using Anthropic for sequence generation (OpenAI not configured)...');
        const response = await this.anthropic.messages.create({
          model: DEFAULT_ANTHROPIC_MODEL,
          max_tokens: method === 'auto-ai' ? 2000 : 800,
          messages: [
            { role: "user", content: `${systemPrompt}\n\n${userPrompt}` }
          ],
        });
        
        const textContent = response.content.find(block => block.type === 'text');
        if (!textContent || textContent.type !== 'text') {
          throw new Error('No text response from Anthropic');
        }
        
        // Extract JSON from the response (Anthropic might include extra text)
        const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Could not extract JSON from Anthropic response');
        }
        
        const result = JSON.parse(jsonMatch[0]);
        
        // Validate the response
        if (!result.steps || !Array.isArray(result.steps) || result.steps.length === 0) {
          throw new Error('Invalid AI response: missing or empty steps array');
        }
        
        return result;
      } catch (error: any) {
        console.error('Anthropic sequence generation failed:', error);
        throw error;
      }
    }
    
    throw new Error('No AI provider configured. Please set OPENAI_API_KEY, OPENAI_API_KEY_BACKUP, or ANTHROPIC_API_KEY.');
  }
}

export const aiService = new AIService();

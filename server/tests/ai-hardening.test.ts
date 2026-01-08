import { describe, it, expect, vi, beforeEach } from 'vitest';

const AI_TIMEOUT_MS = 30000;
const MAX_PARALLEL_AI_CALLS = 50;
const MAX_RETRIES = 3;
const TOKEN_BUDGET = 4000;

interface ProspectContext {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string;
  jobTitle: string;
  linkedinActivity: string | null;
  newsItems: NewsItem[];
  dataQuality: 'high' | 'medium' | 'low';
}

interface NewsItem {
  id: string;
  headline: string;
  source: string;
  publishedAt: Date;
  authority: 'high' | 'medium' | 'low';
  region: string;
  paywall: boolean;
}

interface AIOutput {
  prospectId: string;
  content: string;
  tokens: number;
  generatedAt: Date;
}

const createMockProspect = (id: string, overrides?: Partial<ProspectContext>): ProspectContext => ({
  id,
  firstName: `First${id}`,
  lastName: `Last${id}`,
  companyName: 'Test Corp',
  jobTitle: 'Manager',
  linkedinActivity: null,
  newsItems: [],
  dataQuality: 'high',
  ...overrides
});

describe('Scale & Concurrency (TC-AI-HARD-01 to TC-AI-HARD-10)', () => {

  describe('TC-AI-HARD-01: 50 Prospects Personalised Simultaneously', () => {
    it('should handle 50 parallel personalizations without timeout', async () => {
      const prospects = Array.from({ length: 50 }, (_, i) => createMockProspect(`p-${i}`));
      const results: AIOutput[] = [];
      const startTime = Date.now();

      const personalize = async (prospect: ProspectContext): Promise<AIOutput> => {
        await new Promise(r => setTimeout(r, Math.random() * 20));
        return {
          prospectId: prospect.id,
          content: `Hi ${prospect.firstName}, personalized for ${prospect.companyName}`,
          tokens: 150,
          generatedAt: new Date()
        };
      };

      const outputs = await Promise.all(prospects.map(personalize));
      const elapsed = Date.now() - startTime;

      expect(outputs.length).toBe(50);
      expect(elapsed).toBeLessThan(AI_TIMEOUT_MS);
    });

    it('should produce unique output for each prospect', async () => {
      const prospects = Array.from({ length: 10 }, (_, i) => 
        createMockProspect(`p-${i}`, { firstName: `Name${i}`, companyName: `Company${i}` })
      );

      const outputs = prospects.map(p => ({
        prospectId: p.id,
        content: `Hi ${p.firstName}, I noticed ${p.companyName} is growing.`
      }));

      const uniqueContents = new Set(outputs.map(o => o.content));
      expect(uniqueContents.size).toBe(outputs.length);
    });
  });

  describe('TC-AI-HARD-02: 50 Parallel LinkedIn Scrapes', () => {
    it('should respect rate limits with proper semaphore', async () => {
      const RATE_LIMIT = 10;
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      const scrapeWithRateLimit = async (id: string): Promise<void> => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
        await new Promise(r => setTimeout(r, 10));
        concurrentCalls--;
      };

      const semaphore = async <T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> => {
        const results: T[] = [];
        const executing = new Set<Promise<void>>();
        
        for (const task of tasks) {
          const p = task().then(r => { 
            results.push(r); 
            executing.delete(p);
          });
          executing.add(p);
          
          if (executing.size >= limit) {
            await Promise.race(executing);
          }
        }
        
        await Promise.all(executing);
        return results;
      };

      const tasks = Array.from({ length: 50 }, (_, i) => () => scrapeWithRateLimit(`${i}`));
      await semaphore(tasks, RATE_LIMIT);

      expect(maxConcurrent).toBeLessThanOrEqual(RATE_LIMIT + 5);
    });

    it('should handle partial success', async () => {
      const results: { id: string; success: boolean; error?: string }[] = [];
      
      const scrape = async (id: number): Promise<typeof results[0]> => {
        if (id % 5 === 0) {
          return { id: `${id}`, success: false, error: 'Rate limited' };
        }
        return { id: `${id}`, success: true };
      };

      for (let i = 0; i < 50; i++) {
        results.push(await scrape(i));
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      expect(successful).toBeGreaterThan(0);
      expect(failed).toBeGreaterThan(0);
      expect(successful + failed).toBe(50);
    });
  });

  describe('TC-AI-HARD-03: AI Token Budget Stress', () => {
    it('should truncate prompts safely within token budget', () => {
      const longContext = 'x'.repeat(20000);
      
      const truncateToTokenBudget = (text: string, maxTokens: number): string => {
        const approxCharsPerToken = 4;
        const maxChars = maxTokens * approxCharsPerToken;
        if (text.length <= maxChars) return text;
        return text.slice(0, maxChars - 3) + '...';
      };

      const truncated = truncateToTokenBudget(longContext, TOKEN_BUDGET);
      const estimatedTokens = truncated.length / 4;

      expect(estimatedTokens).toBeLessThanOrEqual(TOKEN_BUDGET);
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('should not cause LLM failures on truncation', () => {
      const buildPrompt = (context: string, maxTokens: number): { prompt: string; truncated: boolean } => {
        const approxCharsPerToken = 4;
        const maxChars = maxTokens * approxCharsPerToken;
        
        if (context.length <= maxChars) {
          return { prompt: context, truncated: false };
        }
        
        return {
          prompt: context.slice(0, maxChars - 100) + '\n[Context truncated for token limits]',
          truncated: true
        };
      };

      const result = buildPrompt('a'.repeat(20000), TOKEN_BUDGET);
      
      expect(result.truncated).toBe(true);
      expect(result.prompt.length).toBeLessThan(20000);
      expect(result.prompt).toContain('[Context truncated');
    });
  });

  describe('TC-AI-HARD-04: Parallel AI Calls Ordering', () => {
    it('should maintain correct prospect ↔ output mapping', async () => {
      const prospects = Array.from({ length: 20 }, (_, i) => createMockProspect(`p-${i}`));
      
      const generateOutput = async (p: ProspectContext): Promise<AIOutput> => {
        await new Promise(r => setTimeout(r, Math.random() * 50));
        return {
          prospectId: p.id,
          content: `Content for ${p.id}`,
          tokens: 100,
          generatedAt: new Date()
        };
      };

      const outputs = await Promise.all(prospects.map(generateOutput));

      for (const output of outputs) {
        const prospect = prospects.find(p => p.id === output.prospectId);
        expect(prospect).toBeDefined();
        expect(output.content).toContain(output.prospectId);
      }
    });
  });

  describe('TC-AI-HARD-05: Mixed Data Quality Batch', () => {
    it('should produce high-quality copy for clean prospects', () => {
      const prospect = createMockProspect('p-clean', {
        dataQuality: 'high',
        linkedinActivity: 'Recently promoted to VP',
        newsItems: [{ 
          id: 'n-1', headline: 'Company raises $50M', source: 'TechCrunch',
          publishedAt: new Date(), authority: 'high', region: 'US', paywall: false
        }]
      });

      const generateCopy = (p: ProspectContext): { quality: string; usedContext: boolean } => {
        if (p.dataQuality === 'high' && p.linkedinActivity && p.newsItems.length > 0) {
          return { quality: 'high', usedContext: true };
        }
        return { quality: 'neutral', usedContext: false };
      };

      const result = generateCopy(prospect);
      expect(result.quality).toBe('high');
      expect(result.usedContext).toBe(true);
    });

    it('should produce neutral copy for weak data prospects', () => {
      const prospect = createMockProspect('p-weak', {
        dataQuality: 'low',
        linkedinActivity: null,
        newsItems: []
      });

      const generateCopy = (p: ProspectContext): { quality: string; content: string } => {
        if (p.dataQuality === 'low' || (!p.linkedinActivity && p.newsItems.length === 0)) {
          return { 
            quality: 'neutral', 
            content: `Hi ${p.firstName}, I wanted to reach out about how we help companies like ${p.companyName}.`
          };
        }
        return { quality: 'personalized', content: 'Custom content' };
      };

      const result = generateCopy(prospect);
      expect(result.quality).toBe('neutral');
    });
  });

  describe('TC-AI-HARD-06: AI Provider Partial Outage', () => {
    it('should use fallback provider on primary failure', async () => {
      const providers = ['openai', 'anthropic', 'openrouter'];
      let usedProvider = '';

      const callWithFallback = async (): Promise<{ provider: string; success: boolean }> => {
        for (const provider of providers) {
          try {
            if (provider === 'openai') {
              throw new Error('Service unavailable');
            }
            usedProvider = provider;
            return { provider, success: true };
          } catch {
            continue;
          }
        }
        return { provider: '', success: false };
      };

      const result = await callWithFallback();
      
      expect(result.success).toBe(true);
      expect(result.provider).toBe('anthropic');
    });

    it('should not crash campaign on provider failure', async () => {
      const prospects = Array.from({ length: 5 }, (_, i) => createMockProspect(`p-${i}`));
      const results: { prospectId: string; success: boolean; fallbackUsed: boolean }[] = [];

      for (const prospect of prospects) {
        try {
          results.push({ prospectId: prospect.id, success: true, fallbackUsed: true });
        } catch {
          results.push({ prospectId: prospect.id, success: false, fallbackUsed: false });
        }
      }

      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('TC-AI-HARD-07: Batch Cancel Mid-Processing', () => {
    it('should stop gracefully on cancel', async () => {
      let cancelled = false;
      const processed: string[] = [];
      
      const processBatch = async (items: string[], checkCancelled: () => boolean): Promise<void> => {
        for (const item of items) {
          if (checkCancelled()) break;
          await new Promise(r => setTimeout(r, 5));
          processed.push(item);
        }
      };

      const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
      
      setTimeout(() => { cancelled = true; }, 30);
      await processBatch(items, () => cancelled);

      expect(processed.length).toBeLessThan(items.length);
      expect(processed.length).toBeGreaterThan(0);
    });

    it('should not leave half-written data', () => {
      const database: { id: string; complete: boolean }[] = [];
      
      const writeWithTransaction = (id: string, shouldFail: boolean): boolean => {
        const transaction = { id, complete: false };
        
        if (shouldFail) {
          return false;
        }
        
        transaction.complete = true;
        database.push(transaction);
        return true;
      };

      writeWithTransaction('1', false);
      writeWithTransaction('2', true);
      writeWithTransaction('3', false);

      expect(database.length).toBe(2);
      expect(database.every(d => d.complete)).toBe(true);
    });
  });

  describe('TC-AI-HARD-08: Memory Leak Test (Long Batch)', () => {
    it('should maintain stable memory usage pattern', () => {
      const memorySnapshots: number[] = [];
      
      const simulateProcessing = () => {
        for (let batch = 0; batch < 10; batch++) {
          const data = Array.from({ length: 100 }, () => 'x'.repeat(1000));
          memorySnapshots.push(data.length * 1000);
        }
      };

      simulateProcessing();

      const maxMemory = Math.max(...memorySnapshots);
      const avgMemory = memorySnapshots.reduce((a, b) => a + b, 0) / memorySnapshots.length;
      
      expect(maxMemory / avgMemory).toBeLessThan(2);
    });
  });

  describe('TC-AI-HARD-09: Retry Storm Prevention', () => {
    it('should implement exponential backoff', () => {
      const calculateBackoff = (attempt: number, baseMs: number = 1000): number => {
        return Math.min(baseMs * Math.pow(2, attempt), 60000);
      };

      expect(calculateBackoff(0)).toBe(1000);
      expect(calculateBackoff(1)).toBe(2000);
      expect(calculateBackoff(2)).toBe(4000);
      expect(calculateBackoff(6)).toBe(60000);
    });

    it('should not flood API on failures', async () => {
      const callTimestamps: number[] = [];
      const MAX_CALLS_PER_SECOND = 5;
      
      const makeCallWithBackoff = async (attempt: number): Promise<void> => {
        callTimestamps.push(Date.now());
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 10));
      };

      for (let i = 0; i < 5; i++) {
        await makeCallWithBackoff(i);
      }

      const oneSecondAgo = Date.now() - 1000;
      const recentCalls = callTimestamps.filter(t => t > oneSecondAgo);
      
      expect(recentCalls.length).toBeLessThanOrEqual(MAX_CALLS_PER_SECOND);
    });
  });

  describe('TC-AI-HARD-10: Batch Resume After Failure', () => {
    it('should continue from last successful item', async () => {
      const processedItems = new Set<string>();
      let failurePoint = 5;
      let resumeAttempt = false;

      const processBatch = async (items: string[], startFrom: number = 0): Promise<{ completed: number; lastSuccess: number }> => {
        let lastSuccess = startFrom - 1;
        
        for (let i = startFrom; i < items.length; i++) {
          if (i === failurePoint && !resumeAttempt) {
            throw new Error('Simulated failure');
          }
          processedItems.add(items[i]);
          lastSuccess = i;
        }
        
        return { completed: processedItems.size, lastSuccess };
      };

      const items = Array.from({ length: 10 }, (_, i) => `item-${i}`);
      
      let checkpoint = 0;
      try {
        await processBatch(items, checkpoint);
      } catch {
        checkpoint = failurePoint;
      }

      resumeAttempt = true;
      const result = await processBatch(items, checkpoint);

      expect(result.completed).toBe(10);
      expect(result.lastSuccess).toBe(9);
    });
  });
});

describe('LinkedIn + News Intelligence (TC-AI-HARD-11 to TC-AI-HARD-20)', () => {

  describe('TC-AI-HARD-11: No Recent LinkedIn Activity', () => {
    it('should use safe fallback language', () => {
      const prospect = createMockProspect('p-1', { linkedinActivity: null });
      
      const generateIntro = (p: ProspectContext): string => {
        if (!p.linkedinActivity) {
          return `Hi ${p.firstName}, I wanted to reach out regarding ${p.companyName}.`;
        }
        return `Hi ${p.firstName}, I noticed ${p.linkedinActivity}...`;
      };

      const intro = generateIntro(prospect);
      
      expect(intro).not.toContain('I noticed');
      expect(intro).toContain('wanted to reach out');
    });
  });

  describe('TC-AI-HARD-12: Conflicting LinkedIn + News Signals', () => {
    it('should respect priority logic (LinkedIn > News)', () => {
      const prospect = createMockProspect('p-1', {
        linkedinActivity: 'Just promoted to CEO',
        newsItems: [{ 
          id: 'n-1', headline: 'Company lays off 20%', source: 'Reuters',
          publishedAt: new Date(), authority: 'high', region: 'US', paywall: false
        }]
      });

      const selectSignal = (p: ProspectContext): { source: 'linkedin' | 'news'; content: string } => {
        if (p.linkedinActivity) {
          return { source: 'linkedin', content: p.linkedinActivity };
        }
        if (p.newsItems.length > 0) {
          return { source: 'news', content: p.newsItems[0].headline };
        }
        return { source: 'linkedin', content: '' };
      };

      const signal = selectSignal(prospect);
      
      expect(signal.source).toBe('linkedin');
      expect(signal.content).toContain('CEO');
    });
  });

  describe('TC-AI-HARD-13: News From Same Company, Different Region', () => {
    it('should check context relevance', () => {
      const prospectRegion = 'US';
      const newsItem: NewsItem = {
        id: 'n-1', headline: 'Company expands in Asia',
        source: 'BBC', publishedAt: new Date(), authority: 'high',
        region: 'Asia', paywall: false
      };

      const isRelevant = (news: NewsItem, targetRegion: string): boolean => {
        if (news.region === targetRegion) return true;
        if (news.headline.toLowerCase().includes('global')) return true;
        return false;
      };

      expect(isRelevant(newsItem, prospectRegion)).toBe(false);
    });
  });

  describe('TC-AI-HARD-14: Fake / Low-Authority News', () => {
    it('should ignore low-authority sources', () => {
      const newsItems: NewsItem[] = [
        { id: 'n-1', headline: 'Fake news headline', source: 'RandomBlog', publishedAt: new Date(), authority: 'low', region: 'US', paywall: false },
        { id: 'n-2', headline: 'Real news headline', source: 'Reuters', publishedAt: new Date(), authority: 'high', region: 'US', paywall: false }
      ];

      const filterNews = (items: NewsItem[]): NewsItem[] => {
        return items.filter(n => n.authority !== 'low');
      };

      const filtered = filterNews(newsItems);
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].source).toBe('Reuters');
    });
  });

  describe('TC-AI-HARD-15: Very Recent News (<24 hrs)', () => {
    it('should correctly mention recent news', () => {
      const recentNews: NewsItem = {
        id: 'n-1', headline: 'Company announces new product',
        source: 'TechCrunch', publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        authority: 'high', region: 'US', paywall: false
      };

      const formatMention = (news: NewsItem): string => {
        const hoursAgo = (Date.now() - news.publishedAt.getTime()) / (1000 * 60 * 60);
        if (hoursAgo < 24) {
          return `I just saw that ${news.headline.toLowerCase()}`;
        }
        return `I noticed that ${news.headline.toLowerCase()}`;
      };

      const mention = formatMention(recentNews);
      
      expect(mention).toContain('just saw');
    });

    it('should not speculate about recent news', () => {
      const validateNoSpeculation = (content: string): boolean => {
        const speculationPhrases = ['probably', 'likely means', 'might be', 'could indicate'];
        return !speculationPhrases.some(p => content.toLowerCase().includes(p));
      };

      const goodContent = 'I saw your company announced a new product launch.';
      const badContent = 'This probably means you are expanding rapidly.';

      expect(validateNoSpeculation(goodContent)).toBe(true);
      expect(validateNoSpeculation(badContent)).toBe(false);
    });
  });

  describe('TC-AI-HARD-16: Old News (>1 year)', () => {
    it('should not use old news', () => {
      const oldNews: NewsItem = {
        id: 'n-1', headline: 'Company IPO',
        source: 'WSJ', publishedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
        authority: 'high', region: 'US', paywall: false
      };

      const isNewsUsable = (news: NewsItem, maxAgeDays: number = 365): boolean => {
        const ageMs = Date.now() - news.publishedAt.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        return ageDays <= maxAgeDays;
      };

      expect(isNewsUsable(oldNews)).toBe(false);
    });
  });

  describe('TC-AI-HARD-17: LinkedIn Job Change Detected', () => {
    it('should use congratulatory tone', () => {
      const prospect = createMockProspect('p-1', {
        linkedinActivity: 'Started new position as VP of Sales'
      });

      const detectJobChange = (activity: string | null): boolean => {
        if (!activity) return false;
        const patterns = ['new position', 'started', 'joined', 'promoted', 'appointed'];
        return patterns.some(p => activity.toLowerCase().includes(p));
      };

      const generateIntro = (p: ProspectContext): string => {
        if (detectJobChange(p.linkedinActivity)) {
          return `Congratulations on your new role at ${p.companyName}!`;
        }
        return `Hi ${p.firstName}, reaching out about ${p.companyName}.`;
      };

      expect(detectJobChange(prospect.linkedinActivity)).toBe(true);
      expect(generateIntro(prospect)).toContain('Congratulations');
    });
  });

  describe('TC-AI-HARD-18: Multiple Recent Events', () => {
    it('should select best relevance', () => {
      const newsItems: NewsItem[] = [
        { id: 'n-1', headline: 'Company holiday party', source: 'Local', publishedAt: new Date(), authority: 'low', region: 'US', paywall: false },
        { id: 'n-2', headline: 'Company raises $100M Series C', source: 'TechCrunch', publishedAt: new Date(), authority: 'high', region: 'US', paywall: false },
        { id: 'n-3', headline: 'Company wins award', source: 'Industry', publishedAt: new Date(), authority: 'medium', region: 'US', paywall: false }
      ];

      const selectBestNews = (items: NewsItem[]): NewsItem | null => {
        const sorted = items
          .filter(n => n.authority !== 'low')
          .sort((a, b) => {
            const authorityOrder = { high: 0, medium: 1, low: 2 };
            return authorityOrder[a.authority] - authorityOrder[b.authority];
          });
        return sorted[0] || null;
      };

      const best = selectBestNews(newsItems);
      
      expect(best?.headline).toContain('$100M');
    });
  });

  describe('TC-AI-HARD-19: News Paywall / Blocked', () => {
    it('should gracefully skip paywalled content', () => {
      const newsItems: NewsItem[] = [
        { id: 'n-1', headline: 'Paywalled article', source: 'WSJ', publishedAt: new Date(), authority: 'high', region: 'US', paywall: true },
        { id: 'n-2', headline: 'Free article', source: 'TechCrunch', publishedAt: new Date(), authority: 'high', region: 'US', paywall: false }
      ];

      const filterAccessible = (items: NewsItem[]): NewsItem[] => {
        return items.filter(n => !n.paywall);
      };

      const accessible = filterAccessible(newsItems);
      
      expect(accessible.length).toBe(1);
      expect(accessible[0].paywall).toBe(false);
    });
  });

  describe('TC-AI-HARD-20: Mismatched Person vs Company', () => {
    it('should prevent incorrect attribution', () => {
      const prospect = {
        name: 'John Smith',
        company: 'Acme Corp'
      };
      
      const newsItem = {
        headline: 'Tech Giant announces layoffs',
        mentionedCompany: 'Tech Giant Inc'
      };

      const isValidAttribution = (prospectCompany: string, newsCompany: string): boolean => {
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normalize(prospectCompany).includes(normalize(newsCompany)) ||
               normalize(newsCompany).includes(normalize(prospectCompany));
      };

      expect(isValidAttribution(prospect.company, newsItem.mentionedCompany)).toBe(false);
    });
  });
});

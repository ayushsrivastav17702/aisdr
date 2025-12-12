import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';

class OpenAIHelper {
  private primaryClient: OpenAI | null = null;
  private backupClient: OpenAI | null = null;
  private openRouterClient: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private useBackupKey: boolean = false;

  /**
   * Check if an error is a 429 quota exceeded error
   * OpenAI SDK can return status in different places
   */
  private isQuotaError(error: any): boolean {
    // Check direct status field
    if (error?.status === 429) return true;
    // Check response status
    if (error?.response?.status === 429) return true;
    // Check error code
    if (error?.code === 'insufficient_quota' || error?.code === 'rate_limit_exceeded') return true;
    // Check error message for 429 indicator
    if (typeof error?.message === 'string' && error.message.includes('429')) return true;
    if (typeof error?.message === 'string' && error.message.toLowerCase().includes('quota')) return true;
    return false;
  }

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.primaryClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    if (process.env.OPENAI_API_KEY_BACKUP) {
      this.backupClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_BACKUP });
      console.log('✅ Backup OpenAI API key configured');
    }

    if (process.env.OPEN_ROUTER) {
      this.openRouterClient = new OpenAI({ 
        apiKey: process.env.OPEN_ROUTER,
        baseURL: 'https://openrouter.ai/api/v1'
      });
      console.log('✅ OpenRouter API key configured');
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log('✅ Anthropic API key configured as fallback');
    }
  }

  getOpenRouterClient(): OpenAI | null {
    return this.openRouterClient;
  }

  getClient(): OpenAI {
    if (this.useBackupKey && this.backupClient) {
      return this.backupClient;
    }
    if (this.primaryClient) {
      return this.primaryClient;
    }
    throw new Error('OpenAI is not configured. Please set OPENAI_API_KEY.');
  }

  async callWithFallback<T>(
    apiCall: (client: OpenAI) => Promise<T>,
    anthropicFallback?: (anthropic: Anthropic) => Promise<T>,
    openRouterFallback?: (client: OpenAI) => Promise<T>
  ): Promise<T> {
    const client = this.getClient();

    try {
      return await apiCall(client);
    } catch (error: any) {
      const isQuota = this.isQuotaError(error);
      console.log(`🔍 AI error detected - isQuotaError: ${isQuota}, useBackupKey: ${this.useBackupKey}, status: ${error?.status}, message: ${error?.message?.substring(0, 100)}`);
      
      // If backup key is already active and fails with 429, try OpenRouter then Anthropic
      if (isQuota && this.useBackupKey) {
        console.error('⚠️ Backup OpenAI key quota exceeded:', error?.message || error);
        this.useBackupKey = false; // Reset for future requests
        
        // Try OpenRouter first if available
        if (this.openRouterClient && openRouterFallback) {
          console.log('⚠️ Falling back to OpenRouter...');
          try {
            return await openRouterFallback(this.openRouterClient);
          } catch (openRouterError: any) {
            console.error('⚠️ OpenRouter fallback failed:', openRouterError?.message || openRouterError);
          }
        }
        
        // Then try Anthropic if available
        if (this.anthropic && anthropicFallback) {
          console.log('⚠️ Falling back to Anthropic...');
          try {
            return await anthropicFallback(this.anthropic);
          } catch (anthropicError: any) {
            console.error('⚠️ Anthropic fallback also failed:', anthropicError?.message || anthropicError);
            throw new Error(`All AI providers failed. Last error: ${anthropicError?.message || anthropicError}`);
          }
        }
        
        throw error;
      }
      
      // Check if it's a quota error (429) and we have a backup
      if (isQuota && !this.useBackupKey && this.backupClient) {
        console.log('⚠️ Primary OpenAI API key quota exceeded, switching to backup key...');
        this.useBackupKey = true;
        
        try {
          // Retry with backup key
          return await apiCall(this.backupClient);
        } catch (backupError: any) {
          console.error('⚠️ Backup OpenAI key also failed:', backupError?.message || backupError);
          this.useBackupKey = false; // Reset for future requests
          
          // Try OpenRouter next if available
          if (this.openRouterClient && openRouterFallback) {
            console.log('⚠️ Falling back to OpenRouter...');
            try {
              return await openRouterFallback(this.openRouterClient);
            } catch (openRouterError: any) {
              console.error('⚠️ OpenRouter fallback failed:', openRouterError?.message || openRouterError);
            }
          }
          
          // If OpenRouter also fails and we have Anthropic fallback, try that
          if (this.anthropic && anthropicFallback) {
            console.log('⚠️ Falling back to Anthropic...');
            try {
              return await anthropicFallback(this.anthropic);
            } catch (anthropicError: any) {
              console.error('⚠️ Anthropic fallback also failed:', anthropicError?.message || anthropicError);
              throw new Error(`All AI providers failed. Last error: ${anthropicError?.message || anthropicError}`);
            }
          }
          throw backupError;
        }
      }
      
      // If primary fails with 429 and no backup, try OpenRouter then Anthropic
      if (isQuota && !this.backupClient) {
        // Try OpenRouter first if available
        if (this.openRouterClient && openRouterFallback) {
          console.log('⚠️ OpenAI quota exceeded, falling back to OpenRouter...');
          try {
            return await openRouterFallback(this.openRouterClient);
          } catch (openRouterError: any) {
            console.error('⚠️ OpenRouter fallback failed:', openRouterError?.message || openRouterError);
          }
        }
        
        // Then try Anthropic if available
        if (this.anthropic && anthropicFallback) {
          console.log('⚠️ Falling back to Anthropic...');
          try {
            return await anthropicFallback(this.anthropic);
          } catch (anthropicError: any) {
            console.error('⚠️ Anthropic fallback failed:', anthropicError?.message || anthropicError);
            throw new Error(`AI generation failed. OpenAI: ${error?.message}. Anthropic: ${anthropicError?.message}`);
          }
        }
      }
      
      throw error;
    }
  }
}

export const openaiHelper = new OpenAIHelper();

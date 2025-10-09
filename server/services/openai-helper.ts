import OpenAI from "openai";
import Anthropic from '@anthropic-ai/sdk';

class OpenAIHelper {
  private primaryClient: OpenAI | null = null;
  private backupClient: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private useBackupKey: boolean = false;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.primaryClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    if (process.env.OPENAI_API_KEY_BACKUP) {
      this.backupClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_BACKUP });
      console.log('✅ Backup OpenAI API key configured');
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      console.log('✅ Anthropic API key configured as fallback');
    }
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
    anthropicFallback?: (anthropic: Anthropic) => Promise<T>
  ): Promise<T> {
    const client = this.getClient();

    try {
      return await apiCall(client);
    } catch (error: any) {
      // Check if it's a quota error (429) and we have a backup
      if (error?.status === 429 && !this.useBackupKey && this.backupClient) {
        console.log('⚠️ Primary OpenAI API key quota exceeded, switching to backup key...');
        this.useBackupKey = true;
        
        try {
          // Retry with backup key
          return await apiCall(this.backupClient);
        } catch (backupError: any) {
          console.error('⚠️ Backup OpenAI key also failed:', backupError?.message || backupError);
          
          // If backup also fails and we have Anthropic fallback, try that
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
      
      // If primary fails with 429 and no backup, try Anthropic if available
      if (error?.status === 429 && !this.backupClient && this.anthropic && anthropicFallback) {
        console.log('⚠️ OpenAI quota exceeded, falling back to Anthropic...');
        try {
          return await anthropicFallback(this.anthropic);
        } catch (anthropicError: any) {
          console.error('⚠️ Anthropic fallback failed:', anthropicError?.message || anthropicError);
          throw new Error(`AI generation failed. OpenAI: ${error?.message}. Anthropic: ${anthropicError?.message}`);
        }
      }
      
      throw error;
    }
  }
}

export const openaiHelper = new OpenAIHelper();

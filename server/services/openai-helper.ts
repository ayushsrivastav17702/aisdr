import OpenAI from "openai";

class OpenAIHelper {
  private primaryClient: OpenAI | null = null;
  private backupClient: OpenAI | null = null;
  private useBackupKey: boolean = false;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.primaryClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    if (process.env.OPENAI_API_KEY_BACKUP) {
      this.backupClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY_BACKUP });
      console.log('✅ Backup OpenAI API key configured');
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
    apiCall: (client: OpenAI) => Promise<T>
  ): Promise<T> {
    const client = this.getClient();

    try {
      return await apiCall(client);
    } catch (error: any) {
      // Check if it's a quota error (429) and we have a backup
      if (error?.status === 429 && !this.useBackupKey && this.backupClient) {
        console.log('⚠️ Primary OpenAI API key quota exceeded, switching to backup key...');
        this.useBackupKey = true;
        
        // Retry with backup key
        return await apiCall(this.backupClient);
      }
      throw error;
    }
  }
}

export const openaiHelper = new OpenAIHelper();

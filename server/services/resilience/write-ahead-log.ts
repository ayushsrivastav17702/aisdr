import { EventEmitter } from "events";

export type WalOperationType = "insert" | "update" | "delete";
export type WalStatus = "pending" | "committed" | "failed" | "retrying";

export interface WalEntry<T = unknown> {
  id: string;
  operationType: WalOperationType;
  tableName: string;
  data: T;
  status: WalStatus;
  createdAt: Date;
  attempts: number;
  lastAttemptAt: Date | null;
  errorMessage?: string;
}

export interface WriteAheadLogOptions {
  maxRetries: number;
  retryIntervalMs: number;
  persistToDisk: boolean;
}

const DEFAULT_OPTIONS: WriteAheadLogOptions = {
  maxRetries: 5,
  retryIntervalMs: 5000,
  persistToDisk: false,
};

class WriteAheadLog extends EventEmitter {
  private entries = new Map<string, WalEntry>();
  private options: WriteAheadLogOptions;
  private processInterval: NodeJS.Timeout | null = null;

  constructor(options: Partial<WriteAheadLogOptions> = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async logOperation<T>(
    id: string,
    operationType: WalOperationType,
    tableName: string,
    data: T
  ): Promise<WalEntry<T>> {
    const entry: WalEntry<T> = {
      id,
      operationType,
      tableName,
      data,
      status: "pending",
      createdAt: new Date(),
      attempts: 0,
      lastAttemptAt: null,
    };

    this.entries.set(id, entry as WalEntry);
    this.emit("logged", entry);

    return entry;
  }

  markCommitted(id: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.status = "committed";
      this.emit("committed", entry);
      this.entries.delete(id);
    }
  }

  markFailed(id: string, errorMessage: string): void {
    const entry = this.entries.get(id);
    if (entry) {
      entry.attempts++;
      entry.lastAttemptAt = new Date();
      entry.errorMessage = errorMessage;

      if (entry.attempts >= this.options.maxRetries) {
        entry.status = "failed";
        this.emit("failed", entry);
      } else {
        entry.status = "retrying";
        this.emit("retrying", entry);
      }
    }
  }

  getPendingOperations(): WalEntry[] {
    return Array.from(this.entries.values()).filter(
      (e) => e.status === "pending" || e.status === "retrying"
    );
  }

  getFailedOperations(): WalEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.status === "failed");
  }

  getEntry(id: string): WalEntry | undefined {
    return this.entries.get(id);
  }

  getStats(): {
    pending: number;
    retrying: number;
    failed: number;
    committed: number;
  } {
    const entries = Array.from(this.entries.values());
    return {
      pending: entries.filter((e) => e.status === "pending").length,
      retrying: entries.filter((e) => e.status === "retrying").length,
      failed: entries.filter((e) => e.status === "failed").length,
      committed: 0,
    };
  }

  startProcessing(executor: (entry: WalEntry) => Promise<void>): void {
    if (this.processInterval) return;

    this.processInterval = setInterval(async () => {
      const pending = this.getPendingOperations();

      for (const entry of pending) {
        if (entry.status === "retrying") {
          const timeSinceLastAttempt = entry.lastAttemptAt
            ? Date.now() - entry.lastAttemptAt.getTime()
            : Infinity;

          if (timeSinceLastAttempt < this.options.retryIntervalMs) {
            continue;
          }
        }

        try {
          await executor(entry);
          this.markCommitted(entry.id);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.markFailed(entry.id, errorMsg);
        }
      }
    }, 1000);
  }

  stopProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export const writeAheadLog = new WriteAheadLog();

export async function withWriteAheadLog<T>(
  id: string,
  operationType: WalOperationType,
  tableName: string,
  data: unknown,
  operation: () => Promise<T>
): Promise<T> {
  await writeAheadLog.logOperation(id, operationType, tableName, data);

  try {
    const result = await operation();
    writeAheadLog.markCommitted(id);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    writeAheadLog.markFailed(id, errorMsg);
    throw error;
  }
}

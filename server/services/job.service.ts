import { Queue, Worker, Job as BullJob } from 'bullmq';
import { storage, type RequestContext } from '../storage';
import { apolloService } from './apollo.service';
import { type Job, type Prospect, type InsertProspect } from '@shared/schema';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { redisConnection, isRedisConfigured } from '../queue/redis-connection';

// Use shared Redis connection
const redis = redisConnection;
const REDIS_ENABLED = isRedisConfigured && !!redis;

// Job queues (only if Redis is configured)
let enrichmentQueue: Queue | null = null;
let importQueue: Queue | null = null;
let searchQueue: Queue | null = null;

if (REDIS_ENABLED && redis) {
  enrichmentQueue = new Queue('enrichment', { connection: redis });
  importQueue = new Queue('import', { connection: redis });
  searchQueue = new Queue('search', { connection: redis });
}

// Serializable context for job data (stored in queue and DB)
interface JobContext {
  userId: string;
  roles: string[];
  actingAs?: string;
}

// Job data interfaces - all include full context for multi-tenant isolation
interface EnrichmentJobData {
  jobId: string;
  context: JobContext;
  prospectIds: string[];
  batchSize?: number;
}

interface ImportJobData {
  jobId: string;
  context: JobContext;
  filePath: string;
  fieldMappings: Record<string, string>;
  skipDuplicates: boolean;
  autoEnrich: boolean;
}

interface SearchJobData {
  jobId: string;
  context: JobContext;
  query: string;
  apolloFilters: any;
  maxResults?: number;
}

// Helper to serialize RequestContext for job data
function serializeContext(ctx: RequestContext): JobContext {
  return {
    userId: ctx.userId,
    roles: ctx.roles || [],
    actingAs: ctx.actingAs,
  };
}

// Helper to reconstruct RequestContext from job data
function deserializeContext(jobCtx: JobContext): RequestContext {
  return {
    userId: jobCtx.userId,
    roles: jobCtx.roles,
    actingAs: jobCtx.actingAs,
  };
}

class JobService {
  constructor() {
    this.setupWorkers();
  }

  private setupWorkers() {
    if (!REDIS_ENABLED || !redis) {
      console.log('Redis not configured - job queue features disabled');
      return;
    }

    // Enrichment worker
    new Worker('enrichment', async (job: BullJob<EnrichmentJobData>) => {
      return await this.processEnrichmentJob(job);
    }, {
      connection: redis,
      concurrency: 3,
    });

    // Import worker
    new Worker('import', async (job: BullJob<ImportJobData>) => {
      return await this.processImportJob(job);
    }, {
      connection: redis,
      concurrency: 2,
    });

    // Search worker
    new Worker('search', async (job: BullJob<SearchJobData>) => {
      return await this.processSearchJob(job);
    }, {
      connection: redis,
      concurrency: 2,
    });
  }

  async createEnrichmentJob(ctx: RequestContext, prospectIds: string[]): Promise<Job> {
    if (!REDIS_ENABLED || !enrichmentQueue) {
      throw new Error('Job queue not available. Please configure Redis to enable background job processing.');
    }

    const serializedCtx = serializeContext(ctx);
    
    // Create job record in database with full context
    const job = await storage.createJob(ctx, {
      type: 'enrichment',
      title: 'Prospect Enrichment',
      description: `Enriching ${prospectIds.length} prospects`,
      totalItems: prospectIds.length,
      status: 'queued',
      jobData: { prospectIds, context: serializedCtx },
      userId: ctx.userId,
    });

    // Add to queue with full context for multi-tenant isolation
    await enrichmentQueue.add('enrichment', {
      jobId: job.id,
      context: serializedCtx,
      prospectIds,
      batchSize: 10,
    });

    return job;
  }

  async createImportJob(
    ctx: RequestContext,
    filePath: string, 
    fieldMappings: Record<string, string>,
    options: { skipDuplicates?: boolean; autoEnrich?: boolean } = {}
  ): Promise<Job> {
    if (!REDIS_ENABLED || !importQueue) {
      throw new Error('Job queue not available. Please configure Redis to enable background job processing.');
    }

    const serializedCtx = serializeContext(ctx);
    
    const job = await storage.createJob(ctx, {
      type: 'import',
      title: 'CSV Import',
      description: `Importing prospects from ${filePath}`,
      totalItems: 0,
      status: 'queued',
      jobData: { filePath, fieldMappings, ...options, context: serializedCtx },
      userId: ctx.userId,
    });

    await importQueue.add('import', {
      jobId: job.id,
      context: serializedCtx,
      filePath,
      fieldMappings,
      skipDuplicates: options.skipDuplicates ?? true,
      autoEnrich: options.autoEnrich ?? false,
    });

    return job;
  }

  async createSearchJob(ctx: RequestContext, query: string, apolloFilters: any, maxResults = 1000): Promise<Job> {
    if (!REDIS_ENABLED || !searchQueue) {
      throw new Error('Job queue not available. Please configure Redis to enable background job processing.');
    }

    const serializedCtx = serializeContext(ctx);
    
    const job = await storage.createJob(ctx, {
      type: 'search',
      title: 'Apollo Search',
      description: `Searching: ${query}`,
      totalItems: maxResults,
      status: 'queued',
      jobData: { query, apolloFilters, maxResults, context: serializedCtx },
      userId: ctx.userId,
    });

    await searchQueue.add('search', {
      jobId: job.id,
      context: serializedCtx,
      query,
      apolloFilters,
      maxResults,
    });

    return job;
  }

  private async processEnrichmentJob(job: BullJob<EnrichmentJobData>) {
    const { jobId, context, prospectIds, batchSize = 10 } = job.data;
    const ctx = deserializeContext(context);
    
    try {
      // Update job status
      await storage.updateJob(ctx, jobId, {
        status: 'running',
        startedAt: new Date(),
      });

      const prospects = await storage.getProspectsByIds(ctx, prospectIds);
      let successCount = 0;
      let failureCount = 0;
      let partialCount = 0;

      // Process in batches
      for (let i = 0; i < prospects.length; i += batchSize) {
        const batch = prospects.slice(i, i + batchSize);
        
        // Prepare contacts for bulk enrichment
        const contactsToEnrich = batch.map(prospect => ({
          email: prospect.primaryEmail || undefined,
          first_name: prospect.firstName || undefined,
          last_name: prospect.lastName || undefined,
          organization_name: prospect.companyName || undefined,
          linkedin_url: prospect.linkedinUrl || undefined,
        }));

        try {
          const enrichmentResult = await apolloService.bulkEnrichContacts(contactsToEnrich);
          const enrichedMatches = enrichmentResult.matches || [];
          
          // Update prospects with enriched data
          for (let j = 0; j < batch.length; j++) {
            const prospect = batch[j];
            const enrichedContact = enrichedMatches[j];
            
            try {
              if (enrichedContact) {
                // Full enrichment successful
                const enrichedProspect = await apolloService.convertApolloContactToProspect(enrichedContact);
                await storage.updateProspect(ctx, prospect.id, {
                  ...enrichedProspect,
                  enrichmentStatus: 'enriched',
                });
                successCount++;
              } else {
                // Partial enrichment
                await storage.updateProspect(ctx, prospect.id, {
                  enrichmentStatus: 'partial',
                  enrichmentData: {
                    error: 'No additional data found',
                    enrichedAt: new Date().toISOString(),
                  },
                });
                partialCount++;
              }
            } catch (error) {
              // Individual prospect enrichment failed
              await storage.updateProspect(ctx, prospect.id, {
                enrichmentStatus: 'failed',
                enrichmentData: {
                  error: error instanceof Error ? error.message : 'Unknown error',
                  enrichedAt: new Date().toISOString(),
                },
              });
              failureCount++;
            }
          }
        } catch (error) {
          // Entire batch failed
          for (const prospect of batch) {
            await storage.updateProspect(ctx, prospect.id, {
              enrichmentStatus: 'failed',
              enrichmentData: {
                error: error instanceof Error ? error.message : 'Batch enrichment failed',
                enrichedAt: new Date().toISOString(),
              },
            });
            failureCount++;
          }
        }

        // Update job progress
        await storage.updateJob(ctx, jobId, {
          processedItems: Math.min(i + batchSize, prospects.length),
          successCount,
          failureCount,
          partialCount,
        });

        // Update job progress for real-time updates
        await job.updateProgress(Math.floor(((i + batchSize) / prospects.length) * 100));
      }

      // Complete the job
      await storage.updateJob(ctx, jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedItems: prospects.length,
        successCount,
        failureCount,
        partialCount,
      });

      return { success: true, successCount, failureCount, partialCount };
    } catch (error) {
      await storage.updateJob(ctx, jobId, {
        status: 'failed',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async processImportJob(job: BullJob<ImportJobData>) {
    const { jobId, context, filePath, fieldMappings, skipDuplicates, autoEnrich } = job.data;
    const ctx = deserializeContext(context);
    
    try {
      await storage.updateJob(ctx, jobId, {
        status: 'running',
        startedAt: new Date(),
      });

      const csvData = await this.parseCSVFile(filePath);
      
      await storage.updateJob(ctx, jobId, {
        totalItems: csvData.length,
      });

      let successCount = 0;
      let failureCount = 0;
      let duplicateCount = 0;

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        
        try {
          // Map CSV row to prospect format, including userId
          const prospectData = this.mapCSVRowToProspect(row, fieldMappings, ctx.userId);
          
          // Check for duplicates if enabled
          if (skipDuplicates && prospectData.primaryEmail) {
            const duplicates = await storage.checkDuplicateProspects(ctx, [prospectData.primaryEmail]);
            if (duplicates.length > 0) {
              duplicateCount++;
              continue;
            }
          }

          // Create prospect
          const prospect = await storage.createProspect(ctx, prospectData);
          successCount++;

          // Auto-enrich if enabled
          if (autoEnrich) {
            await this.createEnrichmentJob(ctx, [prospect.id]);
          }
        } catch (error) {
          failureCount++;
        }

        // Update progress
        if (i % 10 === 0) {
          await storage.updateJob(ctx, jobId, {
            processedItems: i + 1,
            successCount,
            failureCount,
          });
          await job.updateProgress(Math.floor(((i + 1) / csvData.length) * 100));
        }
      }

      // Complete the job
      await storage.updateJob(ctx, jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedItems: csvData.length,
        successCount,
        failureCount,
        results: {
          imported: successCount,
          failed: failureCount,
          duplicates: duplicateCount,
        },
      });

      return { success: true, imported: successCount, failed: failureCount, duplicates: duplicateCount };
    } catch (error) {
      await storage.updateJob(ctx, jobId, {
        status: 'failed',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async processSearchJob(job: BullJob<SearchJobData>) {
    const { jobId, context, query, apolloFilters, maxResults = 1000 } = job.data;
    const ctx = deserializeContext(context);
    
    try {
      await storage.updateJob(ctx, jobId, {
        status: 'running',
        startedAt: new Date(),
      });

      const prospects: Prospect[] = [];
      let page = 1;
      const perPage = 100;
      let totalProcessed = 0;

      while (totalProcessed < maxResults) {
        const searchResponse = await apolloService.searchContacts({
          ...apolloFilters,
          page,
          per_page: Math.min(perPage, maxResults - totalProcessed),
        });

        const contacts = searchResponse.contacts || [];
        if (!contacts.length) break;

        // Convert and save prospects
        for (const contact of contacts) {
          try {
            const prospectData = await apolloService.convertApolloContactToProspect(contact);
            
            // Check for duplicates
            const duplicates = await storage.checkDuplicateProspects(ctx, [prospectData.primaryEmail!]);
            if (duplicates.length === 0) {
              const prospect = await storage.createProspect(ctx, {
                ...prospectData,
                userId: ctx.userId,
              });
              prospects.push(prospect);
            }
          } catch (error) {
            console.error('Error processing search result:', error);
          }
        }

        totalProcessed += contacts.length;
        page++;

        // Update progress
        await storage.updateJob(ctx, jobId, {
          processedItems: totalProcessed,
          successCount: prospects.length,
        });
        await job.updateProgress(Math.floor((totalProcessed / maxResults) * 100));

        if (contacts.length < perPage) break;
      }

      // Complete the job
      await storage.updateJob(ctx, jobId, {
        status: 'completed',
        completedAt: new Date(),
        processedItems: totalProcessed,
        successCount: prospects.length,
        results: {
          imported: prospects.length,
          totalFound: totalProcessed,
        },
      });

      return { success: true, imported: prospects.length, totalFound: totalProcessed };
    } catch (error) {
      await storage.updateJob(ctx, jobId, {
        status: 'failed',
        completedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async parseCSVFile(filePath: string): Promise<any[]> {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_quotes: true,
        relax_column_count: true,
        skip_records_with_error: true,
        bom: true,
        escape: '"',
        quote: '"',
        relax_column_count_less: true,
        relax_column_count_more: true,
        on_record: (record: any, context: any) => {
          try {
            return record;
          } catch (err) {
            console.warn(`Skipping malformed row at line ${context.lines}:`, err);
            return null;
          }
        }
      }).filter((r: any) => r !== null);
      return records;
    } catch (error) {
      console.error('CSV parsing error:', error);
      throw new Error(`Failed to parse CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private mapCSVRowToProspect(row: any, fieldMappings: Record<string, string>, userId: string): InsertProspect {
    const prospect: InsertProspect = {
      userId,
    };
    
    for (const [csvField, prospectField] of Object.entries(fieldMappings)) {
      if (prospectField && row[csvField]) {
        (prospect as any)[prospectField] = row[csvField];
      }
    }

    return prospect;
  }

  async getJobStatus(ctx: RequestContext, jobId: string): Promise<Job | undefined> {
    return await storage.getJob(ctx, jobId);
  }

  async cancelJob(ctx: RequestContext, jobId: string): Promise<void> {
    await storage.updateJob(ctx, jobId, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  }
}

export const jobService = new JobService();

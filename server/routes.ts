import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { aiService } from "./services/ai.service";
import { apolloService } from "./services/apollo.service";
import { jobService } from "./services/job.service";
import { lushaService } from "./services/lusha.service";
import { intelligentPersonalizationService } from "./services/intelligent-personalization.service";
import { webScrapingService } from "./services/web-scraping.service";
import { contentManagementService } from "./services/content-management.service";
import { 
  aiSearchSchema, 
  enrichmentRequestSchema, 
  csvImportSchema,
  insertProspectSchema 
} from "@shared/schema";
import multer from "multer";
import { z } from "zod";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import sequenceRoutes from "./sequences-routes";
import mailboxRoutes from "./mailbox-routes";

const upload = multer({ dest: 'uploads/' });

export async function registerRoutes(app: Express): Promise<Server> {
  
  // AI Search endpoint
  app.post("/api/ai-search", async (req, res) => {
    try {
      const validatedBody = aiSearchSchema.extend({ 
        includeLocalProspects: z.boolean().default(true) 
      }).parse(req.body);
      const { query, includeLocalProspects } = validatedBody;
      
      // Parse natural language query
      const { aiFilters, apolloFilters } = await aiService.parseNaturalLanguageQuery(query);
      
      console.log('AI Search Query:', query);
      console.log('AI Filters:', JSON.stringify(aiFilters, null, 2));
      console.log('Apollo Filters:', JSON.stringify(apolloFilters, null, 2));
      
      // Save search record
      const search = await storage.createSearch({
        query,
        aiFilters,
        apolloFilters,
      });

      // Search local prospects if enabled
      let localProspects: any[] = [];
      if (includeLocalProspects) {
        try {
          localProspects = await storage.searchLocalProspects(aiFilters);
          console.log(`Found ${localProspects.length} local prospects matching query`);
        } catch (localSearchError) {
          console.warn("Local prospect search failed:", localSearchError instanceof Error ? localSearchError.message : "Unknown error");
        }
      }

      // Try to create search job for background processing (optional)
      let job = null;
      let jobWarning = null;
      try {
        job = await jobService.createSearchJob(query, apolloFilters);
      } catch (jobError) {
        // Job queue not available - non-fatal, just log and continue
        console.warn("Search job creation skipped:", jobError instanceof Error ? jobError.message : "Unknown error");
        jobWarning = jobError instanceof Error ? jobError.message : "Job queue unavailable";
      }
      
      res.json({ 
        search,
        localProspectsCount: localProspects.length,
        localProspects: localProspects.slice(0, 50),
        job,
        aiFilters,
        apolloFilters,
        ...(jobWarning && { warning: jobWarning })
      });
    } catch (error) {
      console.error("AI search error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "AI search failed" 
      });
    }
  });

  // Direct Apollo search (for immediate results)
  app.post("/api/apollo-search", async (req, res) => {
    try {
      const { apolloFilters, page = 1, per_page = 50 } = req.body;
      
      const searchResponse = await apolloService.searchContacts({
        ...apolloFilters,
        page,
        per_page,
      });

      // Convert contacts to prospect format (Apollo returns in 'people' or 'contacts' array)
      const contacts = searchResponse.people || searchResponse.contacts || [];
      const prospects = contacts.map(contact => 
        apolloService.convertApolloContactToProspect(contact)
      );

      res.json({
        prospects,
        pagination: searchResponse.pagination,
      });
    } catch (error) {
      console.error("Apollo search error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Apollo search failed" 
      });
    }
  });

  // Apollo search and save to database (synchronous alternative to job queue)
  app.post("/api/apollo-search-and-save", async (req, res) => {
    try {
      const { apolloFilters, page = 1, per_page = 50, extractionName, tag } = req.body;
      
      console.log('\n========== APOLLO SEARCH REQUEST ==========');
      console.log('  Extraction Name:', extractionName);
      console.log('  Tag:', tag);
      console.log('  Filters:', JSON.stringify(apolloFilters, null, 2));
      console.log('  Page:', page, 'Per Page:', per_page);
      
      const searchResponse = await apolloService.searchContacts({
        ...apolloFilters,
        page,
        per_page,
      });

      // Convert contacts to prospect format and save to database
      const contacts = searchResponse.people || searchResponse.contacts || [];
      
      console.log('\n========== APOLLO SEARCH RESPONSE ==========');
      console.log('  Total Entries:', searchResponse.pagination?.total_entries || 0);
      console.log('  Contacts Returned:', contacts.length);
      
      if (contacts.length === 0) {
        console.log('  WARNING: No contacts found with current filters!');
        console.log('  Suggestion: Try broadening search criteria or checking Apollo API response');
      }
      const savedProspects = [];
      
      for (const contact of contacts) {
        const prospectData = apolloService.convertApolloContactToProspect(contact);
        
        // Check if prospect already exists (by email or apollo_id)
        const existing = await storage.findProspectByEmailOrApolloId(
          prospectData.primaryEmail,
          prospectData.apolloId
        );

        if (existing) {
          // Update existing prospect with new data, preserving existing tags
          const existingTags = existing.tags || [];
          const newTags = tag ? [tag] : [];
          const mergedTags = Array.from(new Set([...existingTags, ...newTags]));
          
          const updated = await storage.updateProspect(existing.id, {
            ...prospectData,
            tags: mergedTags
          });
          savedProspects.push(updated);
        } else {
          // Create new prospect with tag
          const created = await storage.createProspect({
            ...prospectData,
            tags: tag ? [tag] : undefined
          });
          savedProspects.push(created);
        }
      }

      // Create search record if extraction name is provided
      let searchRecord = null;
      if (extractionName) {
        searchRecord = await storage.createSearch({
          extractionName,
          tag,
          query: extractionName, // Use extraction name as query for now
          apolloFilters,
          totalResults: searchResponse.pagination?.total_entries || 0,
          importedResults: savedProspects.length,
        });
      }

      console.log('\n========== SEARCH COMPLETE ==========');
      console.log('  Prospects Saved:', savedProspects.length);
      console.log('  Search ID:', searchRecord?.id || 'N/A');
      console.log('=========================================\n');

      res.json({
        prospects: savedProspects,
        pagination: searchResponse.pagination,
        saved: savedProspects.length,
        searchId: searchRecord?.id,
      });
    } catch (error) {
      console.error("Apollo search and save error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Apollo search and save failed" 
      });
    }
  });

  // Get prospects with filters
  app.get("/api/prospects", async (req, res) => {
    try {
      const { 
        search, 
        status, 
        page = "1", 
        limit = "50" 
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const offset = (pageNum - 1) * limitNum;

      const result = await storage.getProspects({
        search: search as string,
        status: status as string,
        limit: limitNum,
        offset,
      });

      res.json({
        prospects: result.prospects,
        total: result.total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(result.total / limitNum),
      });
    } catch (error) {
      console.error("Get prospects error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get prospects" 
      });
    }
  });

  // Get single prospect
  app.get("/api/prospects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const prospect = await storage.getProspect(id);
      
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      res.json(prospect);
    } catch (error) {
      console.error("Get prospect error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get prospect" 
      });
    }
  });

  // Create prospect
  app.post("/api/prospects", async (req, res) => {
    try {
      const prospectData = insertProspectSchema.parse(req.body);
      const prospect = await storage.createProspect(prospectData);
      res.json(prospect);
    } catch (error) {
      console.error("Create prospect error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create prospect" 
      });
    }
  });

  // Update prospect
  app.patch("/api/prospects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = insertProspectSchema.partial().parse(req.body);
      const prospect = await storage.updateProspect(id, updates);
      res.json(prospect);
    } catch (error) {
      console.error("Update prospect error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update prospect" 
      });
    }
  });

  // Delete prospect
  app.delete("/api/prospects/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteProspect(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete prospect error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete prospect" 
      });
    }
  });

  // Enrich prospects (uses job queue if Redis available, otherwise direct enrichment)
  app.post("/api/enrich", async (req, res) => {
    try {
      const { prospectIds } = enrichmentRequestSchema.parse(req.body);
      
      // Check if Redis/job queue is available
      const redisEnabled = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
      
      if (redisEnabled) {
        // Use job queue for background processing
        const job = await jobService.createEnrichmentJob(prospectIds);
        res.json({ job });
      } else {
        // Direct enrichment without job queue
        const results = [];
        let successCount = 0;
        let failureCount = 0;
        
        for (const prospectId of prospectIds) {
          try {
            const prospect = await storage.getProspect(prospectId);
            if (!prospect) {
              results.push({ id: prospectId, success: false, error: "Prospect not found" });
              failureCount++;
              continue;
            }

            // Prepare contact for enrichment
            const contactData = {
              email: prospect.primaryEmail || undefined,
              first_name: prospect.firstName || undefined,
              last_name: prospect.lastName || undefined,
              organization_name: prospect.companyName || undefined,
              linkedin_url: prospect.linkedinUrl || undefined,
            };

            // Try Apollo enrichment first
            try {
              const enrichmentResponse = await apolloService.enrichContact(contactData);
              
              if (enrichmentResponse?.contact) {
                const enrichedProspect = apolloService.convertApolloContactToProspect(enrichmentResponse.contact);
                
                // Check if email is locked
                const emailLocked = enrichedProspect.primaryEmail?.includes('email_not_unlocked') || 
                                   enrichedProspect.primaryEmail?.includes('locked');
                
                if (emailLocked) {
                  console.log(`⚠️ Apollo returned locked email for prospect ${prospectId}: ${enrichedProspect.primaryEmail}`);
                  await storage.updateProspect(prospectId, {
                    enrichmentStatus: 'partial',
                    enrichmentData: {
                      error: 'Email is locked - Apollo credits may be required',
                      apollo: enrichmentResponse.contact,
                      enrichedAt: new Date().toISOString(),
                    },
                  });
                  results.push({ 
                    id: prospectId, 
                    success: false, 
                    error: 'Email locked - requires Apollo credits to unlock',
                    emailLocked: true
                  });
                  failureCount++;
                } else {
                  await storage.updateProspect(prospectId, {
                    ...enrichedProspect,
                    enrichmentStatus: 'enriched',
                  });
                  results.push({ id: prospectId, success: true, source: 'apollo' });
                  successCount++;
                }
              } else {
                await storage.updateProspect(prospectId, {
                  enrichmentStatus: 'partial',
                  enrichmentData: {
                    error: 'No data found',
                    enrichedAt: new Date().toISOString(),
                  },
                });
                results.push({ id: prospectId, success: false, error: 'No data found' });
                failureCount++;
              }
            } catch (enrichError) {
              await storage.updateProspect(prospectId, {
                enrichmentStatus: 'failed',
                enrichmentData: {
                  error: enrichError instanceof Error ? enrichError.message : 'Enrichment failed',
                  enrichedAt: new Date().toISOString(),
                },
              });
              results.push({ 
                id: prospectId, 
                success: false, 
                error: enrichError instanceof Error ? enrichError.message : 'Enrichment failed' 
              });
              failureCount++;
            }
          } catch (error) {
            results.push({ 
              id: prospectId, 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
            failureCount++;
          }
        }

        res.json({ 
          direct: true,
          results,
          total: prospectIds.length,
          successCount,
          failureCount,
          message: `Enrichment completed: ${successCount} successful, ${failureCount} failed`
        });
      }
    } catch (error) {
      console.error("Enrichment error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to start enrichment" 
      });
    }
  });

  // Lusha email enrichment
  app.post("/api/lusha-enrich", async (req, res) => {
    try {
      const { prospectIds } = z.object({ 
        prospectIds: z.array(z.string()).min(1) 
      }).parse(req.body);

      if (!lushaService.isConfigured()) {
        return res.json({ 
          results: [],
          total: 0,
          enriched: 0,
          configured: false,
          error: "Lusha API key not configured. Please set LUSHA_API_KEY environment variable to enable email enrichment."
        });
      }

      const results = [];
      
      for (const prospectId of prospectIds) {
        const prospect = await storage.getProspect(prospectId);
        
        if (!prospect) {
          results.push({ id: prospectId, success: false, error: "Prospect not found" });
          continue;
        }

        // Only enrich if email is locked or missing
        if (prospect.primaryEmail && !lushaService.isEmailLocked(prospect.primaryEmail)) {
          results.push({ 
            id: prospectId, 
            success: false, 
            error: "Email already available",
            skipped: true 
          });
          continue;
        }

        // Call Lusha API
        const lushaData = await lushaService.enrichPerson({
          fullName: prospect.fullName || undefined,
          company: prospect.companyName || undefined,
          linkedinUrl: prospect.linkedinUrl || undefined,
        });

        if (!lushaData) {
          results.push({ 
            id: prospectId, 
            success: false, 
            error: "Lusha enrichment failed" 
          });
          continue;
        }

        // Extract email and phone
        const email = lushaService.getBestEmail(lushaData);
        const phone = lushaService.getBestPhone(lushaData);

        // Update prospect
        const updates: any = {
          enrichmentStatus: 'enriched' as const,
          enrichmentData: {
            ...(prospect.enrichmentData || {}),
            lusha: lushaData,
            lushaEnrichedAt: new Date().toISOString(),
          }
        };

        if (email) {
          updates.primaryEmail = email;
        }
        if (phone && !prospect.phoneNumber) {
          updates.phoneNumber = phone;
        }

        const updated = await storage.updateProspect(prospectId, updates);
        results.push({ 
          id: prospectId, 
          success: true, 
          emailFound: !!email,
          phoneFound: !!phone,
          prospect: updated
        });
      }

      res.json({ 
        results,
        total: results.length,
        enriched: results.filter(r => r.emailFound).length,
        configured: lushaService.isConfigured()
      });
    } catch (error) {
      console.error("Lusha enrichment error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Lusha enrichment failed" 
      });
    }
  });

  // Apollo bulk enrichment
  app.post("/api/apollo-bulk-enrich", async (req, res) => {
    try {
      const { prospectIds } = z.object({ 
        prospectIds: z.array(z.string()).min(1) 
      }).parse(req.body);

      // Fetch prospects from database
      const prospects = [];
      for (const id of prospectIds) {
        const prospect = await storage.getProspect(id);
        if (prospect) {
          prospects.push(prospect);
        }
      }

      if (prospects.length === 0) {
        return res.status(400).json({ error: "No valid prospects found" });
      }

      // Prepare contacts for Apollo bulk match
      const contacts = prospects.map(p => ({
        email: p.primaryEmail || undefined,
        first_name: p.firstName || undefined,
        last_name: p.lastName || undefined,
        organization_name: p.companyName || undefined,
        linkedin_url: p.linkedinUrl || undefined,
      })).filter(c => c.email || c.linkedin_url); // Need at least email or LinkedIn

      if (contacts.length === 0) {
        return res.status(400).json({ 
          error: "No prospects with email or LinkedIn URL found" 
        });
      }

      // Call Apollo bulk match API
      const bulkResult = await apolloService.bulkEnrichContacts(contacts);

      // Update prospects with enriched data
      const results = [];
      for (let i = 0; i < bulkResult.matches.length; i++) {
        const match = bulkResult.matches[i];
        const prospect = prospects[i];
        
        if (!prospect) continue;

        const enrichedData = apolloService.convertApolloContactToProspect(match);
        
        const updated = await storage.updateProspect(prospect.id, {
          ...enrichedData,
          enrichmentStatus: 'enriched' as const,
          enrichmentData: {
            ...(prospect.enrichmentData || {}),
            apollo: match,
            apolloEnrichedAt: new Date().toISOString(),
          }
        });

        results.push({
          id: prospect.id,
          success: true,
          prospect: updated,
        });
      }

      res.json({
        results,
        total: bulkResult.totalRequested,
        enriched: bulkResult.uniqueEnriched,
        missing: bulkResult.missingRecords,
        creditsConsumed: bulkResult.creditsConsumed,
      });
    } catch (error) {
      console.error("Apollo bulk enrichment error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Apollo bulk enrichment failed" 
      });
    }
  });

  // CSV upload and import
  app.post("/api/import/csv", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { fieldMappings, skipDuplicates = "true", autoEnrich = "false" } = req.body;
      
      const parsedFieldMappings = JSON.parse(fieldMappings || "{}");
      const options = {
        skipDuplicates: skipDuplicates === "true",
        autoEnrich: autoEnrich === "true",
      };

      // Check if Redis/job queue is available
      const REDIS_ENABLED = !!process.env.REDIS_URL;
      
      if (REDIS_ENABLED) {
        // Use background job queue
        const job = await jobService.createImportJob(
          req.file.path,
          parsedFieldMappings,
          options
        );
        res.json({ job });
      } else {
        // Process synchronously without Redis
        console.log('\n========== SYNCHRONOUS CSV IMPORT (No Redis) ==========');
        const fileContent = readFileSync(req.file.path, 'utf-8');
        const records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
          relax_column_count: true,
          skip_records_with_error: true,
          bom: true,
        });

        let successCount = 0;
        let failureCount = 0;
        let duplicateCount = 0;
        const errors: string[] = [];

        console.log(`  Processing ${records.length} rows...`);

        for (let i = 0; i < records.length; i++) {
          const row = records[i];
          
          try {
            // Map CSV row to prospect format
            const prospectData: any = {};
            for (const [csvCol, prospectField] of Object.entries(parsedFieldMappings)) {
              if (row[csvCol]) {
                prospectData[prospectField] = row[csvCol];
              }
            }

            // Check for duplicates if enabled
            if (options.skipDuplicates && prospectData.primaryEmail) {
              const duplicates = await storage.checkDuplicateProspects([prospectData.primaryEmail]);
              if (duplicates.length > 0) {
                duplicateCount++;
                continue;
              }
            }

            // Create prospect
            await storage.createProspect(prospectData);
            successCount++;

            // Note: Auto-enrich requires Redis, so we skip it in sync mode
            if (options.autoEnrich) {
              console.log('  Note: Auto-enrich skipped (requires Redis)');
            }
          } catch (error) {
            failureCount++;
            errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        console.log('\n========== IMPORT COMPLETE ==========');
        console.log(`  Success: ${successCount}`);
        console.log(`  Duplicates: ${duplicateCount}`);
        console.log(`  Failed: ${failureCount}`);
        console.log('=========================================\n');

        // Invalidate prospects cache
        res.json({
          success: true,
          imported: successCount,
          failed: failureCount,
          duplicates: duplicateCount,
          errors: errors.slice(0, 10), // Return first 10 errors
          message: `Imported ${successCount} prospects successfully${failureCount > 0 ? ` (${failureCount} failed)` : ''}`
        });
      }
    } catch (error) {
      console.error("CSV import error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to start import" 
      });
    }
  });

  // Validate CSV data (for field mapping preview)
  app.post("/api/import/validate-csv", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Parse CSV file with enhanced leniency
      const fileContent = readFileSync(req.file.path, 'utf-8');
      const skippedRows: number[] = [];
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
            skippedRows.push(context.lines);
            return null;
          }
        }
      }).filter((r: any) => r !== null);

      const validRows = records.length;
      const totalRows = validRows + skippedRows.length;
      const columns: { name: string; samples: string[] }[] = [];
      const suggestedMappings: Record<string, string> = {};

      // Get column names and sample data
      if (records.length > 0) {
        const columnNames = Object.keys(records[0] as Record<string, any>);
        
        for (const colName of columnNames) {
          const samples = records
            .slice(0, 3)
            .map((row: any) => row[colName])
            .filter((val: any) => val && val.trim());

          columns.push({
            name: colName,
            samples
          });

          // Auto-map common column names
          const lowerCol = colName.toLowerCase().replace(/[^a-z]/g, '');
          if (lowerCol.includes('first') && lowerCol.includes('name')) suggestedMappings[colName] = 'firstName';
          else if (lowerCol.includes('last') && lowerCol.includes('name')) suggestedMappings[colName] = 'lastName';
          else if (lowerCol.includes('email')) suggestedMappings[colName] = 'primaryEmail';
          else if (lowerCol.includes('title') || lowerCol.includes('job')) suggestedMappings[colName] = 'jobTitle';
          else if (lowerCol.includes('company') || lowerCol.includes('organization')) suggestedMappings[colName] = 'companyName';
          else if (lowerCol.includes('phone')) suggestedMappings[colName] = 'phoneNumber';
          else if (lowerCol.includes('linkedin')) suggestedMappings[colName] = 'linkedinUrl';
        }
      }

      const validation = {
        totalRows,
        validRows,
        duplicateRows: 0,
        errorRows: skippedRows.length,
        skippedRows,
        columns,
        suggestedMappings
      };

      res.json(validation);
    } catch (error) {
      console.error("CSV validation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to validate CSV" 
      });
    }
  });

  // Get jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const { status, limit = "20" } = req.query;
      const jobs = await storage.getJobs(status as string, parseInt(limit as string));
      res.json(jobs);
    } catch (error) {
      console.error("Get jobs error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get jobs" 
      });
    }
  });

  // Get active jobs
  app.get("/api/jobs/active", async (req, res) => {
    try {
      const jobs = await storage.getActiveJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Get active jobs error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get active jobs" 
      });
    }
  });

  // Get job status
  app.get("/api/jobs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const job = await storage.getJob(id);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Get job error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get job" 
      });
    }
  });

  // Cancel job
  app.post("/api/jobs/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      await jobService.cancelJob(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Cancel job error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to cancel job" 
      });
    }
  });

  // Get searches
  app.get("/api/searches", async (req, res) => {
    try {
      const { limit = "20" } = req.query;
      const searches = await storage.getSearches(parseInt(limit as string));
      res.json(searches);
    } catch (error) {
      console.error("Get searches error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get searches" 
      });
    }
  });

  // Sequence module routes
  app.use("/api", sequenceRoutes);

  // Mailbox module routes
  app.use("/api", mailboxRoutes);

  // Intelligent Personalization - Deep AI prospect analysis
  app.post("/api/personalization/analyze", async (req, res) => {
    try {
      const { prospectId, includeWebScraping = false } = req.body;
      
      const prospect = await storage.getProspect(prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      // Get AI analysis from intelligent personalization service
      const insights = await intelligentPersonalizationService.analyzeProspect(prospectId);

      // Transform to match frontend expectations
      const personalizationFactorValues = insights.personalizationFactors.map(f => f.relevance);
      const avgRelevance = personalizationFactorValues.reduce((a, b) => a + b, 0) / personalizationFactorValues.length;

      const analysis = {
        personalizationScore: Math.round(avgRelevance),
        keyInsights: insights.personalizationFactors.map(f => f.insight),
        recommendedApproach: `${insights.recommendations.approach} - ${insights.recommendations.keyMessages.join('. ')}`,
        personalizationFactors: {
          roleRelevance: insights.personalizationFactors.find(f => f.source.includes('Role'))?.relevance || 75,
          companyFit: insights.personalizationFactors.find(f => f.source.includes('Company'))?.relevance || 75,
          timingScore: 80,
          painPointAlignment: insights.roleInsights.painPoints.length > 0 ? 85 : 70,
        },
        companyInsights: insights.companyInsights,
        roleInsights: insights.roleInsights,
      };

      // Save personalization result
      await storage.createPersonalizationResult({
        prospectId,
        personalizationScore: analysis.personalizationScore,
        insights: {
          keyInsights: analysis.keyInsights,
          recommendedApproach: analysis.recommendedApproach,
          personalizationFactors: analysis.personalizationFactors,
          companyInsights: analysis.companyInsights,
          roleInsights: analysis.roleInsights
        }
      });

      res.json(analysis);
    } catch (error) {
      console.error("Personalization analysis error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Personalization analysis failed" 
      });
    }
  });

  // Advanced AI analysis - Enhanced version with scoring and variables
  app.post("/api/personalization/advanced-analyze", async (req, res) => {
    try {
      const { prospectId } = req.body;
      
      const prospect = await storage.getProspect(prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      // Get comprehensive AI analysis
      const insights = await intelligentPersonalizationService.analyzeProspect(prospectId);

      // Calculate personalization score
      const personalizationFactorValues = insights.personalizationFactors.map(f => f.relevance);
      const avgRelevance = personalizationFactorValues.reduce((a, b) => a + b, 0) / personalizationFactorValues.length;
      const personalizationScore = Math.round(avgRelevance);

      // Generate personalization variables from insights
      const variables = [
        {
          name: 'prospect_name',
          value: prospect.fullName || `${prospect.firstName} ${prospect.lastName}`,
          confidence: 100,
          source: 'Database'
        },
        {
          name: 'company_name',
          value: prospect.companyName || insights.companyInsights?.industry || 'Company',
          confidence: 95,
          source: 'Database'
        },
        {
          name: 'job_title',
          value: prospect.jobTitle || 'Professional',
          confidence: 100,
          source: 'Database'
        },
        {
          name: 'industry',
          value: insights.companyInsights?.industry || 'Technology',
          confidence: 85,
          source: 'AI Analysis'
        },
        {
          name: 'company_size',
          value: insights.companyInsights?.size || 'Mid-size',
          confidence: 80,
          source: 'AI Analysis'
        },
        ...insights.personalizationFactors.map((factor, index) => ({
          name: `insight_${index + 1}`,
          value: factor.insight,
          confidence: factor.relevance,
          source: factor.source
        }))
      ];

      // Generate email suggestions
      const emailSuggestions = {
        subject: `${prospect.firstName}, ${insights.recommendations.keyMessages[0] || 'I have an idea for your team'}`,
        opening: `Hi ${prospect.firstName},\n\nI noticed ${insights.companyInsights?.recentNews?.[0] || `you're working in ${insights.companyInsights?.industry || 'your industry'}`}...`
      };

      // Generate content recommendations
      const contentRecommendations = insights.recommendations.keyMessages.map((message, index) => ({
        name: `Talking Point ${index + 1}`,
        usage: message,
        relevanceScore: 85 - (index * 5)
      }));

      // Build advanced analysis response
      const analysis = {
        personalizationScore,
        variables,
        emailSuggestions,
        contentRecommendations,
        insights: {
          roleAnalysis: {
            seniority: insights.roleInsights?.decisionMakingPower === 'High' ? 90 : 70,
            decisionAuthority: insights.roleInsights?.decisionMakingPower === 'High' ? 85 : 65
          },
          painPoints: insights.roleInsights?.painPoints || []
        }
      };

      res.json(analysis);
    } catch (error) {
      console.error("Advanced personalization analysis error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Advanced analysis failed" 
      });
    }
  });

  // Generate personalized email with AI
  app.post("/api/personalization/generate-email", async (req, res) => {
    try {
      const { prospectId, personalizationData, settings, customPrompt, useAdvanced, contentItemIds } = req.body;
      
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ 
          error: "OpenAI API key not configured. Please set OPENAI_API_KEY in environment variables." 
        });
      }

      const prospect = await storage.getProspect(prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      // Build context for AI email generation
      const context = {
        prospectName: prospect.fullName || `${prospect.firstName} ${prospect.lastName}`,
        companyName: prospect.companyName || '',
        jobTitle: prospect.jobTitle || '',
        industry: personalizationData?.companyInsights?.industry || personalizationData?.insights?.industry || '',
        insights: useAdvanced 
          ? personalizationData?.variables?.slice(0, 5).map((v: any) => v.value).join('; ')
          : personalizationData?.keyInsights?.join('; ') || '',
        tone: settings?.tone || 'professional',
        focus: settings?.focus || 'value_proposition',
        urgency: settings?.urgency || 'medium',
        length: settings?.length || 'medium'
      };

      // Fetch content items if provided
      let contentContext = '';
      if (contentItemIds && contentItemIds.length > 0) {
        const allContentItems = await storage.getContentLibraryItems();
        const selectedContent = allContentItems.filter(item => contentItemIds.includes(item.id));
        
        if (selectedContent.length > 0) {
          contentContext = '\n\nREFERENCE CONTENT (use this to enhance your email):\n' + 
            selectedContent.map((item, index) => {
              return `${index + 1}. ${item.title} (${item.type})
${item.description ? `   Description: ${item.description}` : ''}
   Content: ${item.content}`;
            }).join('\n\n');
        }
      }

      // Generate email using AI service
      const prompt = `You are an expert sales email writer. Generate a personalized sales email following this EXACT structure and constraints:

PROSPECT INFORMATION:
- Name: ${context.prospectName}
- Title: ${context.jobTitle}
- Company: ${context.companyName}
- Industry: ${context.industry}
- Key Insights: ${context.insights}

EMAIL SETTINGS:
- Tone: ${context.tone}
- Focus: ${context.focus}
- Urgency: ${context.urgency}${contentContext}
${customPrompt ? `\nADDITIONAL INSTRUCTIONS:\n${customPrompt}` : ''}

MANDATORY EMAIL STRUCTURE:
1. Subject: Make it specific to their business challenge
2. Opening: Reference ONE concrete detail about their company or role (no generic praise)
3. Problem: State the pain point directly in 1-2 sentences
4. Solution: Explain what you offer in one sentence
5. Value: One specific, quantifiable benefit
6. CTA: Single clear next step with low commitment

STRICT CONSTRAINTS:
- MAXIMUM 80 words for the email body (count carefully!)
- NO adjectives like "leading," "innovative," "excited," "thrilled," "delighted"
- NO phrases like "I hope this email finds you well"
- NO phrases like "I was impressed by"
- Use "you" more than "we" (second-person focus)
- END with a QUESTION, not a statement
- Be direct and conversational
- No fluff or filler words

Format your response EXACTLY as:
Subject: [Your subject line here]

[Your email body here - MUST be under 80 words and end with a question]`;

      const aiResponse = await aiService.generateText(prompt, 1500);
      
      // Parse AI response (simple split approach)
      const lines = aiResponse.split('\n');
      let subject = '';
      let body = '';
      let isBody = false;
      
      for (const line of lines) {
        if (line.toLowerCase().includes('subject:')) {
          subject = line.replace(/subject:/i, '').trim();
        } else if (line.toLowerCase().includes('body:') || line.toLowerCase().includes('email:')) {
          isBody = true;
        } else if (isBody && line.trim()) {
          body += line + '\n';
        } else if (subject && !isBody && line.trim()) {
          // Start body after subject if we haven't found explicit "Body:" marker
          isBody = true;
          body += line + '\n';
        }
      }

      // If parsing fails, use the whole response as body
      if (!body) {
        body = aiResponse;
        subject = `Quick question for ${prospect.firstName}`;
      }

      const generatedEmail = {
        subject: subject || `${prospect.firstName}, quick question`,
        body: body.trim(),
        personalizationScore: personalizationData?.personalizationScore || 85
      };

      res.json(generatedEmail);
    } catch (error) {
      console.error("Email generation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate personalized email" 
      });
    }
  });

  // Company enrichment via web scraping
  app.post("/api/personalization/company-enrichment", async (req, res) => {
    try {
      const { companyWebsite } = req.body;
      
      if (!companyWebsite) {
        return res.status(400).json({ error: "Company website required" });
      }

      const companyData = await webScrapingService.scrapeCompanyWebsite(companyWebsite);
      res.json(companyData);
    } catch (error) {
      console.error("Company enrichment error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Company enrichment failed" 
      });
    }
  });

  // Apollo company search
  app.post("/api/apollo/company-search", async (req, res) => {
    try {
      const { query, filters = {} } = req.body;
      
      const companies = await apolloService.searchContacts({
        q_keywords: query,
        ...filters,
        per_page: 20
      });

      res.json({
        companies: companies.people || companies.contacts || [],
        pagination: companies.pagination
      });
    } catch (error) {
      console.error("Company search error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Company search failed" 
      });
    }
  });

  // Enhanced enrichment with automatic Lusha fallback
  app.post("/api/prospects/enrich-with-fallback", async (req, res) => {
    try {
      const { prospectId } = req.body;
      
      const prospect = await storage.getProspect(prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      const enrichmentResult = await apolloService.enrichWithAutoFallback({
        email: prospect.primaryEmail || undefined,
        first_name: prospect.firstName || undefined,
        last_name: prospect.lastName || undefined,
        organization_name: prospect.companyName || undefined,
        linkedin_url: prospect.linkedinUrl || undefined
      });

      if (enrichmentResult.contact) {
        const updatedProspect = apolloService.convertApolloContactToProspect(enrichmentResult.contact);
        await storage.updateProspect(prospectId, updatedProspect);
      }

      res.json({
        success: !!enrichmentResult.contact,
        source: enrichmentResult.source,
        email: enrichmentResult.enrichedEmail,
        prospect: enrichmentResult.contact ? 
          apolloService.convertApolloContactToProspect(enrichmentResult.contact) : null
      });
    } catch (error) {
      console.error("Enhanced enrichment error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Enhanced enrichment failed" 
      });
    }
  });

  // Content Library - Get all items
  app.get("/api/content-library", async (req, res) => {
    try {
      const items = await contentManagementService.getContentLibraryItems();
      res.json(items);
    } catch (error) {
      console.error("Get content library error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get content library" 
      });
    }
  });

  // Content Library - Get templates
  app.get("/api/content-library/templates", async (req, res) => {
    try {
      const { category } = req.query;
      const templates = category 
        ? contentManagementService.getTemplatesByCategory(category as any)
        : contentManagementService.getAllTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get templates error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get templates" 
      });
    }
  });

  // Content Library - Create item
  app.post("/api/content-library", async (req, res) => {
    try {
      const item = await contentManagementService.addContentItem(req.body);
      res.json(item);
    } catch (error) {
      console.error("Create content item error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to create content item" 
      });
    }
  });

  // Content Library - Update item
  app.put("/api/content-library/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const item = await contentManagementService.updateContentItem(id, req.body);
      res.json(item);
    } catch (error) {
      console.error("Update content item error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to update content item" 
      });
    }
  });

  // Content Library - Delete item
  app.delete("/api/content-library/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await contentManagementService.deleteContentItem(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete content item error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to delete content item" 
      });
    }
  });

  // Generate email from template
  app.post("/api/content-library/generate-email", async (req, res) => {
    try {
      const { templateId, prospectId, customVariables } = req.body;
      
      const prospect = await storage.getProspect(prospectId);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect not found" });
      }

      const email = contentManagementService.generateEmailFromTemplate(
        templateId,
        {
          name: prospect.fullName || `${prospect.firstName} ${prospect.lastName}`,
          company: prospect.companyName || '',
          industry: prospect.companyIndustry || '',
          position: prospect.jobTitle || ''
        },
        customVariables
      );

      if (!email) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json(email);
    } catch (error) {
      console.error("Generate email error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate email" 
      });
    }
  });

  // AI Email Template Generator - Generate template from content library
  app.post("/api/content-library/ai-generate-template", async (req, res) => {
    try {
      const { prompt, contentItemIds, settings } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      if (!contentItemIds || contentItemIds.length === 0) {
        return res.status(400).json({ error: "At least one content item must be selected" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ 
          error: "OpenAI API key not configured. Please configure OPENAI_API_KEY in environment variables." 
        });
      }

      // Fetch selected content items
      const allContentItems = await storage.getContentLibraryItems();
      const selectedContent = allContentItems.filter(item => contentItemIds.includes(item.id));

      if (selectedContent.length === 0) {
        return res.status(404).json({ error: "No content items found with the provided IDs" });
      }

      // Build content context for AI
      const contentContext = selectedContent.map((item, index) => {
        return `Content Item ${index + 1}: ${item.title} (${item.type})
${item.description ? `Description: ${item.description}` : ''}
Content: ${item.content}
${item.industry ? `Industry: ${item.industry}` : ''}
${item.useCase ? `Use Case: ${item.useCase}` : ''}`;
      }).join('\n\n---\n\n');

      const tone = settings?.tone || 'professional';
      const length = settings?.length || 'medium';
      const cta = settings?.callToAction || 'schedule a call';

      // Generate template using OpenAI
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const aiPrompt = `You are an expert email template creator. Generate a reusable email template based on the following:

USER REQUEST:
${prompt}

TEMPLATE SETTINGS:
- Tone: ${tone}
- Length: ${length}
- Call-to-Action: ${cta}

AVAILABLE CONTENT (USE ONLY THIS DATA):
${contentContext}

REQUIREMENTS:
1. Create a compelling subject line
2. Write email content using ONLY the provided content items above
3. Use the specified tone: ${tone}
4. Target length: ${length === 'short' ? '50-100 words' : length === 'medium' ? '100-200 words' : '200-300 words'}
5. Include the call-to-action: ${cta}
6. Make the template reusable (use placeholders like {{company_name}}, {{prospect_name}} where appropriate)
7. Focus on the benefits, case studies, and value propositions from the content
8. DO NOT invent information - use only what's provided in the content items

Respond in JSON format:
{
  "subject": "Email subject line",
  "content": "Complete email template with placeholders",
  "variables": ["list", "of", "variables", "used"],
  "reasoning": "Brief explanation of approach"
}`;

      console.log('Generating AI email template with', selectedContent.length, 'content items');

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert email template creator who generates high-quality, reusable email templates based strictly on provided content. Always respond with valid JSON."
          },
          {
            role: "user",
            content: aiPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1500
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      // Harden response parsing with fallbacks
      const subject = result.subject || 'Quick question about your business';
      const content = result.content || 'Email content generation failed. Please try again.';
      const variables = Array.isArray(result.variables) ? result.variables : [];
      const reasoning = result.reasoning || 'Template generated from selected content';

      res.json({
        subject,
        content,
        variables,
        reasoning,
        contentItemsUsed: selectedContent.map(item => ({ id: item.id, title: item.title }))
      });

    } catch (error) {
      console.error("AI template generation error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to generate AI email template" 
      });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const httpServer = createServer(app);
  return httpServer;
}

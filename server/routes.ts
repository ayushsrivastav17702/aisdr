import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { aiService } from "./services/ai.service";
import { apolloService } from "./services/apollo.service";
import { jobService } from "./services/job.service";
import { 
  aiSearchSchema, 
  enrichmentRequestSchema, 
  csvImportSchema,
  insertProspectSchema 
} from "@shared/schema";
import multer from "multer";
import { z } from "zod";

const upload = multer({ dest: 'uploads/' });

export async function registerRoutes(app: Express): Promise<Server> {
  
  // AI Search endpoint
  app.post("/api/ai-search", async (req, res) => {
    try {
      const { query } = aiSearchSchema.parse(req.body);
      
      // Parse natural language query
      const { aiFilters, apolloFilters } = await aiService.parseNaturalLanguageQuery(query);
      
      // Save search record
      const search = await storage.createSearch({
        query,
        aiFilters,
        apolloFilters,
      });

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

      // Convert contacts to prospect format
      const prospects = searchResponse.contacts.map(contact => 
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

  // Enrich prospects
  app.post("/api/enrich", async (req, res) => {
    try {
      const { prospectIds } = enrichmentRequestSchema.parse(req.body);
      
      const job = await jobService.createEnrichmentJob(prospectIds);
      
      res.json({ job });
    } catch (error) {
      console.error("Enrichment error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to start enrichment" 
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

      const job = await jobService.createImportJob(
        req.file.path,
        parsedFieldMappings,
        options
      );

      res.json({ job });
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

      // This would parse the CSV and return sample data and detected fields
      // For now, return mock validation results
      const validation = {
        totalRows: 234,
        validRows: 221,
        duplicateRows: 8,
        errorRows: 5,
        columns: [
          { name: "First Name", samples: ["Sarah", "James", "Emily"] },
          { name: "Last Name", samples: ["Mitchell", "Chen", "Parker"] },
          { name: "Email Address", samples: ["sarah@fintech.io", "j.chen@crypto.com"] },
          { name: "Job Title", samples: ["CTO", "VP Engineering"] },
          { name: "Company", samples: ["FinTech Solutions", "CryptoPay Inc"] },
        ],
        suggestedMappings: {
          "First Name": "firstName",
          "Last Name": "lastName", 
          "Email Address": "primaryEmail",
          "Job Title": "jobTitle",
          "Company": "companyName"
        }
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

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const httpServer = createServer(app);
  return httpServer;
}

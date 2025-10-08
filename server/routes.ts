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
      const { query } = aiSearchSchema.parse(req.body);
      
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
      
      console.log('Apollo Search Request:');
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
      
      console.log('Apollo Search Response:');
      console.log('  Total Entries:', searchResponse.pagination?.total_entries || 0);
      console.log('  Contacts Returned:', contacts.length);
      const savedProspects = [];
      
      for (const contact of contacts) {
        const prospectData = apolloService.convertApolloContactToProspect(contact);
        
        // Check if prospect already exists (by email or apollo_id)
        const existing = await storage.findProspectByEmailOrApolloId(
          prospectData.primaryEmail,
          prospectData.apolloId
        );

        if (existing) {
          // Update existing prospect with new data
          const updated = await storage.updateProspect(existing.id, prospectData);
          savedProspects.push(updated);
        } else {
          // Create new prospect
          const created = await storage.createProspect(prospectData);
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

      // Parse CSV file
      const fileContent = readFileSync(req.file.path, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const totalRows = records.length;
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
        validRows: totalRows,
        duplicateRows: 0,
        errorRows: 0,
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
      const { prospectId, personalizationData, settings, customPrompt, useAdvanced } = req.body;
      
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

      // Generate email using AI service
      const prompt = `Generate a personalized sales email with the following context:
- Prospect: ${context.prospectName}, ${context.jobTitle} at ${context.companyName}
- Industry: ${context.industry}
- Key Insights: ${context.insights}
- Tone: ${context.tone}
- Focus: ${context.focus}
- Urgency: ${context.urgency}
- Length: ${context.length}
${customPrompt ? `\nAdditional Instructions: ${customPrompt}` : ''}

Generate a subject line and email body that is highly personalized and relevant.`;

      const aiResponse = await aiService.generateText(prompt);
      
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
        error: error instanceof Error ? error.message : "Email generation failed" 
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

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  const httpServer = createServer(app);
  return httpServer;
}

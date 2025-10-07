import { apiRequest } from "./queryClient";

export interface ProspectFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ProspectsResponse {
  prospects: any[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JobResponse {
  id: string;
  type: string;
  status: string;
  title: string;
  description?: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  partialCount: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export const api = {
  // AI Search
  async aiSearch(query: string) {
    const response = await apiRequest("POST", "/api/ai-search", { query });
    return response.json();
  },

  // Prospects
  async getProspects(filters: ProspectFilters = {}): Promise<ProspectsResponse> {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.page) params.set("page", filters.page.toString());
    if (filters.limit) params.set("limit", filters.limit.toString());

    const response = await apiRequest("GET", `/api/prospects?${params}`);
    return response.json();
  },

  async getProspect(id: string) {
    const response = await apiRequest("GET", `/api/prospects/${id}`);
    return response.json();
  },

  async createProspect(prospect: any) {
    const response = await apiRequest("POST", "/api/prospects", prospect);
    return response.json();
  },

  async updateProspect(id: string, updates: any) {
    const response = await apiRequest("PATCH", `/api/prospects/${id}`, updates);
    return response.json();
  },

  async deleteProspect(id: string) {
    const response = await apiRequest("DELETE", `/api/prospects/${id}`);
    return response.json();
  },

  // Enrichment
  async enrichProspects(prospectIds: string[]) {
    const response = await apiRequest("POST", "/api/enrich", { prospectIds });
    return response.json();
  },

  // Import
  async uploadCSV(file: File, fieldMappings: Record<string, string>, options: {
    skipDuplicates?: boolean;
    autoEnrich?: boolean;
  } = {}) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fieldMappings", JSON.stringify(fieldMappings));
    formData.append("skipDuplicates", options.skipDuplicates ? "true" : "false");
    formData.append("autoEnrich", options.autoEnrich ? "true" : "false");

    const response = await fetch("/api/import/csv", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Upload failed: ${error}`);
    }

    return response.json();
  },

  async validateCSV(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/import/validate-csv", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Validation failed: ${error}`);
    }

    return response.json();
  },

  // Jobs
  async getJobs(status?: string): Promise<JobResponse[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);

    const response = await apiRequest("GET", `/api/jobs?${params}`);
    return response.json();
  },

  async getActiveJobs(): Promise<JobResponse[]> {
    const response = await apiRequest("GET", "/api/jobs/active");
    return response.json();
  },

  async getJob(id: string): Promise<JobResponse> {
    const response = await apiRequest("GET", `/api/jobs/${id}`);
    return response.json();
  },

  async cancelJob(id: string) {
    const response = await apiRequest("POST", `/api/jobs/${id}/cancel`);
    return response.json();
  },

  // Searches
  async getSearches() {
    const response = await apiRequest("GET", "/api/searches");
    return response.json();
  },
};

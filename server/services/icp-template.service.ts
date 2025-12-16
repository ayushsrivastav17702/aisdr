import { db } from "../db";
import { icpTemplates, type IcpTemplate, type ICPConfig } from "../../shared/schema";
import { eq } from "drizzle-orm";

const DEFAULT_TEMPLATES: Array<Omit<IcpTemplate, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    userId: null,
    name: "SaaS Sales Leaders",
    description: "Target sales leaders at SaaS companies for sales enablement tools",
    isDefault: true,
    config: {
      jobTitles: [
        "VP Sales", "VP of Sales", "Chief Revenue Officer", "CRO",
        "Sales Director", "Director of Sales", "Head of Sales",
        "Sales Manager", "Senior Sales Manager"
      ],
      seniority: ["VP", "C-Level", "Director", "Manager"],
      departments: ["Sales", "Revenue", "Business Development"],
      industries: ["SaaS", "Software", "Technology", "Cloud Computing"],
      companySize: {
        ranges: ["51-200", "201-500", "501-1000", "1001-5000"]
      },
      locations: ["United States", "Canada", "United Kingdom"],
      keywords: ["SaaS", "sales", "revenue", "B2B"]
    } as ICPConfig
  },
  {
    userId: null,
    name: "Enterprise Tech Buyers",
    description: "Target technology decision-makers at enterprise companies",
    isDefault: true,
    config: {
      jobTitles: [
        "CTO", "Chief Technology Officer", "VP Engineering", "VP of Engineering",
        "Engineering Director", "Director of Engineering", "Head of Engineering",
        "Chief Information Officer", "CIO", "VP IT", "IT Director"
      ],
      seniority: ["C-Level", "VP", "Director"],
      departments: ["Engineering", "Technology", "IT", "Infrastructure"],
      industries: ["Technology", "Software", "Enterprise Software", "Cloud"],
      companySize: {
        ranges: ["501-1000", "1001-5000", "5001-10000", "10000+"]
      },
      revenueRange: {
        min: 10000000,
        max: 1000000000
      },
      technologies: ["AWS", "Azure", "GCP", "Kubernetes", "Docker"],
      keywords: ["enterprise", "technology", "cloud", "infrastructure"]
    } as ICPConfig
  },
  {
    userId: null,
    name: "E-commerce Operations",
    description: "Target e-commerce operations leaders for logistics and fulfillment solutions",
    isDefault: true,
    config: {
      jobTitles: [
        "VP Operations", "VP of Operations", "COO", "Chief Operating Officer",
        "Operations Director", "Director of Operations", "Head of Operations",
        "E-commerce Director", "Director of E-commerce", "VP E-commerce"
      ],
      seniority: ["C-Level", "VP", "Director"],
      departments: ["Operations", "E-commerce", "Logistics", "Supply Chain"],
      industries: ["E-commerce", "Retail", "Consumer Goods", "Fashion"],
      companySize: {
        ranges: ["201-500", "501-1000", "1001-5000"]
      },
      keywords: ["e-commerce", "operations", "fulfillment", "logistics"]
    } as ICPConfig
  },
  {
    userId: null,
    name: "Retail Merchandising",
    description: "Target merchandising professionals at retail and fashion brands (Increff ICP)",
    isDefault: true,
    config: {
      jobTitles: [
        "Merchandising Manager", "Senior Merchandising Manager",
        "VP Merchandising", "VP of Merchandising", "Chief Merchandising Officer",
        "Director of Merchandising", "Merchandising Director",
        "Visual Merchandiser", "Product Merchandiser",
        "Buying Manager", "Buyer", "Senior Buyer",
        "Inventory Manager", "Inventory Planner"
      ],
      seniority: ["VP", "Director", "Manager", "Senior"],
      departments: ["Merchandising", "Buying", "Planning", "Inventory"],
      industries: [
        "Retail", "Fashion", "Apparel", "Sportswear",
        "Footwear", "Accessories", "Lifestyle", "E-commerce"
      ],
      companySize: {
        ranges: ["51-200", "201-500", "501-1000", "1001-5000"]
      },
      locations: ["United States", "United Kingdom", "India", "Europe"],
      keywords: ["merchandising", "retail", "fashion", "inventory", "assortment", "planning"]
    } as ICPConfig
  },
  {
    userId: null,
    name: "Marketing Leaders",
    description: "Target marketing leaders for martech and analytics solutions",
    isDefault: true,
    config: {
      jobTitles: [
        "CMO", "Chief Marketing Officer", "VP Marketing", "VP of Marketing",
        "Marketing Director", "Director of Marketing", "Head of Marketing",
        "VP Growth", "Director of Growth", "Growth Marketing Manager"
      ],
      seniority: ["C-Level", "VP", "Director", "Manager"],
      departments: ["Marketing", "Growth", "Demand Generation", "Digital Marketing"],
      industries: ["SaaS", "Technology", "E-commerce", "B2B Services"],
      companySize: {
        ranges: ["51-200", "201-500", "501-1000"]
      },
      keywords: ["marketing", "growth", "demand gen", "digital marketing"]
    } as ICPConfig
  },
  {
    userId: null,
    name: "Financial Services",
    description: "Target financial decision-makers for fintech and finance solutions",
    isDefault: true,
    config: {
      jobTitles: [
        "CFO", "Chief Financial Officer", "VP Finance", "VP of Finance",
        "Finance Director", "Director of Finance", "Controller",
        "Treasurer", "VP Accounting", "Accounting Manager"
      ],
      seniority: ["C-Level", "VP", "Director", "Manager"],
      departments: ["Finance", "Accounting", "Treasury", "FP&A"],
      industries: ["Fintech", "Banking", "Financial Services", "Insurance", "Technology"],
      companySize: {
        ranges: ["201-500", "501-1000", "1001-5000", "5001-10000"]
      },
      keywords: ["finance", "accounting", "financial services", "fintech"]
    } as ICPConfig
  }
];

class IcpTemplateService {
  async initializeDefaultTemplates(): Promise<void> {
    for (const template of DEFAULT_TEMPLATES) {
      const existing = await db.query.icpTemplates.findFirst({
        where: eq(icpTemplates.name, template.name)
      });

      if (!existing) {
        await db.insert(icpTemplates).values(template);
        console.log(`✅ Created default ICP template: ${template.name}`);
      }
    }
  }

  async getAllTemplates(): Promise<IcpTemplate[]> {
    return await db.select().from(icpTemplates);
  }

  async getDefaultTemplates(): Promise<IcpTemplate[]> {
    return await db.query.icpTemplates.findMany({
      where: eq(icpTemplates.isDefault, true)
    });
  }

  async getTemplateById(id: string): Promise<IcpTemplate | undefined> {
    return await db.query.icpTemplates.findFirst({
      where: eq(icpTemplates.id, id)
    });
  }

  async createTemplate(template: {
    name: string;
    description?: string;
    config: ICPConfig;
    isDefault?: boolean;
  }): Promise<IcpTemplate> {
    const [created] = await db.insert(icpTemplates)
      .values({
        name: template.name,
        description: template.description,
        config: template.config,
        isDefault: template.isDefault || false
      })
      .returning();
    return created;
  }

  async updateTemplate(id: string, updates: {
    name?: string;
    description?: string;
    config?: ICPConfig;
  }): Promise<IcpTemplate> {
    const [updated] = await db.update(icpTemplates)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(icpTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteTemplate(id: string): Promise<void> {
    await db.delete(icpTemplates).where(eq(icpTemplates.id, id));
  }

  convertICPToApolloFilters(config: ICPConfig): any {
    const filters: any = {};

    if (config.jobTitles && config.jobTitles.length > 0) {
      filters.person_titles = config.jobTitles;
    }

    if (config.seniority && config.seniority.length > 0) {
      filters.person_seniorities = config.seniority;
    }

    if (config.departments && config.departments.length > 0) {
      filters.person_departments = config.departments;
    }

    if (config.companySize?.ranges && config.companySize.ranges.length > 0) {
      filters.organization_num_employees_ranges = config.companySize.ranges;
    }

    if (config.locations && config.locations.length > 0) {
      filters.person_locations = config.locations;
    }

    if (config.companyNames && config.companyNames.length > 0) {
      filters.q_organization_name = config.companyNames[0];
    }

    const keywords: string[] = [];
    if (config.keywords) keywords.push(...config.keywords);
    if (config.industries) keywords.push(...config.industries);
    if (config.technologies) keywords.push(...config.technologies);
    
    if (keywords.length > 0) {
      filters.q_keywords = keywords.join(' ');
    }

    return filters;
  }
}

export const icpTemplateService = new IcpTemplateService();
import { storage } from "../storage";

interface EmailTemplate {
  id: string;
  title: string;
  subject: string;
  content: string;
  variables: string[];
  category: 'cold_outreach' | 'follow_up' | 'breakup' | 're_engagement';
}

interface ContentLibrary {
  templates: EmailTemplate[];
  variables: Record<string, string>;
  snippets: Record<string, string>;
}

class ContentManagementService {
  private content: ContentLibrary = {
    templates: [
      {
        id: 'cold_outreach_1',
        title: 'Professional Introduction',
        subject: 'Quick question about {{company_name}}\'s {{industry}} operations',
        content: `Hi {{prospect_name}},

I noticed {{company_name}} has been {{recent_activity}} in the {{industry}} space. 

I'm {{sender_name}} from {{sender_company}}, and we help companies like yours {{value_proposition}}.

Would you be open to a brief 15-minute conversation this week to discuss how we could potentially help {{company_name}} {{specific_benefit}}?

Best regards,
{{sender_name}}
{{sender_signature}}`,
        variables: ['prospect_name', 'company_name', 'industry', 'recent_activity', 'sender_name', 'sender_company', 'value_proposition', 'specific_benefit', 'sender_signature'],
        category: 'cold_outreach'
      },
      {
        id: 'follow_up_1',
        title: 'Gentle Follow-up',
        subject: 'Re: {{original_subject}}',
        content: `Hi {{prospect_name}},

Just wanted to follow up on my previous email about {{topic}}.

I understand you're probably busy, but I thought this might be worth a quick discussion given {{company_name}}'s focus on {{company_focus}}.

Would next Tuesday or Wednesday work for a brief call?

Best,
{{sender_name}}`,
        variables: ['prospect_name', 'original_subject', 'topic', 'company_name', 'company_focus', 'sender_name'],
        category: 'follow_up'
      },
      {
        id: 'breakup_1',
        title: 'Final Attempt',
        subject: 'Last message about {{company_name}}',
        content: `Hi {{prospect_name}},

I haven't heard back from you, so I'll assume this isn't a priority right now.

I'll remove you from my follow-up sequence, but if anything changes and you'd like to discuss {{value_proposition}} for {{company_name}}, feel free to reach out.

Best of luck with your {{industry}} initiatives!

{{sender_name}}`,
        variables: ['prospect_name', 'company_name', 'value_proposition', 'industry', 'sender_name'],
        category: 'breakup'
      }
    ],
    variables: {
      sender_name: 'Sales Representative',
      sender_company: 'AI SDR Platform',
      sender_signature: 'Best regards,\nSales Team',
      value_proposition: 'streamline sales processes and increase conversion rates',
      company_focus: 'growth and efficiency',
      specific_benefit: 'achieve better sales outcomes'
    },
    snippets: {
      intro: 'I hope this email finds you well.',
      value_prop: 'We help companies like yours achieve significant improvements in sales efficiency.',
      cta: 'Would you be open to a brief 15-minute conversation this week?',
      closing: 'Looking forward to hearing from you.'
    }
  };

  getTemplate(id: string): EmailTemplate | undefined {
    return this.content.templates.find(t => t.id === id);
  }

  getTemplatesByCategory(category: EmailTemplate['category']): EmailTemplate[] {
    return this.content.templates.filter(t => t.category === category);
  }

  getAllTemplates(): EmailTemplate[] {
    return this.content.templates;
  }

  getVariables(): Record<string, string> {
    return this.content.variables;
  }

  getSnippets(): Record<string, string> {
    return this.content.snippets;
  }

  replaceVariables(content: string, variables: Record<string, string>): string {
    let result = content;
    
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });

    Object.entries(this.content.variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    });

    return result;
  }

  generateEmailFromTemplate(
    templateId: string, 
    prospectData: {
      name: string;
      company: string;
      industry: string;
      position: string;
    },
    customVariables: Record<string, string> = {}
  ): { subject: string; content: string } | null {
    const template = this.getTemplate(templateId);
    if (!template) return null;

    const variables = {
      prospect_name: prospectData.name,
      company_name: prospectData.company,
      industry: prospectData.industry,
      prospect_position: prospectData.position,
      recent_activity: `expanding their presence`,
      topic: `${prospectData.company}'s ${prospectData.industry} operations`,
      original_subject: `Quick question about ${prospectData.company}`,
      ...customVariables
    };

    return {
      subject: this.replaceVariables(template.subject, variables),
      content: this.replaceVariables(template.content, variables)
    };
  }

  async getContentLibraryItems() {
    try {
      const items = await storage.getContentLibraryItems();
      return items;
    } catch (error) {
      console.error('Error fetching content library:', error);
      return [];
    }
  }

  async addContentItem(item: any) {
    try {
      return await storage.createContentLibraryItem(item);
    } catch (error) {
      console.error('Error adding content item:', error);
      throw error;
    }
  }

  async updateContentItem(id: string, updates: any) {
    try {
      return await storage.updateContentLibraryItem(id, updates);
    } catch (error) {
      console.error('Error updating content item:', error);
      throw error;
    }
  }

  async deleteContentItem(id: string) {
    try {
      return await storage.deleteContentLibraryItem(id);
    } catch (error) {
      console.error('Error deleting content item:', error);
      throw error;
    }
  }
}

export const contentManagementService = new ContentManagementService();

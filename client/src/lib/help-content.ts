export interface HelpItem {
  id: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  steps?: string[];
  tips?: string[];
  relatedTopics?: string[];
}

export interface ModuleHelp {
  moduleId: string;
  moduleName: string;
  moduleDescription: string;
  items: HelpItem[];
}

export const helpContent: ModuleHelp[] = [
  {
    moduleId: "dashboard",
    moduleName: "Dashboard",
    moduleDescription: "Your central hub for finding prospects and managing your sales pipeline.",
    items: [
      {
        id: "ai-search",
        title: "AI Search",
        shortDescription: "Find prospects using natural language queries",
        fullDescription: "AI Search lets you describe your ideal customer in plain English. Our AI translates your description into precise search filters to find the best matching prospects from our database.",
        steps: [
          "Type a description of your ideal prospect (e.g., 'VP of Sales at tech startups in California')",
          "Click 'Search' or press Enter to find matching prospects",
          "Review the results and select prospects to add to your list",
          "Use filters to refine your search if needed"
        ],
        tips: [
          "Be specific about job titles, industries, and locations for better results",
          "You can combine multiple criteria in one search",
          "Use enrichment to get additional contact details"
        ],
        relatedTopics: ["prospect-management", "enrichment"]
      },
      {
        id: "prospect-management",
        title: "Prospect Management",
        shortDescription: "View, organize, and manage your prospects",
        fullDescription: "The prospects table shows all your saved prospects with their contact information, company details, and enrichment status. You can select multiple prospects for bulk actions like enrichment or adding to sequences.",
        steps: [
          "Use the checkbox to select one or more prospects",
          "Click 'Enrich Selected' to get additional contact data",
          "Click 'Add to Sequence' to start outreach campaigns",
          "Use the search box to find specific prospects"
        ],
        tips: [
          "Sort columns by clicking on headers",
          "Export prospects to CSV for external use",
          "Check the lead score to prioritize high-value prospects"
        ],
        relatedTopics: ["ai-search", "sequences"]
      },
      {
        id: "enrichment",
        title: "Data Enrichment",
        shortDescription: "Get emails and additional prospect data",
        fullDescription: "Enrichment adds verified email addresses and additional company/contact information to your prospects using external data providers like Apollo and Lusha.",
        steps: [
          "Select prospects you want to enrich",
          "Click 'Get Emails (Lusha)' for personal emails",
          "Click 'Enrich Selected' for full enrichment via Apollo",
          "Wait for the background job to complete"
        ],
        tips: [
          "Enrichment uses API credits - use wisely",
          "Check the Jobs drawer to monitor enrichment progress",
          "Personal emails often have better deliverability"
        ],
        relatedTopics: ["prospect-management", "import"]
      },
      {
        id: "import",
        title: "Import Prospects",
        shortDescription: "Upload prospects from CSV files",
        fullDescription: "Import allows you to upload prospects from CSV files. The system will match columns automatically and check for duplicates before importing.",
        steps: [
          "Click the 'Import' button",
          "Upload your CSV file (max 50MB)",
          "Map your CSV columns to prospect fields",
          "Review and confirm the import"
        ],
        tips: [
          "Include headers in your CSV for easier mapping",
          "Required fields: first name, last name, and email or company",
          "Duplicates are detected by email, LinkedIn URL, or name+company"
        ],
        relatedTopics: ["prospect-management"]
      }
    ]
  },
  {
    moduleId: "sequences",
    moduleName: "Email Sequences",
    moduleDescription: "Create and manage automated email outreach campaigns with AI personalization.",
    items: [
      {
        id: "create-sequence",
        title: "Creating Sequences",
        shortDescription: "Set up automated email campaigns",
        fullDescription: "Sequences are multi-step email campaigns that automatically send follow-ups based on timing rules. You can create sequences from templates, generate with AI, or build from scratch.",
        steps: [
          "Click 'New Sequence' to start",
          "Choose a template or create from scratch",
          "Add email steps with subject and body",
          "Set delay days between each step",
          "Save your sequence as a draft"
        ],
        tips: [
          "Start with a template for proven messaging",
          "Use AI generation for personalized content",
          "Keep sequences to 3-5 emails for best results"
        ],
        relatedTopics: ["sequence-steps", "ai-personalization", "enroll-prospects"]
      },
      {
        id: "sequence-steps",
        title: "Sequence Steps",
        shortDescription: "Configure individual emails in your sequence",
        fullDescription: "Each step in a sequence represents one email. You can configure the subject, body, and timing. Use merge fields like {{firstName}} to personalize messages.",
        steps: [
          "Click on a step to edit it",
          "Write your subject line with merge fields",
          "Compose the email body",
          "Set the delay (days to wait before sending)",
          "Save your changes"
        ],
        tips: [
          "Use {{firstName}}, {{companyName}}, {{jobTitle}} for personalization",
          "Add fallbacks like {{firstName|there}} for missing data",
          "First email should have 0 delay to send immediately on activation"
        ],
        relatedTopics: ["create-sequence", "merge-fields"]
      },
      {
        id: "ai-personalization",
        title: "AI Personalization",
        shortDescription: "Generate personalized emails using AI",
        fullDescription: "AI Personalization analyzes each prospect's LinkedIn profile and company information to generate highly personalized email content. This significantly improves response rates.",
        steps: [
          "Enable AI Personalization in sequence settings",
          "Enroll prospects with LinkedIn profiles",
          "Click 'Personalize with AI' to generate emails",
          "Review and approve generated content",
          "Activate the sequence to start sending"
        ],
        tips: [
          "Prospects with LinkedIn data get better personalization",
          "You can edit AI-generated content before sending",
          "Batch personalization supports up to 25 prospects at once"
        ],
        relatedTopics: ["create-sequence", "enroll-prospects"]
      },
      {
        id: "enroll-prospects",
        title: "Enrolling Prospects",
        shortDescription: "Add prospects to your sequences",
        fullDescription: "Enrollment adds prospects to your sequence so they start receiving emails. You can manually select prospects or use automation to continuously add new ones.",
        steps: [
          "Open your sequence",
          "Go to the 'Prospects' tab",
          "Click 'Add Prospects'",
          "Select prospects from your list",
          "Confirm enrollment"
        ],
        tips: [
          "Enrolled prospects start at step 1",
          "Prospects who reply are automatically paused",
          "You can pause or remove individual prospects"
        ],
        relatedTopics: ["create-sequence", "tracking"]
      },
      {
        id: "tracking",
        title: "Email Tracking",
        shortDescription: "Monitor opens, clicks, and replies",
        fullDescription: "Tracking shows you how prospects interact with your emails. See who opened emails, clicked links, and replied. Use this data to prioritize follow-ups.",
        steps: [
          "Open your sequence",
          "Go to the 'Tracking' tab",
          "View overall stats (sent, opened, replied)",
          "Click on individual emails to see details",
          "Check reply content in the 'Replies' tab"
        ],
        tips: [
          "High open rate but low reply? Improve your call-to-action",
          "Replies are automatically classified by sentiment",
          "Unsubscribes are processed automatically"
        ],
        relatedTopics: ["enroll-prospects", "replies"]
      },
      {
        id: "replies",
        title: "Managing Replies",
        shortDescription: "View and respond to prospect replies",
        fullDescription: "The Replies tab shows all responses from prospects. Each reply is classified by sentiment (positive, negative, neutral, unsubscribe) and includes AI-generated follow-up suggestions.",
        steps: [
          "Go to the 'Replies' tab in your sequence",
          "Review incoming replies",
          "Use AI to generate follow-up responses",
          "Send follow-ups directly from the platform",
          "Mark conversations as handled"
        ],
        tips: [
          "AI follow-ups maintain the email thread automatically",
          "Positive replies often indicate meeting interest",
          "Unsubscribe requests are processed automatically"
        ],
        relatedTopics: ["tracking", "ai-personalization"]
      },
      {
        id: "merge-fields",
        title: "Merge Fields",
        shortDescription: "Personalize emails with dynamic content",
        fullDescription: "Merge fields are placeholders that get replaced with actual prospect data when emails are sent. Use them to personalize subject lines and email bodies.",
        steps: [
          "Type {{ to see available merge fields",
          "Select a field like {{firstName}}",
          "Add a fallback with | like {{firstName|there}}",
          "Preview emails to see merged content"
        ],
        tips: [
          "Available fields: firstName, lastName, email, jobTitle, companyName, industry, location",
          "Fallbacks prevent empty values in emails",
          "Test with a few prospects before full send"
        ],
        relatedTopics: ["sequence-steps"]
      }
    ]
  },
  {
    moduleId: "automation",
    moduleName: "Automation",
    moduleDescription: "Set up automated workflows for continuous prospect discovery and outreach.",
    items: [
      {
        id: "automation-runs",
        title: "Automation Runs",
        shortDescription: "Monitor your automated workflows",
        fullDescription: "Automation runs are scheduled tasks that automatically find new prospects, enrich their data, and enroll them in sequences. Monitor progress and errors from this dashboard.",
        steps: [
          "View all running and completed automations",
          "Check progress bars for active runs",
          "Review error logs if issues occur",
          "Pause or stop automations as needed"
        ],
        tips: [
          "Failed prospects are logged for review",
          "Automation respects daily sending limits",
          "Cancelled runs preserve all progress"
        ],
        relatedTopics: ["create-automation", "rate-limits"]
      },
      {
        id: "create-automation",
        title: "Creating Automations",
        shortDescription: "Set up automatic prospect discovery and outreach",
        fullDescription: "Create automations to continuously find new prospects matching your criteria and automatically enroll them in sequences. Set filters, limits, and scheduling.",
        steps: [
          "Open a sequence and click 'Automate'",
          "Define your prospect search criteria",
          "Set the number of prospects to find",
          "Enable AI personalization if desired",
          "Start the automation"
        ],
        tips: [
          "Start small to test your criteria",
          "Use specific filters to target ideal customers",
          "Monitor initial results before scaling up"
        ],
        relatedTopics: ["automation-runs", "ai-personalization"]
      },
      {
        id: "rate-limits",
        title: "Rate Limits & Sending",
        shortDescription: "Control email sending volume",
        fullDescription: "Rate limits protect your sender reputation by controlling how many emails are sent per day. The system automatically spaces out sends throughout the day.",
        steps: [
          "Set daily email limits in mailbox settings",
          "Configure delays between emails",
          "Monitor sending progress in automation dashboard",
          "Adjust limits based on deliverability"
        ],
        tips: [
          "New domains should start with 20-50 emails/day",
          "Warm up mailboxes gradually over 2-4 weeks",
          "Multiple mailboxes enable higher total volume"
        ],
        relatedTopics: ["automation-runs", "mailboxes"]
      }
    ]
  },
  {
    moduleId: "mailboxes",
    moduleName: "Mailboxes",
    moduleDescription: "Connect and manage email accounts for sending campaigns.",
    items: [
      {
        id: "connect-mailbox",
        title: "Connecting Mailboxes",
        shortDescription: "Add email accounts for sending",
        fullDescription: "Connect your email accounts (Gmail, Outlook, custom SMTP) to send emails from the platform. Multiple mailboxes enable round-robin sending and higher volume.",
        steps: [
          "Click 'Add Mailbox'",
          "Enter your email address",
          "Configure SMTP settings (server, port, password)",
          "Configure IMAP settings for reply detection",
          "Test the connection"
        ],
        tips: [
          "Use app-specific passwords for Gmail",
          "Enable IMAP access in your email settings",
          "Each mailbox should have its own sending limits"
        ],
        relatedTopics: ["mailbox-settings", "warmup"]
      },
      {
        id: "mailbox-settings",
        title: "Mailbox Settings",
        shortDescription: "Configure sending limits and signature",
        fullDescription: "Each mailbox can have its own daily sending limits, delay between emails, and email signature. These settings help maintain good deliverability.",
        steps: [
          "Click the settings icon on a mailbox",
          "Set your daily sending limit",
          "Configure delay between emails (in seconds)",
          "Add your email signature",
          "Save settings"
        ],
        tips: [
          "Start with conservative limits (20-50/day)",
          "15-60 second delays between emails are typical",
          "Match signature to your actual email signature"
        ],
        relatedTopics: ["connect-mailbox", "warmup"]
      },
      {
        id: "warmup",
        title: "Mailbox Warmup",
        shortDescription: "Build sender reputation gradually",
        fullDescription: "New email accounts need to be 'warmed up' by gradually increasing sending volume. This builds trust with email providers and improves deliverability.",
        steps: [
          "Start with very low volume (5-10 emails/day)",
          "Increase by 5-10 emails every few days",
          "Monitor bounce rates and spam complaints",
          "Reach full capacity after 2-4 weeks"
        ],
        tips: [
          "Avoid sending to invalid emails during warmup",
          "Mix in manual sends for natural activity",
          "Check your spam folder for issues"
        ],
        relatedTopics: ["connect-mailbox", "mailbox-settings"]
      }
    ]
  },
  {
    moduleId: "analytics",
    moduleName: "Analytics",
    moduleDescription: "Track performance metrics across all your outreach campaigns.",
    items: [
      {
        id: "overview-metrics",
        title: "Overview Metrics",
        shortDescription: "See your overall performance at a glance",
        fullDescription: "The analytics dashboard shows key metrics like total emails sent, open rates, click rates, and reply rates across all your sequences and time periods.",
        steps: [
          "Select a date range for analysis",
          "View key metrics in the summary cards",
          "Compare performance across sequences",
          "Export data for deeper analysis"
        ],
        tips: [
          "20%+ open rate is good for cold email",
          "2-5% reply rate is typical for outbound",
          "Track trends over time for improvement"
        ],
        relatedTopics: ["sequence-analytics", "domain-health"]
      },
      {
        id: "sequence-analytics",
        title: "Sequence Analytics",
        shortDescription: "Performance by individual sequence",
        fullDescription: "See how each sequence is performing with detailed breakdowns by step. Identify which emails have the best engagement and optimize accordingly.",
        steps: [
          "Select a sequence to analyze",
          "View step-by-step performance",
          "Compare open and reply rates per step",
          "Identify top-performing subject lines"
        ],
        tips: [
          "First email usually has highest open rate",
          "Later steps often have higher reply rates",
          "A/B test subject lines for improvement"
        ],
        relatedTopics: ["overview-metrics"]
      },
      {
        id: "domain-health",
        title: "Domain Health",
        shortDescription: "Monitor email deliverability",
        fullDescription: "Domain health metrics show your sender reputation and deliverability. High bounce rates or spam complaints can hurt your ability to reach inboxes.",
        steps: [
          "Check your deliverability score",
          "Monitor bounce rates",
          "Review spam complaint rates",
          "Take action on issues"
        ],
        tips: [
          "Keep bounce rate under 2%",
          "Spam complaints should be near 0%",
          "Clean your list of invalid emails regularly"
        ],
        relatedTopics: ["overview-metrics", "mailboxes"]
      }
    ]
  },
  {
    moduleId: "settings",
    moduleName: "Settings",
    moduleDescription: "Configure your account, API keys, and preferences.",
    items: [
      {
        id: "profile",
        title: "Profile Settings",
        shortDescription: "Manage your account information",
        fullDescription: "Update your name, email, and other profile details. You can also view your active sessions and manage account security.",
        steps: [
          "Go to Settings > Profile",
          "Update your name or email",
          "Save changes"
        ],
        tips: [
          "Use a professional email address",
          "Keep your profile information current"
        ],
        relatedTopics: ["security"]
      },
      {
        id: "security",
        title: "Security Settings",
        shortDescription: "Manage passwords and sessions",
        fullDescription: "Change your password, view active sessions, and manage security settings. You can also enable two-factor authentication for added security.",
        steps: [
          "Go to Settings > Security",
          "Enter current password to make changes",
          "Set a strong new password",
          "Review and terminate suspicious sessions"
        ],
        tips: [
          "Use a unique, strong password",
          "Terminate sessions from unknown devices",
          "Change password regularly"
        ],
        relatedTopics: ["profile"]
      },
      {
        id: "api-keys",
        title: "API Keys",
        shortDescription: "Configure external service integrations",
        fullDescription: "Connect external services like Apollo, Lusha, and OpenAI by adding your API keys. These keys enable advanced features like AI generation and data enrichment.",
        steps: [
          "Go to Settings > API Keys",
          "Enter your API key for each service",
          "Save and test the connection"
        ],
        tips: [
          "Keep API keys secure and never share them",
          "Monitor API usage to control costs",
          "Some features require specific API keys"
        ],
        relatedTopics: ["profile"]
      }
    ]
  }
];

export function getModuleHelp(moduleId: string): ModuleHelp | undefined {
  return helpContent.find(m => m.moduleId === moduleId);
}

export function getHelpItem(moduleId: string, itemId: string): HelpItem | undefined {
  const module = getModuleHelp(moduleId);
  return module?.items.find(i => i.id === itemId);
}

export function searchHelp(query: string): HelpItem[] {
  const lowerQuery = query.toLowerCase();
  const results: HelpItem[] = [];
  
  for (const module of helpContent) {
    for (const item of module.items) {
      if (
        item.title.toLowerCase().includes(lowerQuery) ||
        item.shortDescription.toLowerCase().includes(lowerQuery) ||
        item.fullDescription.toLowerCase().includes(lowerQuery)
      ) {
        results.push(item);
      }
    }
  }
  
  return results;
}

import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  Search,
  User,
  Mail,
  GitBranch,
  Users,
  Sparkles,
  Clock,
  Play,
  Send,
  Inbox,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  BookOpen,
  HelpCircle,
  FileText,
  Settings,
  Zap,
} from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";

interface GuideSection {
  id: string;
  number: string;
  title: string;
  icon: any;
  description: string;
  content: {
    steps?: { title: string; description: string }[];
    options?: { title: string; steps: string[] }[];
    items?: string[];
    tips?: string[];
    note?: string;
  };
}

const guideSections: GuideSection[] = [
  {
    id: "login-setup",
    number: "1",
    title: "First Login & Account Setup",
    icon: User,
    description: "Get started with your account",
    content: {
      steps: [
        { title: "Step 1.1: Login", description: "Use credentials shared by your Manager. On first login, you'll be prompted to update your password." },
        { title: "Step 1.2: Complete Your Profile", description: "Navigate to Profile Settings and update your Name & role, Timezone (critical for send timing), and Preferred language (if applicable)." },
      ],
      tips: ["Your account is active and personalized once your profile is complete"],
    },
  },
  {
    id: "connect-mailbox",
    number: "2",
    title: "Connect Your Mailbox",
    icon: Mail,
    description: "Set up your email for sending campaigns",
    content: {
      steps: [
        { title: "Step 2.1: Add Mailbox", description: "Go to Mailbox Settings, click Connect Mailbox, choose your provider (Google / Outlook), and complete OAuth authentication." },
        { title: "Step 2.2: Verify Mailbox Health", description: "Ensure status shows as Connected & Verified. Send a test email if available." },
      ],
      tips: ["Sequences and campaigns will NOT run without a connected mailbox"],
    },
  },
  {
    id: "workflow-stages",
    number: "3",
    title: "Understand the 9-Stage Workflow",
    icon: GitBranch,
    description: "Your account progression through mandatory stages",
    content: {
      items: [
        "1. Profile Ready",
        "2. Mailbox Connected",
        "3. Prospect Added",
        "4. Sequence Created",
        "5. Personalization Configured",
        "6. Delay Rules Set",
        "7. Campaign Activated",
        "8. Emails Sent",
        "9. Analytics Available",
      ],
      note: "Each stage must be completed to move forward.",
    },
  },
  {
    id: "prospect-discovery",
    number: "4",
    title: "Prospect Discovery & Import",
    icon: Users,
    description: "Find and add prospects to your pipeline",
    content: {
      options: [
        {
          title: "Option A: AI Prospect Search",
          steps: [
            "Go to Prospects → AI Search",
            "Enter a natural language query (e.g., 'US SaaS companies, 50–200 employees, Head of Sales')",
            "Review parsed filters",
            "Run search",
          ],
        },
        {
          title: "Option B: Import Prospects",
          steps: [
            "Upload CSV or add manually",
            "Required fields: Email, First name, Company name",
          ],
        },
      ],
      steps: [
        { title: "Step 4.3: Data Enrichment", description: "System auto-enriches using LinkedIn, Company data, and News & intent signals." },
      ],
      tips: ["Prospects are enriched and ready after this step"],
    },
  },
  {
    id: "create-sequence",
    number: "5",
    title: "Create a Sequence",
    icon: FileText,
    description: "Build your email outreach campaign",
    content: {
      steps: [
        { title: "Step 5.1: Create New Sequence", description: "Go to Sequences → Create New. Name your sequence clearly (e.g., 'US SaaS – Cold Outreach – Q1')." },
        { title: "Step 5.2: Add Steps", description: "Add supported step types: Email, Wait/Delay. Example structure: Email 1 → Wait 2 days → Email 2 → Wait 3 days → Email 3." },
      ],
    },
  },
  {
    id: "ai-personalization",
    number: "6",
    title: "Configure AI Personalization",
    icon: Sparkles,
    description: "Use AI to personalize your outreach",
    content: {
      steps: [
        { title: "Step 6.1: Enable AI Personalization", description: "Toggle AI Personalization ON in sequence settings." },
        { title: "Step 6.2: Select Personalization Inputs", description: "AI can use: LinkedIn headline & recent activity, Company description, Recent company news, Job role & seniority." },
        { title: "Step 6.3: Preview Personalization", description: "Preview samples for 5–10 prospects. Lock content once satisfied." },
      ],
      tips: ["Always review previews to avoid hallucinations"],
    },
  },
  {
    id: "delay-rules",
    number: "7",
    title: "Set Delay & Send Rules",
    icon: Clock,
    description: "Configure timing for your emails",
    content: {
      steps: [
        { title: "Step 7.1: Delay Configuration", description: "Define wait time between steps (hours or days)." },
        { title: "Step 7.2: Send Window", description: "Configure allowed send days and send hours (in recipient's local timezone)." },
      ],
    },
  },
  {
    id: "add-prospects",
    number: "8",
    title: "Add Prospects to Sequence",
    icon: Users,
    description: "Enroll prospects in your campaign",
    content: {
      steps: [
        { title: "Step 8.1: Select Prospects", description: "Filter prospects and select individually or use bulk select." },
        { title: "Step 8.2: Enroll in Sequence", description: "Click Add to Sequence and confirm enrollment. System validates email limits, active enrollments, and campaign quotas." },
      ],
    },
  },
  {
    id: "activate-campaign",
    number: "9",
    title: "Activate Campaign",
    icon: Play,
    description: "Launch your outreach campaign",
    content: {
      steps: [
        { title: "Step 9.1: Final Checklist", description: "Ensure: Mailbox connected, Sequence active, Personalization locked, Delays configured." },
        { title: "Step 9.2: Activate", description: "Click Activate Campaign. Campaign status changes to Running." },
      ],
    },
  },
  {
    id: "monitor-sending",
    number: "10",
    title: "Monitor Email Sending",
    icon: Send,
    description: "Track your email delivery",
    content: {
      items: [
        "Emails are sent one-by-one with delays respected",
        "Provider delivery is acknowledged",
        "Personalization takes seconds per prospect",
        "Email send flow: queued → provider → sent",
      ],
    },
  },
  {
    id: "reply-management",
    number: "11",
    title: "Reply Management (Inbox)",
    icon: Inbox,
    description: "Handle responses from prospects",
    content: {
      steps: [
        { title: "Step 11.1: View Replies", description: "Go to Inbox. Replies appear in the same thread." },
        { title: "Step 11.2: AI Reply Assistance", description: "If enabled, AI suggests reply drafts. You can edit or send manually." },
        { title: "Step 11.3: Manual Actions", description: "Reply, Pause prospect, or Mark as Interested / Not Interested." },
      ],
    },
  },
  {
    id: "analytics",
    number: "12",
    title: "Analytics & Performance Tracking",
    icon: BarChart3,
    description: "Measure your campaign success",
    content: {
      items: [
        "Track: Emails sent, Open & reply rates, Campaign performance, Sequence effectiveness",
      ],
      tips: [
        "Use analytics to improve copy",
        "Adjust delays based on performance",
        "Stop underperforming sequences",
      ],
    },
  },
  {
    id: "quotas",
    number: "13",
    title: "Quotas & Limits",
    icon: AlertTriangle,
    description: "Understand your usage limits",
    content: {
      items: [
        "Emails per day limit",
        "Active enrollments limit",
        "Active campaigns limit",
      ],
      tips: ["Always check quota before launching new campaigns"],
    },
  },
  {
    id: "common-mistakes",
    number: "14",
    title: "Common Mistakes to Avoid",
    icon: AlertTriangle,
    description: "Don't make these errors",
    content: {
      items: [
        "Activating campaigns without previews",
        "Adding too many prospects at once",
        "Ignoring reply handling",
        "Overlapping sequences",
      ],
    },
  },
  {
    id: "daily-workflow",
    number: "15",
    title: "Daily SDR Workflow (Recommended)",
    icon: CheckCircle2,
    description: "Your daily routine for success",
    content: {
      items: [
        "1. Check Inbox replies",
        "2. Review campaign health",
        "3. Add new prospects",
        "4. Launch or optimize sequences",
        "5. Review analytics",
      ],
      note: "This system is designed to enforce best practices. If something is blocked, the platform will tell you what and why. Follow the workflow and you'll avoid most issues.",
    },
  },
];

export default function UserGuidePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const filteredSections = guideSections.filter((section) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      section.title.toLowerCase().includes(query) ||
      section.description.toLowerCase().includes(query) ||
      JSON.stringify(section.content).toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto p-6 max-w-4xl">
        <Breadcrumbs />
        
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3" data-testid="text-page-title">
              <BookOpen className="w-8 h-8 text-primary" />
              SDR User Guide
            </h1>
            <p className="text-muted-foreground mt-1">
              Step-by-step guide from login to booking meetings
            </p>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search the guide..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-guide"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6 bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Lightbulb className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">Quick Start</h3>
                <p className="text-sm text-muted-foreground">
                  This guide helps a new SDR (User) go from first login to booking meetings,
                  covering every module and step in the correct order. Follow this sequentially for best results.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-6">
          {guideSections.slice(0, 5).map((section) => (
            <Button
              key={section.id}
              variant="outline"
              size="sm"
              className="flex flex-col items-center gap-1 h-auto py-3"
              onClick={() => {
                const element = document.getElementById(section.id);
                element?.scrollIntoView({ behavior: "smooth" });
              }}
              data-testid={`button-jump-${section.id}`}
            >
              <section.icon className="w-4 h-4" />
              <span className="text-xs">{section.number}</span>
            </Button>
          ))}
        </div>

        <Accordion
          type="multiple"
          value={expandedSections}
          onValueChange={setExpandedSections}
          className="space-y-4"
        >
          {filteredSections.map((section) => (
            <AccordionItem
              key={section.id}
              value={section.id}
              id={section.id}
              className="border rounded-lg bg-card px-4"
              data-testid={`section-${section.id}`}
            >
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex items-center gap-4 text-left">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                    <section.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Step {section.number}
                      </Badge>
                      <h3 className="font-semibold">{section.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {section.description}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="pl-14 space-y-4">
                  {section.content.steps && (
                    <div className="space-y-3">
                      {section.content.steps.map((step, idx) => (
                        <div key={idx} className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{step.title}</p>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {section.content.options && (
                    <div className="space-y-4">
                      {section.content.options.map((option, idx) => (
                        <div key={idx} className="bg-muted/50 rounded-lg p-4">
                          <h4 className="font-medium text-sm mb-2">{option.title}</h4>
                          <ul className="space-y-1">
                            {option.steps.map((step, stepIdx) => (
                              <li key={stepIdx} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className="text-primary">•</span>
                                {step}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}

                  {section.content.items && (
                    <ul className="space-y-2">
                      {section.content.items.map((item, idx) => (
                        <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.content.tips && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                        <span className="font-medium text-sm text-yellow-800 dark:text-yellow-200">Tips</span>
                      </div>
                      <ul className="space-y-1">
                        {section.content.tips.map((tip, idx) => (
                          <li key={idx} className="text-sm text-yellow-700 dark:text-yellow-300">
                            • {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {section.content.note && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                          {section.content.note}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {filteredSections.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No sections found matching "{searchQuery}"</p>
              <Button
                variant="link"
                onClick={() => setSearchQuery("")}
                className="mt-2"
                data-testid="button-clear-search"
              >
                Clear search
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="mt-8 bg-gradient-to-r from-primary/10 to-accent/10">
          <CardContent className="pt-6">
            <div className="text-center">
              <Zap className="w-10 h-10 mx-auto text-primary mb-3" />
              <h3 className="font-semibold text-lg mb-2">Need More Help?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Click the help button in the corner or contact support for assistance.
              </p>
              <div className="flex justify-center gap-3">
                <Link href="/best-practices">
                  <Button variant="outline" data-testid="button-best-practices">
                    <BookOpen className="w-4 h-4 mr-2" />
                    Best Practices
                  </Button>
                </Link>
                <Link href="/settings">
                  <Button variant="outline" data-testid="button-settings">
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

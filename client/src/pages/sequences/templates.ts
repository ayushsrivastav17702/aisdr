import { Mail, Sparkles, Reply, RefreshCw } from "lucide-react";

// Pre-defined sequence templates
export const SEQUENCE_TEMPLATES = [
  {
    id: 'cold-outreach',
    name: 'Cold Outreach',
    description: 'Classic 4-step cold outreach sequence for new prospects',
    icon: Mail,
    category: 'Sales',
    steps: [
      {
        subject: 'Quick question about {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>I noticed {{companyName}} is growing fast in the {{industry}} space. I wanted to reach out because we help companies like yours solve [specific problem].</p><p>Would you be open to a quick 15-minute call this week to explore how we can help?</p><p>Best regards</p>',
        delayDays: 0,
      },
      {
        subject: 'Following up - {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>I wanted to follow up on my previous email. I understand you\'re busy, so I\'ll keep this brief.</p><p>We\'ve helped similar companies in {{industry}} achieve [specific result]. I think we could do the same for {{companyName}}.</p><p>Are you available for a quick chat this week?</p><p>Thanks!</p>',
        delayDays: 3,
      },
      {
        subject: 'Thought you might find this helpful',
        body: '<p>Hi {{firstName}},</p><p>I came across this case study that reminded me of {{companyName}}. [Company X] faced similar challenges and saw [specific results] after implementing our solution.</p><p>I thought this might be relevant to your goals. Would you like to discuss how we can help {{companyName}} achieve similar results?</p><p>Let me know!</p>',
        delayDays: 5,
      },
      {
        subject: 'Should I close your file?',
        body: '<p>Hi {{firstName}},</p><p>I haven\'t heard back from you, so I\'m assuming this isn\'t a priority right now. I\'ll go ahead and close your file.</p><p>If I\'m wrong and you\'d still like to explore how we can help {{companyName}}, just reply to this email and I\'ll reopen it.</p><p>All the best!</p>',
        delayDays: 7,
      },
    ],
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: '3-step sequence for announcing new products or features',
    icon: Sparkles,
    category: 'Marketing',
    steps: [
      {
        subject: 'Exciting news for {{companyName}}!',
        body: '<p>Hi {{firstName}},</p><p>I\'m excited to share that we just launched [Product Name], designed specifically for companies like {{companyName}} in the {{industry}} space.</p><p>[Product Name] helps you [key benefit] without [common pain point].</p><p>I\'d love to give you an exclusive early access demo. Are you available this week?</p><p>Cheers!</p>',
        delayDays: 0,
      },
      {
        subject: 'Early access demo for {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>Just wanted to make sure you saw my email about [Product Name]. We\'re offering early access to select companies, and I thought {{companyName}} would be a perfect fit.</p><p>The demo only takes 20 minutes, and I think you\'ll love what you see.</p><p>Can I book you in for this week?</p><p>Thanks!</p>',
        delayDays: 4,
      },
      {
        subject: 'Last chance for early access',
        body: '<p>Hi {{firstName}},</p><p>We\'re closing early access registration soon, and I didn\'t want {{companyName}} to miss out.</p><p>Companies that have seen the demo are already seeing [specific results]. I\'d hate for you to miss this opportunity.</p><p>Let me know if you\'d like to jump on a quick call!</p><p>Best,</p>',
        delayDays: 6,
      },
    ],
  },
  {
    id: 'follow-up',
    name: 'Follow-up Sequence',
    description: 'Gentle 3-step follow-up for warm leads',
    icon: Reply,
    category: 'Sales',
    steps: [
      {
        subject: 'Following up from our conversation',
        body: '<p>Hi {{firstName}},</p><p>It was great speaking with you about {{companyName}}\'s goals. As promised, I\'m sending over some additional information that might be helpful.</p><p>[Attach relevant resources or links]</p><p>Let me know if you have any questions, or if you\'d like to schedule a follow-up call.</p><p>Thanks!</p>',
        delayDays: 0,
      },
      {
        subject: 'Checking in - {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>I wanted to check in and see if you had a chance to review the information I sent over.</p><p>I\'m happy to answer any questions or set up a time to discuss next steps.</p><p>Looking forward to hearing from you!</p>',
        delayDays: 4,
      },
      {
        subject: 'Any questions about what we discussed?',
        body: '<p>Hi {{firstName}},</p><p>I haven\'t heard back, so I wanted to make sure everything is clear on your end.</p><p>If you need more information or would like to explore this further, just let me know. Otherwise, I\'ll follow up in a few weeks.</p><p>Thanks for your time!</p>',
        delayDays: 6,
      },
    ],
  },
  {
    id: 'reengagement',
    name: 'Re-engagement',
    description: '2-step sequence to re-engage inactive prospects',
    icon: RefreshCw,
    category: 'Sales',
    steps: [
      {
        subject: 'Are you still interested in [solution]?',
        body: '<p>Hi {{firstName}},</p><p>We spoke a while back about how we could help {{companyName}} with [specific challenge]. I wanted to reach out and see if this is still a priority for you.</p><p>A lot has changed since we last spoke - we\'ve added [new features/results] that I think would be really valuable for {{companyName}}.</p><p>Would you like to reconnect for a quick call?</p><p>Best,</p>',
        delayDays: 0,
      },
      {
        subject: 'Last check-in for {{companyName}}',
        body: '<p>Hi {{firstName}},</p><p>I understand priorities change, so this will be my last email unless I hear back from you.</p><p>If you\'re still interested in [solution], I\'d be happy to reconnect. Otherwise, I wish you and {{companyName}} all the best!</p><p>Thanks,</p>',
        delayDays: 5,
      },
    ],
  },
];

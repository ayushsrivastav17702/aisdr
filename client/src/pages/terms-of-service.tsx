import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Terms of Service</CardTitle>
          <p className="text-muted-foreground">Last Updated: November 19, 2024</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the AISDR platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). 
            If you do not agree to these Terms, you may not use the Service.
          </p>

          <Separator className="my-6" />

          <h2>2. Description of Service</h2>
          <p>
            AISDR provides an AI-powered Sales Development Representative platform that enables users to:
          </p>
          <ul>
            <li>Search and discover prospects using AI-powered natural language queries</li>
            <li>Enrich prospect data through integrated third-party services</li>
            <li>Create and manage automated email sequences</li>
            <li>Track email engagement and replies</li>
            <li>Manage multi-mailbox email sending with warmup capabilities</li>
            <li>Analyze campaign performance through comprehensive analytics</li>
          </ul>

          <Separator className="my-6" />

          <h2>3. User Accounts</h2>
          <h3>3.1 Account Registration</h3>
          <p>
            You must create an account to use the Service. You agree to provide accurate, current, and complete information 
            during registration and to update such information to keep it accurate, current, and complete.
          </p>

          <h3>3.2 Account Security</h3>
          <p>
            You are responsible for maintaining the confidentiality of your account credentials and for all activities that 
            occur under your account. You agree to immediately notify us of any unauthorized use of your account.
          </p>

          <h3>3.3 Account Termination</h3>
          <p>
            We reserve the right to suspend or terminate your account at any time for violations of these Terms or for any other reason we deem appropriate.
          </p>

          <Separator className="my-6" />

          <h2>4. Acceptable Use Policy</h2>
          <h3>4.1 Permitted Use</h3>
          <p>
            You may use the Service only for lawful purposes and in accordance with these Terms. You agree not to use the Service:
          </p>
          <ul>
            <li>In any way that violates any applicable federal, state, local, or international law or regulation</li>
            <li>To send spam or unsolicited commercial email</li>
            <li>To violate CAN-SPAM Act, GDPR, CCPA, or other anti-spam and privacy regulations</li>
            <li>To impersonate or attempt to impersonate the Company, another user, or any other person or entity</li>
            <li>To engage in any other conduct that restricts or inhibits anyone's use of the Service</li>
          </ul>

          <h3>4.2 Email Compliance</h3>
          <p>
            You agree to comply with all applicable email marketing laws and regulations, including but not limited to:
          </p>
          <ul>
            <li>Including accurate sender information in all emails</li>
            <li>Providing clear and conspicuous unsubscribe mechanisms</li>
            <li>Honoring unsubscribe requests within 10 business days</li>
            <li>Not using deceptive subject lines or headers</li>
            <li>Obtaining proper consent before sending marketing emails</li>
          </ul>

          <Separator className="my-6" />

          <h2>5. Data and Privacy</h2>
          <h3>5.1 Your Data</h3>
          <p>
            You retain all rights to the prospect data, email content, and other information you input into the Service ("User Data"). 
            We claim no ownership rights over your User Data.
          </p>

          <h3>5.2 Data Processing</h3>
          <p>
            By using the Service, you grant us the right to process your User Data solely for the purpose of providing the Service 
            to you. See our Privacy Policy and Data Processing Agreement for more details.
          </p>

          <h3>5.3 Data Security</h3>
          <p>
            We implement industry-standard security measures to protect your data, including encryption at rest and in transit, 
            secure authentication, and regular security audits.
          </p>

          <Separator className="my-6" />

          <h2>6. Third-Party Services</h2>
          <p>
            The Service integrates with third-party services including Apollo.io, Lusha, OpenAI, and Anthropic. Your use of these 
            integrations is subject to the terms and privacy policies of those respective services. We are not responsible for the 
            practices of third-party services.
          </p>

          <Separator className="my-6" />

          <h2>7. Subscription and Payment</h2>
          <h3>7.1 Subscription Plans</h3>
          <p>
            The Service offers multiple subscription tiers:
          </p>
          <ul>
            <li><strong>Free Plan</strong>: Basic features with usage limits</li>
            <li><strong>Pro Plan</strong>: $49/month with enhanced features and limits</li>
            <li><strong>Enterprise Plan</strong>: Custom pricing with unlimited usage and dedicated support</li>
          </ul>

          <h3>7.2 Billing</h3>
          <p>
            Subscriptions are billed in advance on a monthly or annual basis. All fees are non-refundable except as required by law.
          </p>

          <h3>7.3 Cancellation</h3>
          <p>
            You may cancel your subscription at any time. Cancellations will take effect at the end of the current billing period.
          </p>

          <Separator className="my-6" />

          <h2>8. Intellectual Property</h2>
          <h3>8.1 Service Ownership</h3>
          <p>
            The Service and its original content, features, and functionality are owned by us and are protected by international 
            copyright, trademark, patent, trade secret, and other intellectual property laws.
          </p>

          <h3>8.2 License to Use</h3>
          <p>
            Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to use the Service 
            for your internal business purposes.
          </p>

          <Separator className="my-6" />

          <h2>9. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL WE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, 
            CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, 
            OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
          </p>

          <Separator className="my-6" />

          <h2>10. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, 
            INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </p>

          <Separator className="my-6" />

          <h2>11. Indemnification</h2>
          <p>
            You agree to indemnify, defend, and hold harmless the Company and its officers, directors, employees, and agents from 
            any claims, liabilities, damages, losses, and expenses arising out of or in any way connected with your use of the Service 
            or violation of these Terms.
          </p>

          <Separator className="my-6" />

          <h2>12. Modifications to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will notify you of material changes by posting the updated 
            Terms on the Service and updating the "Last Updated" date. Your continued use of the Service after such changes 
            constitutes your acceptance of the new Terms.
          </p>

          <Separator className="my-6" />

          <h2>13. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of the United States and the State of 
            California, without regard to its conflict of law provisions.
          </p>

          <Separator className="my-6" />

          <h2>14. Dispute Resolution</h2>
          <p>
            Any dispute arising out of or relating to these Terms or the Service shall be resolved through binding arbitration 
            in accordance with the rules of the American Arbitration Association.
          </p>

          <Separator className="my-6" />

          <h2>15. Contact Information</h2>
          <p>
            If you have any questions about these Terms, please contact us at:
          </p>
          <ul>
            <li>Email: legal@aisdr.example.com</li>
            <li>Address: 123 Business St, San Francisco, CA 94102</li>
          </ul>

          <Separator className="my-6" />

          <p className="text-sm text-muted-foreground italic">
            By using the AISDR platform, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

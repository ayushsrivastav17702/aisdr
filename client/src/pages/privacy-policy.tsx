import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Privacy Policy</CardTitle>
          <p className="text-muted-foreground">Last Updated: November 19, 2024</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <h2>1. Introduction</h2>
          <p>
            This Privacy Policy explains how AISDR ("we", "us", or "our") collects, uses, discloses, and protects your personal 
            information when you use our AI-powered Sales Development Representative platform ("Service").
          </p>
          <p>
            We are committed to protecting your privacy and complying with applicable data protection laws, including the General 
            Data Protection Regulation (GDPR), California Consumer Privacy Act (CCPA), and CAN-SPAM Act.
          </p>

          <Separator className="my-6" />

          <h2>2. Information We Collect</h2>
          
          <h3>2.1 Information You Provide</h3>
          <ul>
            <li><strong>Account Information</strong>: Name, email address, password, company name</li>
            <li><strong>Payment Information</strong>: Billing address, payment method (processed by third-party payment processors)</li>
            <li><strong>Prospect Data</strong>: Names, email addresses, job titles, companies, and other business contact information you import or search for</li>
            <li><strong>Email Content</strong>: Email templates, sequences, and communications you create</li>
            <li><strong>Mailbox Credentials</strong>: SMTP/IMAP settings (encrypted before storage)</li>
          </ul>

          <h3>2.2 Information Automatically Collected</h3>
          <ul>
            <li><strong>Usage Data</strong>: Features used, searches performed, emails sent, campaign performance</li>
            <li><strong>Device Information</strong>: IP address, browser type, operating system</li>
            <li><strong>Cookies and Similar Technologies</strong>: See our Cookie Policy for details</li>
            <li><strong>Log Data</strong>: API requests, error logs, system performance metrics</li>
          </ul>

          <h3>2.3 Information from Third Parties</h3>
          <ul>
            <li>Prospect data from Apollo.io and Lusha.io enrichment services</li>
            <li>Email engagement data (opens, clicks, replies)</li>
            <li>OAuth authentication data from Google, Microsoft, and other providers</li>
          </ul>

          <Separator className="my-6" />

          <h2>3. How We Use Your Information</h2>
          <p>We use your information for the following purposes:</p>

          <h3>3.1 Service Provision</h3>
          <ul>
            <li>Providing and maintaining the Service</li>
            <li>Processing prospect searches and data enrichment</li>
            <li>Sending emails on your behalf through integrated mailboxes</li>
            <li>Tracking email engagement and campaign performance</li>
            <li>Providing customer support</li>
          </ul>

          <h3>3.2 Service Improvement</h3>
          <ul>
            <li>Analyzing usage patterns to improve features</li>
            <li>Training AI models to enhance search and personalization</li>
            <li>Developing new features and functionality</li>
            <li>Conducting research and analytics</li>
          </ul>

          <h3>3.3 Communication</h3>
          <ul>
            <li>Sending service updates and announcements</li>
            <li>Responding to inquiries and support requests</li>
            <li>Sending marketing communications (with your consent)</li>
          </ul>

          <h3>3.4 Security and Compliance</h3>
          <ul>
            <li>Detecting and preventing fraud and abuse</li>
            <li>Ensuring compliance with legal obligations</li>
            <li>Protecting the rights and safety of users</li>
          </ul>

          <Separator className="my-6" />

          <h2>4. Legal Basis for Processing (GDPR)</h2>
          <p>We process your personal data under the following legal bases:</p>
          <ul>
            <li><strong>Contract Performance</strong>: To provide the Service you've subscribed to</li>
            <li><strong>Legitimate Interests</strong>: To improve our Service and prevent fraud</li>
            <li><strong>Consent</strong>: For marketing communications and certain data processing activities</li>
            <li><strong>Legal Obligations</strong>: To comply with applicable laws and regulations</li>
          </ul>

          <Separator className="my-6" />

          <h2>5. Data Sharing and Disclosure</h2>
          
          <h3>5.1 Third-Party Service Providers</h3>
          <p>We share data with trusted third-party service providers who assist us in operating the Service:</p>
          <ul>
            <li><strong>Apollo.io</strong>: Prospect search and data enrichment</li>
            <li><strong>Lusha.io</strong>: Email verification and enrichment</li>
            <li><strong>OpenAI & Anthropic</strong>: AI-powered natural language processing and email generation</li>
            <li><strong>Cloud Hosting</strong>: Infrastructure and database hosting (AWS, Neon, Upstash)</li>
            <li><strong>Email Services</strong>: Transactional email delivery (Resend)</li>
            <li><strong>Payment Processors</strong>: Billing and payment processing</li>
          </ul>

          <h3>5.2 Business Transfers</h3>
          <p>
            In the event of a merger, acquisition, or sale of assets, your information may be transferred to the acquiring entity.
          </p>

          <h3>5.3 Legal Requirements</h3>
          <p>We may disclose your information if required by law or to:</p>
          <ul>
            <li>Comply with legal obligations or court orders</li>
            <li>Protect our rights and property</li>
            <li>Prevent fraud or security threats</li>
            <li>Protect the safety of our users and the public</li>
          </ul>

          <h3>5.4 With Your Consent</h3>
          <p>We may share your information for other purposes with your explicit consent.</p>

          <Separator className="my-6" />

          <h2>6. Data Security</h2>
          <p>We implement industry-standard security measures to protect your information:</p>
          <ul>
            <li><strong>Encryption</strong>: AES-256 encryption at rest, TLS 1.3 in transit</li>
            <li><strong>Authentication</strong>: Bcrypt password hashing (12 rounds), JWT tokens, HTTP-only cookies</li>
            <li><strong>Access Controls</strong>: Role-based access control (RBAC), multi-tenant isolation</li>
            <li><strong>Monitoring</strong>: Comprehensive audit logging, error tracking with Sentry</li>
            <li><strong>Regular Audits</strong>: Security assessments and penetration testing</li>
          </ul>
          <p>
            However, no method of transmission over the Internet is 100% secure. While we strive to protect your data, 
            we cannot guarantee absolute security.
          </p>

          <Separator className="my-6" />

          <h2>7. Data Retention</h2>
          <p>We retain your information for as long as necessary to:</p>
          <ul>
            <li>Provide the Service to you</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes and enforce agreements</li>
            <li>Maintain business records</li>
          </ul>
          <p>
            Upon account deletion, we will delete or anonymize your personal data within 30 days, except where retention 
            is required by law.
          </p>

          <Separator className="my-6" />

          <h2>8. Your Rights</h2>
          
          <h3>8.1 GDPR Rights (EU/EEA Users)</h3>
          <ul>
            <li><strong>Access</strong>: Request a copy of your personal data</li>
            <li><strong>Rectification</strong>: Correct inaccurate or incomplete data</li>
            <li><strong>Erasure</strong>: Request deletion of your data ("right to be forgotten")</li>
            <li><strong>Restriction</strong>: Limit processing of your data</li>
            <li><strong>Data Portability</strong>: Receive your data in a structured, machine-readable format</li>
            <li><strong>Object</strong>: Object to processing based on legitimate interests</li>
            <li><strong>Withdraw Consent</strong>: Revoke consent at any time</li>
          </ul>

          <h3>8.2 CCPA Rights (California Users)</h3>
          <ul>
            <li><strong>Know</strong>: Request disclosure of personal information collected</li>
            <li><strong>Delete</strong>: Request deletion of personal information</li>
            <li><strong>Opt-Out</strong>: Opt-out of the sale of personal information (we do not sell data)</li>
            <li><strong>Non-Discrimination</strong>: Not be discriminated against for exercising CCPA rights</li>
          </ul>

          <h3>8.3 Exercising Your Rights</h3>
          <p>
            To exercise any of these rights, please:
          </p>
          <ul>
            <li>Use the Data Export feature in your account settings</li>
            <li>Contact us at privacy@aisdr.example.com</li>
            <li>Submit a request through your account dashboard</li>
          </ul>
          <p>We will respond to your request within 30 days.</p>

          <Separator className="my-6" />

          <h2>9. International Data Transfers</h2>
          <p>
            Your information may be transferred to and processed in countries other than your country of residence. 
            We ensure adequate safeguards are in place, including:
          </p>
          <ul>
            <li>Standard Contractual Clauses approved by the European Commission</li>
            <li>Privacy Shield certification (where applicable)</li>
            <li>Adequacy decisions by relevant authorities</li>
          </ul>

          <Separator className="my-6" />

          <h2>10. Children's Privacy</h2>
          <p>
            Our Service is not intended for users under the age of 18. We do not knowingly collect personal information 
            from children. If you become aware that a child has provided us with personal data, please contact us, and 
            we will take steps to delete such information.
          </p>

          <Separator className="my-6" />

          <h2>11. Changes to This Privacy Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of material changes by:
          </p>
          <ul>
            <li>Posting the updated policy on our website</li>
            <li>Updating the "Last Updated" date</li>
            <li>Sending an email notification (for material changes)</li>
          </ul>
          <p>Your continued use of the Service after changes constitutes acceptance of the updated policy.</p>

          <Separator className="my-6" />

          <h2>12. Contact Information</h2>
          <p>
            If you have questions about this Privacy Policy or wish to exercise your rights, please contact:
          </p>
          <ul>
            <li><strong>Data Protection Officer</strong>: dpo@aisdr.example.com</li>
            <li><strong>Privacy Email</strong>: privacy@aisdr.example.com</li>
            <li><strong>Mailing Address</strong>: 123 Business St, San Francisco, CA 94102</li>
          </ul>

          <p className="text-sm text-muted-foreground italic mt-8">
            For EU/EEA users: You have the right to lodge a complaint with your local data protection authority if you believe 
            we have not adequately addressed your concerns.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

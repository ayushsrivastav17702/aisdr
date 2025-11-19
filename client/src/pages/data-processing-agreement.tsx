import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default function DataProcessingAgreementPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Data Processing Agreement (DPA)</CardTitle>
          <p className="text-muted-foreground">Last Updated: November 19, 2024</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <h2>1. Introduction</h2>
          <p>
            This Data Processing Agreement ("DPA") is entered into between AISDR ("Data Processor") and you, the customer 
            ("Data Controller"), to ensure compliance with applicable data protection laws, including the General Data 
            Protection Regulation (EU) 2016/679 ("GDPR"), UK GDPR, and the California Consumer Privacy Act ("CCPA").
          </p>
          <p>
            This DPA supplements our Terms of Service and Privacy Policy and governs the processing of personal data on 
            behalf of the Data Controller in connection with the AISDR Service.
          </p>

          <Separator className="my-6" />

          <h2>2. Definitions</h2>
          <p>For the purposes of this DPA:</p>
          <ul>
            <li><strong>"Personal Data"</strong>: Information relating to an identified or identifiable natural person, including prospect names, email addresses, job titles, and contact information</li>
            <li><strong>"Processing"</strong>: Any operation performed on Personal Data, including collection, storage, use, transmission, and deletion</li>
            <li><strong>"Data Subject"</strong>: The individual whose Personal Data is being processed (e.g., prospects in your database)</li>
            <li><strong>"Sub-processor"</strong>: Third-party service providers engaged by AISDR to process Personal Data</li>
            <li><strong>"Data Controller"</strong>: You, the customer, who determines the purposes and means of processing</li>
            <li><strong>"Data Processor"</strong>: AISDR, who processes Personal Data on behalf of the Data Controller</li>
          </ul>

          <Separator className="my-6" />

          <h2>3. Scope and Purpose of Processing</h2>
          
          <h3>3.1 Subject Matter</h3>
          <p>
            AISDR processes Personal Data to provide the AI-powered SDR platform, including prospect search, data enrichment, 
            email sequence management, and campaign analytics.
          </p>

          <h3>3.2 Nature and Purpose of Processing</h3>
          <ul>
            <li>Searching and discovering prospects based on natural language queries</li>
            <li>Enriching prospect data through third-party integrations (Apollo.io, Lusha.io)</li>
            <li>Storing and managing prospect information in the platform database</li>
            <li>Sending emails on behalf of Data Controller through integrated mailboxes</li>
            <li>Tracking email engagement (opens, clicks, replies)</li>
            <li>Generating AI-powered email content and personalization</li>
            <li>Providing analytics and reporting on campaign performance</li>
          </ul>

          <h3>3.3 Categories of Personal Data</h3>
          <ul>
            <li>Contact information: Names, email addresses, phone numbers</li>
            <li>Professional information: Job titles, company names, LinkedIn profiles</li>
            <li>Engagement data: Email opens, clicks, replies, timestamps</li>
            <li>Enrichment data: Revenue estimates, employee counts, technologies used</li>
          </ul>

          <h3>3.4 Categories of Data Subjects</h3>
          <ul>
            <li>Business prospects and leads</li>
            <li>Professional contacts</li>
            <li>Decision-makers and influencers</li>
          </ul>

          <Separator className="my-6" />

          <h2>4. Obligations of the Data Controller</h2>
          <p>The Data Controller warrants and undertakes that:</p>
          <ul>
            <li>It has the legal basis and authority to process Personal Data and to instruct AISDR to process on its behalf</li>
            <li>It complies with all applicable data protection laws, including GDPR, CCPA, and CAN-SPAM Act</li>
            <li>It has implemented appropriate consent mechanisms where required</li>
            <li>It honors data subject requests (access, deletion, rectification) in accordance with applicable law</li>
            <li>It provides clear and conspicuous unsubscribe mechanisms in all marketing emails</li>
            <li>It does not use the Service to send spam or violate anti-spam regulations</li>
          </ul>

          <Separator className="my-6" />

          <h2>5. Obligations of the Data Processor</h2>
          
          <h3>5.1 General Obligations</h3>
          <p>AISDR shall:</p>
          <ul>
            <li>Process Personal Data only on documented instructions from the Data Controller</li>
            <li>Ensure that personnel processing Personal Data are bound by confidentiality obligations</li>
            <li>Implement appropriate technical and organizational measures to ensure security (see Section 6)</li>
            <li>Engage Sub-processors only with prior written consent and under appropriate contracts</li>
            <li>Assist the Data Controller in responding to Data Subject requests</li>
            <li>Assist the Data Controller with data protection impact assessments and consultations with supervisory authorities</li>
            <li>Delete or return Personal Data upon termination of services, unless retention is required by law</li>
            <li>Make available all information necessary to demonstrate compliance with this DPA</li>
          </ul>

          <h3>5.2 Processing Instructions</h3>
          <p>
            AISDR will process Personal Data only in accordance with the Data Controller's documented instructions, which are 
            set forth in this DPA and the Terms of Service. If AISDR believes an instruction violates applicable law, it will 
            immediately inform the Data Controller.
          </p>

          <Separator className="my-6" />

          <h2>6. Technical and Organizational Measures</h2>
          <p>
            AISDR implements the following security measures to protect Personal Data:
          </p>

          <h3>6.1 Encryption</h3>
          <ul>
            <li><strong>Data at Rest</strong>: AES-256 encryption for database storage</li>
            <li><strong>Data in Transit</strong>: TLS 1.3 for all network communications</li>
            <li><strong>Credentials</strong>: AES-256-CBC encryption for mailbox credentials</li>
          </ul>

          <h3>6.2 Access Controls</h3>
          <ul>
            <li><strong>Authentication</strong>: Bcrypt password hashing (12 rounds), JWT tokens, MFA support</li>
            <li><strong>Authorization</strong>: Role-based access control (RBAC), multi-tenant isolation</li>
            <li><strong>Session Management</strong>: 30-minute idle timeout, secure HTTP-only cookies</li>
          </ul>

          <h3>6.3 Network Security</h3>
          <ul>
            <li><strong>Firewalls</strong>: Network-level protection and access restrictions</li>
            <li><strong>DDoS Protection</strong>: Cloud-based DDoS mitigation</li>
            <li><strong>Intrusion Detection</strong>: Monitoring for unauthorized access attempts</li>
          </ul>

          <h3>6.4 Application Security</h3>
          <ul>
            <li><strong>Input Validation</strong>: Zod schema validation for all API inputs</li>
            <li><strong>SQL Injection Protection</strong>: Parameterized queries via Drizzle ORM</li>
            <li><strong>CSRF Protection</strong>: Double-submit cookie pattern with secure tokens</li>
            <li><strong>XSS Protection</strong>: DOMPurify HTML sanitization, Content Security Policy headers</li>
            <li><strong>Rate Limiting</strong>: Protection against brute-force and abuse</li>
          </ul>

          <h3>6.5 Monitoring and Auditing</h3>
          <ul>
            <li><strong>Audit Logs</strong>: Comprehensive JSONB-based audit trails for all sensitive operations</li>
            <li><strong>Error Tracking</strong>: Sentry integration for real-time error monitoring</li>
            <li><strong>Security Reviews</strong>: Regular security assessments and penetration testing</li>
          </ul>

          <h3>6.6 Data Isolation</h3>
          <ul>
            <li><strong>Multi-Tenancy</strong>: User-based data isolation using RequestContext</li>
            <li><strong>Query Filtering</strong>: All database queries scoped by effective user ID</li>
            <li><strong>Secure Admin Functions</strong>: Impersonation with audit trails, respecting tenant boundaries</li>
          </ul>

          <Separator className="my-6" />

          <h2>7. Sub-processors</h2>
          
          <h3>7.1 Authorized Sub-processors</h3>
          <p>
            The Data Controller provides general authorization for AISDR to engage the following Sub-processors:
          </p>
          <ul>
            <li><strong>Apollo.io</strong> (USA): Prospect search and data enrichment</li>
            <li><strong>Lusha.io</strong> (Israel/USA): Email verification and enrichment</li>
            <li><strong>OpenAI</strong> (USA): AI-powered natural language processing</li>
            <li><strong>Anthropic</strong> (USA): AI-powered content generation</li>
            <li><strong>Neon</strong> (USA): PostgreSQL database hosting</li>
            <li><strong>Upstash</strong> (USA): Redis queue management</li>
            <li><strong>Resend</strong> (USA): Transactional email delivery</li>
            <li><strong>Amazon Web Services</strong> (USA): Cloud infrastructure</li>
            <li><strong>Sentry</strong> (USA): Error tracking and monitoring</li>
          </ul>

          <h3>7.2 Sub-processor Changes</h3>
          <p>
            AISDR will inform the Data Controller of any intended changes concerning the addition or replacement of Sub-processors 
            at least 30 days in advance. The Data Controller may object to such changes on reasonable grounds relating to data 
            protection. If no objection is raised within 30 days, the change is deemed accepted.
          </p>

          <h3>7.3 Sub-processor Obligations</h3>
          <p>
            AISDR ensures that Sub-processors are bound by data protection obligations equivalent to those set forth in this DPA, 
            including appropriate security measures and data transfer safeguards.
          </p>

          <Separator className="my-6" />

          <h2>8. Data Subject Rights</h2>
          
          <h3>8.1 Assistance with Requests</h3>
          <p>
            AISDR will assist the Data Controller in fulfilling its obligations to respond to Data Subject requests, including:
          </p>
          <ul>
            <li>Right of access (provide copy of Personal Data)</li>
            <li>Right to rectification (correct inaccurate data)</li>
            <li>Right to erasure ("right to be forgotten")</li>
            <li>Right to restriction of processing</li>
            <li>Right to data portability (export in machine-readable format)</li>
            <li>Right to object to processing</li>
          </ul>

          <h3>8.2 Data Export</h3>
          <p>
            AISDR provides a self-service Data Export feature allowing Data Controllers to export all Personal Data in 
            JSON format. This facilitates compliance with data portability and access requests.
          </p>

          <h3>8.3 Data Deletion</h3>
          <p>
            Upon request, AISDR will delete Personal Data within 30 days, except where retention is required by law or 
            legitimate interests (e.g., billing records, legal compliance).
          </p>

          <Separator className="my-6" />

          <h2>9. Data Breach Notification</h2>
          
          <h3>9.1 Notification Obligation</h3>
          <p>
            AISDR will notify the Data Controller without undue delay (and within 72 hours where feasible) after becoming 
            aware of a Personal Data breach affecting the Data Controller's data.
          </p>

          <h3>9.2 Breach Information</h3>
          <p>
            Breach notifications will include:
          </p>
          <ul>
            <li>Nature of the breach (categories and approximate number of Data Subjects affected)</li>
            <li>Contact point for more information</li>
            <li>Likely consequences of the breach</li>
            <li>Measures taken or proposed to address the breach and mitigate harm</li>
          </ul>

          <h3>9.3 Cooperation</h3>
          <p>
            AISDR will cooperate with the Data Controller and provide reasonable assistance in investigating and remedying 
            the breach, including communication with Data Subjects and supervisory authorities as required.
          </p>

          <Separator className="my-6" />

          <h2>10. International Data Transfers</h2>
          
          <h3>10.1 Transfer Mechanisms</h3>
          <p>
            Personal Data may be transferred to and processed in countries outside the EU/EEA. AISDR ensures adequate 
            protection through:
          </p>
          <ul>
            <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
            <li>Adequacy decisions for transfers to approved countries</li>
            <li>Supplementary measures as required by EDPB guidelines</li>
          </ul>

          <h3>10.2 Safeguards</h3>
          <p>
            AISDR has implemented supplementary security measures to ensure data protection in third countries, including:
          </p>
          <ul>
            <li>End-to-end encryption for data in transit</li>
            <li>AES-256 encryption for data at rest</li>
            <li>Strict access controls limiting data access</li>
            <li>Contractual commitments from Sub-processors in third countries</li>
          </ul>

          <Separator className="my-6" />

          <h2>11. Audits and Compliance</h2>
          
          <h3>11.1 Right to Audit</h3>
          <p>
            The Data Controller has the right to audit AISDR's compliance with this DPA, subject to:
          </p>
          <ul>
            <li>Reasonable advance notice (at least 30 days)</li>
            <li>Execution of a confidentiality agreement</li>
            <li>Limitation to one audit per year (unless required by supervisory authority)</li>
            <li>Reimbursement of reasonable costs incurred by AISDR</li>
          </ul>

          <h3>11.2 Compliance Documentation</h3>
          <p>
            AISDR will provide the Data Controller with documentation demonstrating compliance with this DPA, including:
          </p>
          <ul>
            <li>Security implementation documentation and code reviews</li>
            <li>OWASP Top 10 security assessment results (96/100 score)</li>
            <li>Sub-processor agreements and compliance attestations</li>
          </ul>
          <p className="text-sm text-muted-foreground italic mt-4">
            <strong>Note:</strong> SOC 2 Type II certification and formal penetration testing are planned for future releases. 
            Current security measures include comprehensive CSRF/XSS protection, encryption, audit logging, and multi-tenant 
            isolation as documented in our security assessment.
          </p>

          <Separator className="my-6" />

          <h2>12. Data Retention and Deletion</h2>
          
          <h3>12.1 Retention Period</h3>
          <p>
            AISDR retains Personal Data for as long as the Data Controller maintains an active account and subscription, 
            plus any period required by law or for legitimate business purposes (e.g., billing, legal compliance).
          </p>

          <h3>12.2 Deletion upon Termination</h3>
          <p>
            Upon termination of the subscription or at the Data Controller's request, AISDR will:
          </p>
          <ul>
            <li>Delete all Personal Data within 30 days</li>
            <li>Provide written certification of deletion upon request</li>
            <li>Retain only what is required by applicable law or regulation</li>
          </ul>

          <h3>12.3 Backup Retention</h3>
          <p>
            Personal Data in backup systems will be deleted in accordance with standard backup retention policies, 
            typically within 90 days of the primary deletion.
          </p>

          <Separator className="my-6" />

          <h2>13. Liability and Indemnification</h2>
          
          <h3>13.1 Liability</h3>
          <p>
            Each party's liability under this DPA is subject to the limitations and exclusions set forth in the Terms of Service, 
            except where GDPR or other applicable law requires unlimited liability.
          </p>

          <h3>13.2 Indemnification</h3>
          <p>
            AISDR will indemnify the Data Controller for direct damages resulting from AISDR's breach of this DPA, subject to 
            the limitations in the Terms of Service and applicable law.
          </p>

          <Separator className="my-6" />

          <h2>14. Term and Termination</h2>
          
          <h3>14.1 Effective Date and Term</h3>
          <p>
            This DPA takes effect on the date the Data Controller first uses the Service and continues for as long as 
            AISDR processes Personal Data on behalf of the Data Controller.
          </p>

          <h3>14.2 Termination</h3>
          <p>
            This DPA will terminate automatically upon termination of the Terms of Service or cessation of all Personal Data 
            processing activities.
          </p>

          <h3>14.3 Survival</h3>
          <p>
            Sections relating to data deletion, confidentiality, liability, and audit rights survive termination.
          </p>

          <Separator className="my-6" />

          <h2>15. Amendments</h2>
          <p>
            AISDR may update this DPA to reflect changes in law, regulation, or business practices. Material changes will be 
            communicated to the Data Controller at least 30 days in advance.
          </p>

          <Separator className="my-6" />

          <h2>16. Governing Law and Jurisdiction</h2>
          <p>
            This DPA is governed by the laws specified in the Terms of Service. For EU/EEA Data Controllers, disputes will be 
            resolved in accordance with GDPR requirements, including the jurisdiction of the Data Controller's supervisory authority.
          </p>

          <Separator className="my-6" />

          <h2>17. Contact Information</h2>
          <p>
            For questions or requests related to this DPA, please contact:
          </p>
          <ul>
            <li><strong>Data Protection Officer</strong>: dpo@aisdr.example.com</li>
            <li><strong>Legal Department</strong>: legal@aisdr.example.com</li>
            <li><strong>Mailing Address</strong>: 123 Business St, San Francisco, CA 94102</li>
          </ul>

          <Separator className="my-6" />

          <p className="text-sm text-muted-foreground italic">
            By using the AISDR Service, the Data Controller agrees to the terms of this Data Processing Agreement. This DPA 
            forms an integral part of the Terms of Service and is binding on both parties.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function CookiePolicyPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Cookie Policy</CardTitle>
          <p className="text-muted-foreground">Last Updated: November 19, 2024</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <h2>1. What Are Cookies?</h2>
          <p>
            Cookies are small text files that are stored on your device (computer, tablet, or mobile) when you visit a website. 
            They help websites remember your actions and preferences over a period of time, enhancing your user experience.
          </p>

          <Separator className="my-6" />

          <h2>2. How We Use Cookies</h2>
          <p>
            AISDR uses cookies and similar tracking technologies to provide, protect, and improve our Service. We use cookies for:
          </p>
          <ul>
            <li><strong>Authentication</strong>: To keep you logged in and verify your identity</li>
            <li><strong>Security</strong>: To protect against fraud and enhance security</li>
            <li><strong>Preferences</strong>: To remember your settings and preferences</li>
            <li><strong>Analytics</strong>: To understand how you use our Service</li>
            <li><strong>Performance</strong>: To monitor and improve Service performance</li>
          </ul>

          <Separator className="my-6" />

          <h2>3. Types of Cookies We Use</h2>

          <h3>3.1 Strictly Necessary Cookies</h3>
          <p>
            These cookies are essential for the Service to function and cannot be disabled. They include:
          </p>
          
          <Table className="my-4">
            <TableHeader>
              <TableRow>
                <TableHead>Cookie Name</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs">auth_token</TableCell>
                <TableCell>Maintains your login session</TableCell>
                <TableCell>7 days</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">x-csrf-token</TableCell>
                <TableCell>Protects against CSRF attacks</TableCell>
                <TableCell>7 days</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">sidebar_state</TableCell>
                <TableCell>Remembers sidebar collapsed/expanded state</TableCell>
                <TableCell>7 days</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <h3>3.2 Functional Cookies</h3>
          <p>
            These cookies enable enhanced functionality and personalization:
          </p>
          
          <Table className="my-4">
            <TableHeader>
              <TableRow>
                <TableHead>Cookie Name</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs">theme</TableCell>
                <TableCell>Stores your dark/light mode preference</TableCell>
                <TableCell>1 year</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">onboarding_completed</TableCell>
                <TableCell>Tracks onboarding wizard completion</TableCell>
                <TableCell>Session</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <h3>3.3 Analytics Cookies</h3>
          <p>
            These cookies help us understand how users interact with our Service:
          </p>
          
          <Table className="my-4">
            <TableHeader>
              <TableRow>
                <TableHead>Cookie Name</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs">_ga</TableCell>
                <TableCell>Google Analytics - distinguishes users</TableCell>
                <TableCell>2 years</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">_gid</TableCell>
                <TableCell>Google Analytics - distinguishes users</TableCell>
                <TableCell>24 hours</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">sentry-sc</TableCell>
                <TableCell>Sentry error tracking session</TableCell>
                <TableCell>Session</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <h3>3.4 Security Cookies</h3>
          <p>
            These cookies help protect your account and data:
          </p>
          
          <Table className="my-4">
            <TableHeader>
              <TableRow>
                <TableHead>Cookie Name</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs">rate_limit</TableCell>
                <TableCell>Rate limiting to prevent abuse</TableCell>
                <TableCell>15 minutes</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">session_id</TableCell>
                <TableCell>Session identification for security</TableCell>
                <TableCell>30 minutes</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Separator className="my-6" />

          <h2>4. Cookie Attributes</h2>
          <p>Our cookies are configured with the following security attributes:</p>
          <ul>
            <li><strong>HttpOnly</strong>: Prevents JavaScript access to cookies (security)</li>
            <li><strong>Secure</strong>: Cookies only sent over HTTPS in production</li>
            <li><strong>SameSite=Strict</strong>: Prevents CSRF attacks in production</li>
            <li><strong>SameSite=Lax</strong>: Balances security and functionality in development</li>
          </ul>

          <Separator className="my-6" />

          <h2>5. Third-Party Cookies</h2>
          <p>
            We use services from trusted third parties that may set their own cookies:
          </p>
          <ul>
            <li><strong>Google Analytics</strong>: For usage analytics and insights</li>
            <li><strong>Sentry</strong>: For error tracking and monitoring</li>
            <li><strong>Stripe</strong>: For payment processing (when applicable)</li>
          </ul>
          <p>
            These third parties have their own privacy policies governing their use of cookies. We recommend reviewing 
            their policies for more information.
          </p>

          <Separator className="my-6" />

          <h2>6. Managing Cookies</h2>
          
          <h3>6.1 Browser Controls</h3>
          <p>
            Most browsers allow you to manage cookies through their settings. You can:
          </p>
          <ul>
            <li>View cookies stored on your device</li>
            <li>Delete cookies individually or all at once</li>
            <li>Block cookies from specific websites</li>
            <li>Block all cookies (may impact functionality)</li>
          </ul>

          <h3>6.2 Browser-Specific Instructions</h3>
          <ul>
            <li><strong>Chrome</strong>: Settings → Privacy and Security → Cookies</li>
            <li><strong>Firefox</strong>: Settings → Privacy & Security → Cookies and Site Data</li>
            <li><strong>Safari</strong>: Preferences → Privacy → Manage Website Data</li>
            <li><strong>Edge</strong>: Settings → Cookies and Site Permissions</li>
          </ul>

          <h3>6.3 Impact of Disabling Cookies</h3>
          <p>
            If you disable cookies, some features of our Service may not function properly:
          </p>
          <ul>
            <li>You will need to log in each time you visit</li>
            <li>Your preferences will not be saved</li>
            <li>Some features may be unavailable</li>
            <li>CSRF protection may prevent form submissions</li>
          </ul>

          <Separator className="my-6" />

          <h2>7. Do Not Track Signals</h2>
          <p>
            Some browsers support "Do Not Track" (DNT) signals. Currently, there is no industry standard for responding 
            to DNT signals. We do not respond to DNT signals at this time, but we may revisit this as standards develop.
          </p>

          <Separator className="my-6" />

          <h2>8. Local Storage and Session Storage</h2>
          <p>
            In addition to cookies, we use browser storage technologies:
          </p>
          <ul>
            <li><strong>Local Storage</strong>: Stores user preferences and cached data (persistent)</li>
            <li><strong>Session Storage</strong>: Stores temporary session data (cleared when browser closes)</li>
          </ul>
          <p>
            These technologies serve similar purposes to cookies but are managed differently by your browser.
          </p>

          <Separator className="my-6" />

          <h2>9. Updates to This Policy</h2>
          <p>
            We may update this Cookie Policy to reflect changes in our practices or for legal, operational, or regulatory reasons. 
            We will notify you of material changes by updating the "Last Updated" date and posting the revised policy on our website.
          </p>

          <Separator className="my-6" />

          <h2>10. Contact Us</h2>
          <p>
            If you have questions about our use of cookies, please contact us at:
          </p>
          <ul>
            <li><strong>Email</strong>: privacy@aisdr.example.com</li>
            <li><strong>Mailing Address</strong>: 123 Business St, San Francisco, CA 94102</li>
          </ul>

          <p className="text-sm text-muted-foreground italic mt-8">
            By continuing to use our Service, you consent to our use of cookies as described in this Cookie Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

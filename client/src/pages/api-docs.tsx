import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Code, Lock, Zap, Shield, Info, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { Breadcrumbs } from '@/components/breadcrumbs';

export default function APIDocumentationPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <Breadcrumbs />
      
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-4xl font-bold mb-2">API Documentation</h1>
            <p className="text-muted-foreground text-lg">
              Complete reference for the SDR Platform REST API
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 mb-8 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Base URL</CardTitle>
            <Code className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">/api</div>
            <p className="text-xs text-muted-foreground mt-1">All endpoints are relative to this base</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Authentication</CardTitle>
            <Lock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Bearer Token</div>
            <p className="text-xs text-muted-foreground mt-1">HTTP-only cookies + JWT</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rate Limits</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">100/min</div>
            <p className="text-xs text-muted-foreground mt-1">Per authenticated user</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Authentication
          </CardTitle>
          <CardDescription>
            All API requests require authentication except for public endpoints like login and password reset
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Bearer Token Authentication</h4>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm" data-testid="code-auth-header">
              <code>Authorization: Bearer YOUR_JWT_TOKEN</code>
            </pre>
          </div>
          
          <div>
            <h4 className="font-semibold mb-2">Cookie Authentication</h4>
            <p className="text-sm text-muted-foreground mb-2">
              After login, a secure HTTP-only cookie is automatically set with the following properties:
            </p>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>Name: <code className="text-foreground">auth_token</code></li>
              <li>HttpOnly: true (prevents JavaScript access)</li>
              <li>Secure: true (HTTPS only in production)</li>
              <li>SameSite: strict (CSRF protection)</li>
              <li>Max-Age: 7 days</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Session Management</h4>
            <p className="text-sm text-muted-foreground">
              Sessions expire after 30 minutes of inactivity. Use the <code>/api/auth/refresh</code> endpoint to refresh your session.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="auth" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:grid-cols-10">
          <TabsTrigger value="auth">Auth</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="prospects">Prospects</TabsTrigger>
          <TabsTrigger value="sequences">Sequences</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="export">Data Export</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        <TabsContent value="auth" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Authentication Endpoints</CardTitle>
              <CardDescription>User authentication, session management, and password reset</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <EndpointDoc
                    method="POST"
                    path="/api/auth/login"
                    description="Authenticate a user and create a session"
                    auth={false}
                    rateLimit="5 requests per 15 minutes"
                    request={{
                      email: "user@example.com",
                      password: "SecurePassword123!"
                    }}
                    response={{
                      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                      expiresAt: "2024-11-26T12:00:00Z",
                      userId: "123"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/auth/refresh"
                    description="Refresh an expired session token"
                    auth={true}
                    response={{
                      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                      expiresAt: "2024-11-26T12:00:00Z",
                      userId: "123"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/auth/logout"
                    description="Terminate the current session"
                    auth={true}
                    response={{
                      message: "Logged out successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/auth/me"
                    description="Get current authenticated user information"
                    auth={true}
                    response={{
                      id: "123",
                      email: "user@example.com",
                      firstName: "John",
                      lastName: "Doe",
                      role: "user",
                      emailVerified: true,
                      onboardingCompleted: true
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/auth/forgot-password"
                    description="Request a password reset email"
                    auth={false}
                    rateLimit="5 requests per 15 minutes"
                    request={{
                      email: "user@example.com"
                    }}
                    response={{
                      success: true,
                      message: "If an account with that email exists, we sent a password reset link."
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/auth/reset-password"
                    description="Reset password using a token from email"
                    auth={false}
                    request={{
                      token: "reset_token_from_email",
                      newPassword: "NewSecurePassword123!"
                    }}
                    response={{
                      success: true,
                      message: "Password reset successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/auth/change-password"
                    description="Change password for authenticated user"
                    auth={true}
                    request={{
                      currentPassword: "OldPassword123!",
                      newPassword: "NewPassword123!"
                    }}
                    response={{
                      message: "Password changed successfully. Please log in again."
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/auth/sessions"
                    description="Get all active sessions for the current user"
                    auth={true}
                    response={[
                      {
                        id: "session_123",
                        userId: "123",
                        ipAddress: "192.168.1.1",
                        userAgent: "Mozilla/5.0...",
                        lastActivity: "2024-11-19T12:00:00Z",
                        expiresAt: "2024-11-26T12:00:00Z"
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="DELETE"
                    path="/api/auth/sessions/:sessionId"
                    description="Revoke a specific session"
                    auth={true}
                    response={{
                      message: "Session terminated successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/auth/invitations"
                    description="Create and send a user invitation (Admin only)"
                    auth={true}
                    adminOnly={true}
                    rateLimit="10 requests per hour"
                    request={{
                      email: "newuser@example.com",
                      role: "user"
                    }}
                    response={{
                      message: "Invitation sent successfully",
                      inviteUrl: "https://app.example.com/accept-invitation?token=..."
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/auth/invitations/accept"
                    description="Accept an invitation and create account"
                    auth={false}
                    request={{
                      token: "invitation_token",
                      firstName: "John",
                      lastName: "Doe",
                      password: "SecurePassword123!"
                    }}
                    response={{
                      message: "Invitation accepted successfully",
                      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                      user: {
                        id: "123",
                        email: "newuser@example.com",
                        firstName: "John",
                        lastName: "Doe",
                        role: "user"
                      }
                    }}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management Endpoints</CardTitle>
              <CardDescription>Manage user accounts and profiles</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <EndpointDoc
                    method="GET"
                    path="/api/users"
                    description="List all users (Admin only)"
                    auth={true}
                    adminOnly={true}
                    queryParams={[
                      { name: "role", type: "string", description: "Filter by role (admin/user)" },
                      { name: "page", type: "number", description: "Page number for pagination" },
                      { name: "limit", type: "number", description: "Items per page" }
                    ]}
                    response={{
                      users: [
                        {
                          id: "123",
                          email: "user@example.com",
                          firstName: "John",
                          lastName: "Doe",
                          role: "user",
                          emailVerified: true,
                          createdAt: "2024-01-01T00:00:00Z"
                        }
                      ],
                      total: 1,
                      page: 1,
                      limit: 50
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/users/:id"
                    description="Get user details (Admin or self)"
                    auth={true}
                    response={{
                      id: "123",
                      email: "user@example.com",
                      firstName: "John",
                      lastName: "Doe",
                      role: "user",
                      emailVerified: true,
                      onboardingCompleted: true,
                      createdAt: "2024-01-01T00:00:00Z"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="PATCH"
                    path="/api/users/profile/me"
                    description="Update current user's profile"
                    auth={true}
                    request={{
                      firstName: "John",
                      lastName: "Doe"
                    }}
                    response={{
                      id: "123",
                      email: "user@example.com",
                      firstName: "John",
                      lastName: "Doe",
                      role: "user"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="PATCH"
                    path="/api/users/:id"
                    description="Update user information (Admin only)"
                    auth={true}
                    adminOnly={true}
                    request={{
                      firstName: "Jane",
                      lastName: "Smith",
                      role: "admin"
                    }}
                    response={{
                      id: "123",
                      email: "user@example.com",
                      firstName: "Jane",
                      lastName: "Smith",
                      role: "admin"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="DELETE"
                    path="/api/users/:id"
                    description="Soft delete a user (Admin only)"
                    auth={true}
                    adminOnly={true}
                    response={{
                      message: "User deleted successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/users/:id/reactivate"
                    description="Reactivate a deactivated user (Admin only)"
                    auth={true}
                    adminOnly={true}
                    response={{
                      message: "User reactivated successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/users/:id/audit-logs"
                    description="Get audit logs for a user (Admin only)"
                    auth={true}
                    adminOnly={true}
                    response={[
                      {
                        id: "log_123",
                        userId: "123",
                        action: "LOGIN_SUCCESS",
                        category: "auth",
                        metadata: { ipAddress: "192.168.1.1" },
                        createdAt: "2024-11-19T12:00:00Z"
                      }
                    ]}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prospects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Prospect Endpoints</CardTitle>
              <CardDescription>Search, enrich, and manage prospects</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <EndpointDoc
                    method="POST"
                    path="/api/ai-search"
                    description="Search prospects using natural language query"
                    auth={true}
                    request={{
                      query: "Find software engineers at Y Combinator companies in San Francisco",
                      includeLocalProspects: true
                    }}
                    response={{
                      search: {
                        id: "search_123",
                        query: "Find software engineers...",
                        aiFilters: {},
                        apolloFilters: {}
                      },
                      localProspectsCount: 15,
                      localProspects: [],
                      job: { id: "job_123", status: "pending" }
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/apollo-search"
                    description="Direct Apollo.io contact search"
                    auth={true}
                    request={{
                      apolloFilters: {
                        person_titles: ["Software Engineer"],
                        person_locations: ["San Francisco, CA"]
                      },
                      page: 1,
                      per_page: 50
                    }}
                    response={{
                      people: [],
                      pagination: {
                        total: 1500,
                        page: 1,
                        per_page: 50
                      }
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/import/csv"
                    description="Import prospects from CSV file"
                    auth={true}
                    request="multipart/form-data with 'file' field"
                    response={{
                      message: "CSV uploaded successfully",
                      job: { id: "job_123", status: "pending" }
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/prospects"
                    description="List all prospects for authenticated user"
                    auth={true}
                    queryParams={[
                      { name: "page", type: "number", description: "Page number" },
                      { name: "limit", type: "number", description: "Items per page" },
                      { name: "search", type: "string", description: "Search by name or email" }
                    ]}
                    response={{
                      prospects: [],
                      total: 150,
                      page: 1,
                      limit: 50
                    }}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sequences" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sequence Endpoints</CardTitle>
              <CardDescription>Create and manage email sequences</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <EndpointDoc
                    method="GET"
                    path="/api/sequences"
                    description="List all sequences"
                    auth={true}
                    response={[
                      {
                        id: "seq_123",
                        name: "Cold Outreach Campaign",
                        status: "active",
                        steps: 4,
                        enrolled: 50,
                        createdAt: "2024-11-01T00:00:00Z"
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/sequences"
                    description="Create a new email sequence"
                    auth={true}
                    request={{
                      name: "Product Launch Campaign",
                      description: "Outreach for new product",
                      steps: [
                        {
                          subject: "Introducing our new product",
                          body: "<p>Hi {{firstName}},</p><p>I wanted to share...</p>",
                          delayDays: 0
                        }
                      ]
                    }}
                    response={{
                      id: "seq_123",
                      name: "Product Launch Campaign",
                      status: "draft",
                      createdAt: "2024-11-19T12:00:00Z"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/sequences/from-template"
                    description="Create sequence from pre-built template"
                    auth={true}
                    request={{
                      templateId: "cold_outreach",
                      name: "My Cold Outreach",
                      customization: {
                        companyName: "Acme Inc",
                        productName: "AcmeSDR"
                      }
                    }}
                    response={{
                      id: "seq_123",
                      name: "My Cold Outreach",
                      steps: 4
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/sequences/ai-generate-email"
                    description="Generate a single email using AI"
                    auth={true}
                    request={{
                      prompt: "Write a cold email for a SaaS sales automation tool",
                      tone: "professional"
                    }}
                    response={{
                      subject: "Transform Your Sales Process",
                      body: "<p>Hi there,</p><p>I noticed your team...</p>"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/sequences/:id/prospects"
                    description="Enroll prospects into a sequence"
                    auth={true}
                    request={{
                      prospectIds: ["prospect_1", "prospect_2", "prospect_3"]
                    }}
                    response={{
                      enrolled: 3,
                      message: "3 prospects enrolled successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/sequences/:id/tracking"
                    description="Get email tracking statistics for a sequence"
                    auth={true}
                    response={{
                      sent: 150,
                      delivered: 145,
                      opened: 78,
                      clicked: 23,
                      replied: 12,
                      bounced: 5
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/sequences/enhanced-personalization"
                    description="Generate AI-personalized emails for multiple prospects"
                    auth={true}
                    request={{
                      prospectIds: ["prospect_1", "prospect_2"],
                      template: "Hi {{firstName}}, I noticed...",
                      aiInstructions: "Focus on their recent achievements"
                    }}
                    response={{
                      results: [
                        {
                          prospectId: "prospect_1",
                          personalizedEmail: "<p>Hi John, I saw your recent promotion...</p>",
                          insights: ["Recently promoted", "Active on LinkedIn"]
                        }
                      ]
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="DELETE"
                    path="/api/sequences/:id"
                    description="Delete a sequence and all associated data"
                    auth={true}
                    response={{
                      message: "Sequence deleted successfully"
                    }}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Automation Endpoints</CardTitle>
              <CardDescription>Manage autonomous prospect import and enrollment</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <EndpointDoc
                    method="POST"
                    path="/api/automation/start"
                    description="Start a new automation run"
                    auth={true}
                    request={{
                      name: "Weekly Tech Lead Outreach",
                      apolloFilters: {
                        person_titles: ["CTO", "VP Engineering"],
                        person_locations: ["San Francisco, CA"]
                      },
                      sequenceId: "seq_123",
                      prospectCount: 100,
                      schedule: "2024-11-20T09:00:00Z"
                    }}
                    response={{
                      id: "auto_123",
                      name: "Weekly Tech Lead Outreach",
                      status: "scheduled",
                      scheduledFor: "2024-11-20T09:00:00Z"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/automation/list"
                    description="List all automation runs"
                    auth={true}
                    response={[
                      {
                        id: "auto_123",
                        name: "Weekly Tech Lead Outreach",
                        status: "completed",
                        prospectsImported: 95,
                        prospectsEnrolled: 90,
                        createdAt: "2024-11-15T00:00:00Z",
                        completedAt: "2024-11-15T01:30:00Z"
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/automation/:id/pause"
                    description="Pause a running automation"
                    auth={true}
                    response={{
                      id: "auto_123",
                      status: "paused",
                      message: "Automation paused successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/automation/:id/resume"
                    description="Resume a paused automation"
                    auth={true}
                    response={{
                      id: "auto_123",
                      status: "running",
                      message: "Automation resumed successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/automation/:id/cancel"
                    description="Cancel a scheduled automation"
                    auth={true}
                    response={{
                      message: "Automation cancelled successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/automation/:id/prospects"
                    description="Get prospects imported by an automation run"
                    auth={true}
                    response={{
                      prospects: [],
                      total: 95,
                      imported: 95,
                      enrolled: 90,
                      failed: 5
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/automation/:id/errors"
                    description="Get error logs for an automation run"
                    auth={true}
                    response={[
                      {
                        prospectId: "prospect_123",
                        error: "Email enrichment failed",
                        timestamp: "2024-11-15T01:15:00Z"
                      }
                    ]}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mailboxes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mailbox Endpoints</CardTitle>
              <CardDescription>Manage email sending accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <EndpointDoc
                    method="GET"
                    path="/api/mailboxes"
                    description="List all mailboxes"
                    auth={true}
                    response={[
                      {
                        id: "mailbox_123",
                        email: "sales@company.com",
                        provider: "gmail",
                        status: "active",
                        dailyLimit: 50,
                        sentToday: 23,
                        isDefault: true
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/mailboxes"
                    description="Add a new mailbox"
                    auth={true}
                    request={{
                      email: "outreach@company.com",
                      provider: "gmail",
                      smtpHost: "smtp.gmail.com",
                      smtpPort: 587,
                      smtpUsername: "outreach@company.com",
                      smtpPassword: "app_password_here",
                      dailyLimit: 50
                    }}
                    response={{
                      id: "mailbox_123",
                      email: "outreach@company.com",
                      status: "active",
                      message: "Mailbox added successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/mailboxes/:id/test"
                    description="Test mailbox connection"
                    auth={true}
                    response={{
                      success: true,
                      message: "Connection successful"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/mailboxes/:id/set-default"
                    description="Set a mailbox as default"
                    auth={true}
                    response={{
                      message: "Default mailbox updated successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="DELETE"
                    path="/api/mailboxes/:id"
                    description="Delete a mailbox"
                    auth={true}
                    response={{
                      message: "Mailbox deleted successfully"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/email-queue/stats"
                    description="Get email queue statistics"
                    auth={true}
                    response={{
                      pending: 45,
                      processing: 3,
                      completed: 1250,
                      failed: 12
                    }}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Endpoints</CardTitle>
              <CardDescription>Access platform analytics and metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <EndpointDoc
                    method="GET"
                    path="/api/analytics/overview"
                    description="Get overall analytics overview"
                    auth={true}
                    response={{
                      totalProspects: 1250,
                      totalSequences: 12,
                      emailsSent: 4500,
                      avgOpenRate: 35.5,
                      avgReplyRate: 8.2
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/analytics/time-series"
                    description="Get time-series analytics data"
                    auth={true}
                    queryParams={[
                      { name: "startDate", type: "string", description: "Start date (ISO 8601)" },
                      { name: "endDate", type: "string", description: "End date (ISO 8601)" },
                      { name: "metric", type: "string", description: "Metric to track (emails_sent, opens, replies)" }
                    ]}
                    response={[
                      {
                        date: "2024-11-01",
                        value: 150
                      },
                      {
                        date: "2024-11-02",
                        value: 175
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/analytics/sequence-performance"
                    description="Get performance metrics for email sequences"
                    auth={true}
                    response={[
                      {
                        sequenceId: "seq_123",
                        name: "Cold Outreach",
                        sent: 500,
                        opened: 180,
                        replied: 45,
                        openRate: 36.0,
                        replyRate: 9.0
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/analytics/usage-metrics"
                    description="Get usage metrics for last 30 days"
                    auth={true}
                    response={{
                      searches: 45,
                      prospectsAdded: 850,
                      emailsSent: 1200,
                      sequencesCreated: 5,
                      apiCallsCount: 2500
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/analytics/activity-logs"
                    description="Get recent user activity logs"
                    auth={true}
                    queryParams={[
                      { name: "limit", type: "number", description: "Number of logs to return" }
                    ]}
                    response={[
                      {
                        id: "log_123",
                        action: "SEQUENCE_CREATED",
                        description: "Created sequence 'Cold Outreach'",
                        timestamp: "2024-11-19T10:30:00Z"
                      }
                    ]}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Export Endpoints</CardTitle>
              <CardDescription>GDPR-compliant data export in CSV and JSON formats</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="h-5 w-5 mt-0.5 text-blue-500" />
                      <div className="text-sm">
                        <p className="font-semibold mb-1">GDPR Compliance</p>
                        <p className="text-muted-foreground">
                          All export endpoints respect multi-tenant isolation and admin impersonation. 
                          Data exports include only information accessible to the authenticated user.
                        </p>
                      </div>
                    </div>
                  </div>

                  <EndpointDoc
                    method="GET"
                    path="/api/export/prospects/csv"
                    description="Export prospects as CSV"
                    auth={true}
                    response="CSV file download with headers: ID, Name, Email, Company, Title, Location, etc."
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/export/prospects/json"
                    description="Export prospects as JSON"
                    auth={true}
                    response={[
                      {
                        id: "prospect_123",
                        firstName: "John",
                        lastName: "Doe",
                        email: "john@company.com",
                        company: "Acme Inc",
                        title: "CTO"
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/export/sequences/csv"
                    description="Export sequences as CSV"
                    auth={true}
                    response="CSV file with sequence details and step counts"
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/export/emails/csv"
                    description="Export email activity log as CSV"
                    auth={true}
                    response="CSV file with send logs, delivery status, opens, clicks"
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/export/replies/csv"
                    description="Export email replies as CSV"
                    auth={true}
                    response="CSV file with received replies and sentiment analysis"
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/export/analytics/csv"
                    description="Export search history and analytics as CSV"
                    auth={true}
                    response="CSV file with search queries and results"
                  />

                  <Separator />

                  <EndpointDoc
                    method="GET"
                    path="/api/export/account/full"
                    description="Export complete account data as JSON (GDPR full export)"
                    auth={true}
                    response={{
                      user: {},
                      prospects: [],
                      sequences: [],
                      emails: [],
                      replies: [],
                      analytics: [],
                      exportedAt: "2024-11-19T12:00:00Z"
                    }}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Library & ICP Templates</CardTitle>
              <CardDescription>Manage reusable email templates and ideal customer profiles</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <div className="font-semibold text-lg">Content Library</div>
                  
                  <EndpointDoc
                    method="GET"
                    path="/api/content-library"
                    description="Get all content library items"
                    auth={true}
                    response={[
                      {
                        id: "content_123",
                        name: "Cold Email Template",
                        type: "email_template",
                        content: "<p>Template content...</p>",
                        tags: ["cold", "outreach"]
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/content-library"
                    description="Create a new content library item"
                    auth={true}
                    request={{
                      name: "Follow-up Template",
                      type: "email_template",
                      content: "<p>Hi {{firstName}},</p>",
                      tags: ["follow-up"]
                    }}
                    response={{
                      id: "content_123",
                      name: "Follow-up Template",
                      createdAt: "2024-11-19T12:00:00Z"
                    }}
                  />

                  <Separator />

                  <div className="font-semibold text-lg mt-8">ICP Templates</div>

                  <EndpointDoc
                    method="GET"
                    path="/api/icp-templates"
                    description="Get all ICP templates"
                    auth={true}
                    response={[
                      {
                        id: "icp_123",
                        name: "Enterprise SaaS Buyers",
                        criteria: {
                          titles: ["CTO", "VP Engineering"],
                          companySize: "51-200",
                          industries: ["Software"]
                        }
                      }
                    ]}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/api/icp-templates"
                    description="Create a new ICP template"
                    auth={true}
                    request={{
                      name: "Startup Founders",
                      criteria: {
                        titles: ["CEO", "Founder"],
                        companySize: "1-10",
                        fundingStage: ["seed", "series-a"]
                      }
                    }}
                    response={{
                      id: "icp_123",
                      name: "Startup Founders",
                      createdAt: "2024-11-19T12:00:00Z"
                    }}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Endpoints</CardTitle>
              <CardDescription>Receive real-time notifications for email events</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-6">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Shield className="h-5 w-5 mt-0.5 text-amber-500" />
                      <div className="text-sm">
                        <p className="font-semibold mb-1">Security Note</p>
                        <p className="text-muted-foreground">
                          Webhook endpoints are intended for external service integrations. 
                          Ensure proper authentication and validation for production use.
                        </p>
                      </div>
                    </div>
                  </div>

                  <EndpointDoc
                    method="POST"
                    path="/webhooks/email-reply"
                    description="Handle incoming email replies"
                    auth={false}
                    request={{
                      from: "prospect@company.com",
                      to: "sales@yourcompany.com",
                      subject: "Re: Your proposal",
                      body: "Thanks for reaching out...",
                      receivedAt: "2024-11-19T12:00:00Z"
                    }}
                    response={{
                      success: true,
                      replyId: "reply_123",
                      matched: true,
                      sentiment: "positive"
                    }}
                  />

                  <Separator />

                  <EndpointDoc
                    method="POST"
                    path="/webhooks/email-opened"
                    description="Record email open events"
                    auth={false}
                    request={{
                      emailId: "email_123",
                      prospectId: "prospect_123",
                      openedAt: "2024-11-19T12:00:00Z",
                      ipAddress: "192.168.1.1",
                      userAgent: "Mozilla/5.0..."
                    }}
                    response={{
                      success: true,
                      message: "Open event recorded"
                    }}
                  />
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Additional Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Rate Limiting</h4>
            <ul className="text-sm space-y-1 list-disc list-inside text-muted-foreground">
              <li>General API: 100 requests per minute per user</li>
              <li>Login endpoint: 5 requests per 15 minutes</li>
              <li>Password reset: 5 requests per 15 minutes</li>
              <li>User invitations: 10 requests per hour</li>
            </ul>
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold mb-2">Error Responses</h4>
            <p className="text-sm text-muted-foreground mb-3">
              All errors return a consistent JSON format:
            </p>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm" data-testid="code-error-response">
              <code>{JSON.stringify({
                error: "Error message describing what went wrong",
                details: ["Optional array of validation errors"]
              }, null, 2)}</code>
            </pre>
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold mb-2">HTTP Status Codes</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li><code className="text-foreground">200</code> - Success</li>
              <li><code className="text-foreground">201</code> - Created</li>
              <li><code className="text-foreground">400</code> - Bad Request (validation error)</li>
              <li><code className="text-foreground">401</code> - Unauthorized (authentication required)</li>
              <li><code className="text-foreground">403</code> - Forbidden (insufficient permissions)</li>
              <li><code className="text-foreground">404</code> - Not Found</li>
              <li><code className="text-foreground">429</code> - Too Many Requests (rate limit exceeded)</li>
              <li><code className="text-foreground">500</code> - Internal Server Error</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface EndpointDocProps {
  method: string;
  path: string;
  description: string;
  auth: boolean;
  adminOnly?: boolean;
  rateLimit?: string;
  queryParams?: Array<{ name: string; type: string; description: string }>;
  request?: any;
  response?: any;
}

function EndpointDoc({
  method,
  path,
  description,
  auth,
  adminOnly,
  rateLimit,
  queryParams,
  request,
  response
}: EndpointDocProps) {
  const methodColors = {
    GET: 'bg-blue-500',
    POST: 'bg-green-500',
    PUT: 'bg-yellow-500',
    PATCH: 'bg-orange-500',
    DELETE: 'bg-red-500'
  };

  return (
    <div className="space-y-3" data-testid={`endpoint-${method.toLowerCase()}-${path.replace(/\//g, '-')}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className={`${methodColors[method as keyof typeof methodColors]} text-white font-mono`}>
          {method}
        </Badge>
        <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{path}</code>
        {auth && <Badge variant="outline" className="flex items-center gap-1"><Lock className="h-3 w-3" /> Auth Required</Badge>}
        {adminOnly && <Badge variant="destructive">Admin Only</Badge>}
        {rateLimit && <Badge variant="secondary" className="flex items-center gap-1"><Zap className="h-3 w-3" /> {rateLimit}</Badge>}
      </div>

      <p className="text-sm text-muted-foreground">{description}</p>

      {queryParams && queryParams.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold mb-2">Query Parameters</h5>
          <div className="space-y-1">
            {queryParams.map((param) => (
              <div key={param.name} className="text-sm">
                <code className="text-foreground">{param.name}</code>
                <span className="text-muted-foreground"> ({param.type})</span>
                <span className="text-muted-foreground"> - {param.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {request && (
        <div>
          <h5 className="text-sm font-semibold mb-2">Request Body</h5>
          <pre className="bg-muted p-3 rounded-lg overflow-x-auto text-xs">
            <code>{typeof request === 'string' ? request : JSON.stringify(request, null, 2)}</code>
          </pre>
        </div>
      )}

      {response && (
        <div>
          <h5 className="text-sm font-semibold mb-2">Response</h5>
          <pre className="bg-muted p-3 rounded-lg overflow-x-auto text-xs">
            <code>{typeof response === 'string' ? response : JSON.stringify(response, null, 2)}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

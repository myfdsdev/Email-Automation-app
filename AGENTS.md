## Imported Claude Cowork project instructions

Build a production-ready full-stack SaaS application called **Email Automation** using the MERN stack.

The application must allow users to connect Gmail and Brevo, manage contacts, create personalized email campaigns, build automated follow-up sequences, track email activity, detect replies, classify interested leads, and manage email conversations from a unified dashboard.

Do not build only static screens or dummy UI. Every page, button, form, filter, table, modal, campaign action, and automation must be connected to working backend APIs and MongoDB.

---

# 1. Required Technology Stack

## Frontend

Use:

* React.js
* Vite
* JavaScript
* Tailwind CSS
* Shadcn UI
* Radix UI
* Lucide React icons
* React Router
* TanStack React Query
* React Hook Form
* Zod validation
* Axios
* Recharts
* TipTap or a similar rich-text editor
* Zustand or React Context for global state

## Backend

Use:

* Node.js
* Express.js
* MongoDB
* Mongoose
* JWT authentication
* HTTP-only secure cookies
* bcrypt
* Zod or Joi validation
* Helmet
* CORS
* Express Rate Limit
* Mongo Sanitize
* Multer
* Nodemailer where necessary

## Background Processing

Use:

* Redis
* BullMQ
* Separate background worker process

Background workers must handle:

* Scheduled email sending
* Email sequences
* Gmail synchronization
* Gmail token refresh
* Gmail watch renewal
* Brevo campaign processing
* Webhook event processing
* Retry logic
* Automation actions
* Analytics aggregation

Do not run heavy workers inside the main Express web server.

Use:

```env
RUN_WORKERS=false
```

for the web service.

Use:

```env
RUN_WORKERS=true
```

for the background worker service.

---

# 2. Application Purpose

The application should follow this workflow:

```text
User Signup
→ Create Workspace
→ Connect Gmail
→ Connect Brevo
→ Import Contacts
→ Create Contact Lists
→ Create Email Template
→ Create Campaign or Sequence
→ Schedule Emails
→ Send Through Gmail or Brevo
→ Track Delivery, Open, Click and Reply
→ Analyze Replies
→ Stop or Continue Follow-ups
→ Update Lead Status
→ Book Appointment or Schedule Call
→ View Analytics
```

---

# 3. Core Product Rules

Use Gmail and Brevo for different purposes.

## Gmail should be used for:

* Inbox synchronization
* Reading emails
* One-to-one emails
* Personalized sales outreach
* Replying inside existing email threads
* Creating drafts
* Sending manual emails
* Detecting incoming replies
* Managing Gmail labels
* Archiving and marking emails read or unread

## Brevo should be used for:

* Bulk campaigns
* Marketing campaigns
* Transactional emails
* Appointment confirmations
* Email templates
* Contact list synchronization
* Delivery tracking
* Open tracking
* Click tracking
* Bounce handling
* Unsubscribe handling
* Webhook events

Do not treat Gmail as an unlimited bulk email provider.

---

# 4. Authentication and Workspace System

Create a secure authentication system with:

* Signup
* Login
* Logout
* Forgot password
* Reset password
* Email verification
* Refresh token
* Secure HTTP-only cookies
* Protected routes
* Role-based access control

Create workspace support.

Each user should belong to a workspace.

## Roles

* Owner
* Admin
* Sales Member
* Viewer

## Owner permissions

* Manage billing
* Manage integrations
* Manage team
* Manage campaigns
* Manage workspace settings

## Admin permissions

* Manage contacts
* Manage templates
* Manage campaigns
* Manage sequences
* View analytics

## Sales Member permissions

* View assigned contacts
* View assigned conversations
* Send replies
* Create drafts
* Manage follow-ups

## Viewer permissions

* View dashboards and analytics only

All workspace data must be isolated using `workspaceId`.

A user from one workspace must never access another workspace’s data.

---

# 5. Main Application Navigation

Create a professional SaaS dashboard with the following navigation:

* Dashboard
* Inbox
* Contacts
* Lists
* Templates
* Campaigns
* Sequences
* Automations
* Replies
* Appointments
* Analytics
* Integrations
* Billing
* Settings

Use a collapsible left sidebar and a clean top header.

The top header should contain:

* Workspace selector
* Global search
* Notifications
* Usage indicator
* Help button
* User profile dropdown

On mobile, convert the sidebar into a drawer.

---

# 6. UI and Design Requirements

The UI must be modern, clean, structured, professional, and easy to understand.

Do not create an overcrowded interface.

## General layout rules

* Use a centered maximum-width content container
* Use consistent horizontal page padding
* Desktop page padding: `24px–32px`
* Tablet page padding: `20px–24px`
* Mobile page padding: `16px`
* Use `24px–32px` vertical spacing between major page sections
* Use `16px–20px` spacing inside cards
* Use an 8px spacing system
* Use proper visual hierarchy
* Use consistent card heights where possible
* Avoid excessive empty space
* Avoid oversized headings
* Avoid random colors
* Avoid heavy gradients
* Avoid excessive shadows
* Avoid too many borders

## Card design

All cards should have:

* White or subtle neutral background
* `12px–16px` border radius
* Soft border
* Very subtle shadow
* Proper internal padding
* Clear card title
* Supporting description where required
* Proper alignment between labels and values
* Hover state only when the card is interactive

## Typography

Use a modern font such as Inter.

Typography hierarchy:

* Page title: 28px–32px, semibold
* Section title: 18px–20px, semibold
* Card title: 14px–16px, medium
* Body text: 14px–16px
* Supporting text: 12px–14px
* Table headers: 12px–13px, medium
* Avoid very light gray text that is difficult to read

## Color system

Use a professional light SaaS theme:

* Main background: soft gray
* Card background: white
* Primary color: violet, indigo, blue, or emerald
* Text: dark charcoal
* Secondary text: medium gray
* Success: green
* Warning: amber
* Error: red
* Info: blue

Also create dark mode using the same spacing and structure.

## Forms

Forms must use:

* Proper labels
* Helpful descriptions
* Inline validation
* Error messages below fields
* Consistent input heights
* Clear required indicators
* Disabled and loading states
* Success feedback
* No placeholder-only labels

## Tables

Tables must have:

* Search
* Filters
* Sort
* Pagination
* Bulk actions
* Sticky header where useful
* Loading skeleton
* Empty state
* Error state
* Responsive mobile alternative
* Proper cell spacing
* Status badges
* Row action menu

## Loading and feedback

Add:

* Skeleton loaders
* Toast notifications
* Confirmation dialogs
* Empty states
* Retry buttons
* Disabled states
* Progress indicators
* Form submission loaders
* Campaign processing progress
* Queue status

Do not use browser alert boxes.

---

# 7. Dashboard Page

Create a well-structured dashboard.

## Top section

Show:

* Welcome title
* Date range selector
* Create Campaign button
* Import Contacts button

## Metric cards

Show:

* Total Contacts
* Emails Sent
* Delivered
* Open Rate
* Click Rate
* Reply Rate
* Interested Leads
* Appointments Booked

Each metric card should include:

* Main value
* Supporting label
* Percentage change
* Small trend indicator
* Optional mini chart

## Charts

Add:

* Email performance line chart
* Campaign funnel
* Gmail vs Brevo comparison
* Reply classification chart
* Campaign performance chart

## Additional sections

* Active campaigns
* Active sequences
* Recent replies
* Upcoming scheduled emails
* Integration health
* Recent activity

Use a balanced grid. Do not stretch every section to full width unnecessarily.

---

# 8. Gmail Integration

Create a complete Gmail OAuth integration.

## Gmail connection flow

```text
User clicks Connect Gmail
→ Google OAuth screen opens
→ User grants permission
→ Backend receives authorization code
→ Backend exchanges code for tokens
→ Tokens are encrypted
→ Gmail account is connected
→ Initial synchronization starts
```

## Gmail scopes

Request only the scopes required for enabled functionality.

Support:

* Read inbox
* Read threads
* Send emails
* Create drafts
* Reply
* Modify labels
* Archive emails
* Mark read or unread

## Gmail account connection data

Store:

* Gmail address
* Google account ID
* Access token
* Refresh token
* Token expiry
* Gmail history ID
* Gmail watch expiry
* Last sync time
* Connection status
* Granted scopes

Encrypt all Google tokens before saving them.

Never expose refresh tokens to the frontend.

## Gmail inbox sync

Implement:

* Initial inbox sync
* Incremental sync
* Thread synchronization
* Attachment metadata
* Sent emails
* Draft emails
* Gmail labels
* Gmail history synchronization
* New reply detection
* Reconnection handling

Use Gmail push notifications with Google Cloud Pub/Sub.

Do not continuously poll the complete mailbox.

Create a watch renewal worker.

If Gmail watch expires or sync fails, show the connection as unhealthy and allow the user to reconnect.

---

# 9. Unified Inbox

Create a professional three-column inbox layout.

## Left column

Show:

* Connected Gmail accounts
* Inbox
* Unread
* Sent
* Drafts
* Starred
* Archived
* Custom labels
* Interested replies
* Needs response
* Automated replies

## Middle column

Show conversation list with:

* Sender name
* Subject
* Message preview
* Time
* Unread indicator
* Contact status
* Assigned sales member
* Campaign badge
* Attachment icon

Add:

* Search
* Account filter
* Status filter
* Date filter
* Assigned user filter
* Gmail label filter

## Right column

Show selected email thread with:

* Full conversation
* Sender and recipient details
* Reply editor
* Reply all
* Forward
* Create draft
* Attach file
* Archive
* Mark unread
* Apply label
* Assign team member

Add a contact information panel containing:

* Contact name
* Company
* Phone
* Lead status
* Lead score
* Tags
* Current sequence
* Last campaign
* Notes
* Appointments
* Call history

Preserve Gmail thread relationships while replying.

---

# 10. Brevo Integration

Create a Brevo integration using the user’s own API key.

## Brevo connection fields

* Brevo API key
* Default sender name
* Default sender email
* Reply-to email
* Sender ID
* Webhook secret

Encrypt the API key before storage.

## Brevo features

Implement:

* Validate API key
* Fetch senders
* Fetch lists
* Sync contacts
* Create contact
* Update contact
* Create contact list
* Add contacts to list
* Remove contacts from list
* Create campaign
* Schedule campaign
* Pause campaign
* Cancel campaign
* Send transactional email
* Fetch campaign reports
* Track webhook events

## Brevo webhook endpoint

Create:

```text
POST /api/webhooks/brevo
```

Process:

* Sent
* Delivered
* Opened
* Clicked
* Soft bounce
* Hard bounce
* Blocked
* Spam complaint
* Unsubscribed
* Error

Webhook processing must be:

* Idempotent
* Secure
* Logged
* Processed through a background queue
* Safe from duplicate events

Store raw webhook payloads for debugging, but redact sensitive information from logs.

---

# 11. Contacts CRM

Create a lightweight CRM.

## Contact fields

* First name
* Last name
* Email
* Phone
* Company
* Job title
* Website
* Industry
* City
* State
* Country
* Source
* Lead status
* Lead score
* Assigned user
* Tags
* Contact lists
* Custom fields
* Consent status
* Subscription status
* Last contacted date
* Last opened date
* Last clicked date
* Last replied date
* Next follow-up date
* Gmail thread IDs
* Brevo contact ID

## Contact statuses

* New
* Contacted
* Delivered
* Opened
* Clicked
* Replied
* Interested
* Qualified
* Meeting Booked
* Not Interested
* Unsubscribed
* Bounced
* Invalid
* Converted

## Contact page

Create:

* Search
* Advanced filters
* List filter
* Tag filter
* Status filter
* Source filter
* Assigned user filter
* Bulk actions
* Export
* Import
* Pagination

## Contact details drawer or page

Show:

* Contact profile
* Status
* Tags
* Notes
* Activity timeline
* Email history
* Campaign history
* Sequence enrollment
* Gmail conversation
* Appointments
* Calls
* Tasks

---

# 12. Contact Import System

Support:

* CSV
* Excel
* Manual entry
* Google Sheets later
* Gmail contacts later

Create a multi-step import wizard:

```text
Upload File
→ Detect Columns
→ Map Fields
→ Validate Contacts
→ Find Duplicates
→ Check Suppression List
→ Preview Results
→ Confirm Import
```

Show an import report:

* Total rows
* Valid contacts
* Imported contacts
* Duplicate contacts
* Invalid emails
* Missing emails
* Suppressed contacts
* Failed rows

Normalize email addresses before duplicate checking.

Duplicate checking must be workspace-specific.

---

# 13. Contact Lists and Segments

Allow users to create:

* Static contact lists
* Dynamic segments

## Dynamic segment filters

* Contact status
* Tag
* Source
* Industry
* City
* Country
* Company
* Last email date
* Open count
* Click count
* Replied or not replied
* Interested status
* Appointment status
* Assigned sales member

Show estimated contact count while building a segment.

---

# 14. Email Template Builder

Create:

* Plain-text editor
* Rich-text editor
* HTML editor
* Email preview
* Mobile preview
* Desktop preview
* Test email
* Duplicate template
* Template categories
* Save as reusable template

## Template categories

* Cold outreach
* Follow-up
* Newsletter
* Welcome
* Appointment confirmation
* Appointment reminder
* Product update
* Payment reminder
* Reactivation
* Transactional email

## Personalization variables

Support:

```text
{{first_name}}
{{last_name}}
{{company}}
{{job_title}}
{{city}}
{{country}}
{{sender_name}}
{{appointment_link}}
{{custom_field_name}}
```

Add fallback values.

Example:

```text
{{first_name | default: "there"}}
```

Before sending, validate missing personalization values and show warnings.

---

# 15. AI Email Features

Create AI-powered tools for:

* Email generation
* Subject line generation
* Follow-up generation
* Reply generation
* Email shortening
* Professional rewrite
* Friendly rewrite
* Grammar correction
* Personalization
* Reply summarization
* Reply sentiment detection
* Reply intent classification

Do not automatically send AI-generated replies by default.

The default behavior should be:

```text
AI analyzes reply
→ Creates suggested response
→ Saves response as draft
→ User reviews
→ User sends
```

Allow workspace owners to enable automatic replies only for safe, predefined cases.

---

# 16. Campaign Builder

Create a multi-step campaign wizard.

## Step 1: Campaign details

* Campaign name
* Campaign type
* Description
* Gmail or Brevo provider
* Sender account

## Step 2: Audience

* Contact list
* Dynamic segment
* Filters
* Exclude contacts
* Exclude unsubscribed
* Exclude bounced
* Exclude suppressed
* Exclude previously contacted

## Step 3: Content

* Select template
* Add subject
* Add body
* Personalization
* Preview
* Send test email

## Step 4: Schedule

* Send now
* Schedule later
* Timezone
* Sending window
* Skip weekends
* Daily sending limit
* Hourly sending limit
* Delay between emails

## Step 5: Review

Show:

* Total recipients
* Valid recipients
* Excluded recipients
* Missing variables
* Sender status
* Estimated sending time
* Provider
* Schedule
* Email preview

## Campaign actions

* Draft
* Schedule
* Start
* Pause
* Resume
* Cancel
* Duplicate
* Archive
* View report

---

# 17. Email Sequences

Create a visual but simple step-based sequence builder.

Do not build a complex node canvas in the first version.

Example:

```text
Step 1: Introduction email
Wait 2 days
Step 2: Follow-up email
Wait 3 days
Step 3: Case study email
Wait 4 days
Step 4: Final follow-up
```

## Sequence step settings

* Subject
* Email content
* Delay
* Provider
* Sender account
* Sending window
* Template
* Conditions
* Skip if replied
* Skip if meeting booked
* Skip if unsubscribed
* Skip if bounced

## Sequence enrollment

Allow users to:

* Add contact
* Add list
* Remove contact
* Pause enrollment
* Resume enrollment
* Stop sequence
* Restart sequence

## Stop conditions

Automatically stop sequence when:

* Contact replies
* Contact unsubscribes
* Hard bounce occurs
* Spam complaint occurs
* Meeting is booked
* Contact becomes converted
* User manually stops sequence

---

# 18. Automation Builder

Create a simple automation builder based on:

```text
Trigger
→ Conditions
→ Actions
```

## Triggers

* Contact created
* Contact imported
* Contact status changed
* Tag added
* Email sent
* Email delivered
* Email opened
* Link clicked
* Reply received
* Email bounced
* Contact unsubscribed
* Appointment booked
* Sequence completed
* AI call completed

## Conditions

* Contact list
* Contact tag
* Contact source
* Contact status
* Campaign
* Sequence
* Provider
* Reply classification
* Open count
* Click count
* Lead score
* Assigned user
* Consent status

## Actions

* Send Gmail email
* Send Brevo email
* Create Gmail draft
* Start sequence
* Stop sequence
* Add tag
* Remove tag
* Update contact status
* Assign sales member
* Create follow-up
* Send booking link
* Schedule AI call
* Notify team
* Send webhook

Create an automation execution log showing:

* Trigger
* Contact
* Conditions checked
* Actions executed
* Success or failure
* Timestamp
* Error details

---

# 19. Reply Detection and Classification

When a new Gmail reply arrives:

```text
Receive Gmail notification
→ Sync changed message
→ Detect incoming reply
→ Match sender with contact
→ Match thread with campaign or sequence
→ Stop relevant sequence
→ Analyze reply
→ Update contact
→ Trigger automation
```

Classify replies into:

* Interested
* Pricing Question
* More Information
* Meeting Request
* Not Interested
* Unsubscribe
* Out of Office
* Wrong Contact
* Referral
* Complaint
* Support Request
* Automatic Reply
* Spam

Return structured data:

```json
{
  "classification": "interested",
  "sentiment": "positive",
  "intent": "request_demo",
  "requiresHumanReply": true,
  "unsubscribeRequest": false,
  "outOfOffice": false,
  "summary": "The contact wants to schedule a product demo.",
  "suggestedAction": "send_booking_link"
}
```

For unsubscribe requests, immediately suppress the contact before performing any other action.

---

# 20. Email Tracking

Track:

* Queued
* Scheduled
* Sent
* Delivered
* Opened
* Unique opened
* Clicked
* Unique clicked
* Replied
* Soft bounce
* Hard bounce
* Blocked
* Spam complaint
* Unsubscribed
* Failed

Create an email activity timeline.

Example:

```text
10:00 AM — Email scheduled
10:05 AM — Email sent
10:06 AM — Email delivered
11:40 AM — Email opened
11:44 AM — Pricing link clicked
12:20 PM — Reply received
```

---

# 21. Suppression and Compliance

Create a workspace-level suppression list.

A contact must be added to the suppression list when:

* They unsubscribe
* They request no further emails
* A spam complaint is received
* A hard bounce occurs
* An admin manually blocks them

When suppressed:

* Stop active sequences
* Cancel scheduled emails
* Prevent campaign enrollment
* Prevent transactional marketing sends
* Save reason
* Save source
* Save timestamp
* Save related campaign or message

Every marketing email must support:

* Unsubscribe link
* Sender identity
* Business details
* Preference management
* Suppression checking

---

# 22. Appointments

Add basic Google Calendar or booking-link integration.

Support:

* Booking link field
* Send booking link
* Appointment confirmation email
* Appointment reminder email
* Appointment cancellation
* Appointment reschedule
* Stop sequence when meeting is booked
* Notify assigned sales member

---

# 23. Calling Automation Integration

Keep the system ready to connect with an AI calling app.

Example flow:

```text
Email sent
→ No reply after 3 days
→ Create calling task
→ AI voice agent calls contact
→ Call outcome saved
→ Send follow-up email
```

Another flow:

```text
Contact replies “Call me tomorrow”
→ Detect callback intent
→ Create call schedule
→ Assign AI voice agent or sales representative
```

Create integration-ready APIs and events for:

* Schedule call
* Cancel call
* Receive call outcome
* Update contact status
* Send call follow-up email

---

# 24. Analytics

Create analytics pages for:

## Campaign analytics

* Total recipients
* Sent
* Delivered
* Open rate
* Click rate
* Reply rate
* Interested reply rate
* Bounce rate
* Unsubscribe rate
* Conversion rate

## Sequence analytics

* Enrolled contacts
* Active contacts
* Completed contacts
* Stopped contacts
* Reply by step
* Conversion by step
* Drop-off by step

## Provider analytics

* Gmail performance
* Brevo performance
* Transactional email performance
* Sender account health

## Team analytics

* Replies handled
* Interested leads
* Appointments booked
* Response time
* Conversion rate

Use Recharts with clean responsive chart cards.

---

# 25. Notifications

Create in-app notifications for:

* New reply
* Interested lead
* Appointment booked
* Campaign completed
* Sequence failed
* Gmail disconnected
* Brevo API error
* Sending limit reached
* High bounce rate
* Spam complaint
* Webhook failure
* Worker failure

Add notification read and unread states.

---

# 26. Billing and Usage

Create plans and usage tracking.

Track:

* Contacts
* Gmail accounts
* Brevo connections
* Emails sent
* AI email generations
* AI reply analyses
* Active sequences
* Team members
* Monthly usage

Create:

* Plans
* Subscription status
* Upgrade
* Downgrade
* Cancel
* Billing history
* Usage progress bars
* Limit enforcement

Keep provider charges separate from platform usage where appropriate.

---

# 27. Admin Panel

Create a separate admin panel.

Admin navigation:

* Dashboard
* Users
* Workspaces
* Gmail Connections
* Brevo Connections
* Contacts
* Campaigns
* Sequences
* Automations
* Email Logs
* Webhooks
* Queue Jobs
* Suppression List
* Usage and Credits
* Plans
* Payments
* Audit Logs
* System Settings

Admin dashboard should show:

* Total users
* Active workspaces
* Emails sent today
* Failed emails
* Active campaigns
* Gmail disconnections
* Brevo failures
* Pending jobs
* Failed jobs
* Bounce rate
* Spam complaint rate
* Storage usage

---

# 28. Required Database Models

Create Mongoose models for:

* User
* Workspace
* WorkspaceMember
* EmailConnection
* Contact
* ContactList
* ContactSegment
* EmailTemplate
* EmailCampaign
* EmailSequence
* SequenceStep
* SequenceEnrollment
* EmailMessage
* EmailThread
* EmailEvent
* Automation
* AutomationExecution
* Appointment
* FollowUp
* Notification
* SuppressionEntry
* UsageRecord
* Subscription
* AuditLog
* WebhookEvent
* BackgroundJobLog

Every relevant model must contain `workspaceId`.

Add indexes for:

* Workspace
* Email
* Contact status
* Provider message ID
* Gmail thread ID
* Campaign
* Sequence
* Scheduled time
* Webhook event ID
* Suppression email

Add unique constraints where required.

---

# 29. Idempotency and Duplicate Protection

Prevent duplicate emails.

Create an idempotency key using:

```text
workspaceId
+ contactId
+ campaignId or sequenceId
+ stepId
```

Before sending an email:

1. Check suppression list
2. Check contact status
3. Check idempotency key
4. Check provider connection
5. Check usage limit
6. Check sending window
7. Check daily limit
8. Check whether contact already replied
9. Send email
10. Save provider response

Worker retries must not send the same email twice.

---

# 30. API Structure

Use a structured API layout.

Example:

```text
/api/auth
/api/users
/api/workspaces
/api/team
/api/integrations/gmail
/api/integrations/brevo
/api/contacts
/api/contact-lists
/api/segments
/api/templates
/api/campaigns
/api/sequences
/api/automations
/api/inbox
/api/email-messages
/api/email-events
/api/appointments
/api/notifications
/api/analytics
/api/billing
/api/admin
/api/webhooks/gmail
/api/webhooks/brevo
```

Create:

* Controllers
* Services
* Models
* Routes
* Validation schemas
* Middleware
* Queue processors
* Utility functions

Do not place all logic inside route files.

---

# 31. Recommended Folder Structure

```text
email-automation/
│
├── client/
│   ├── src/
│   │   ├── api/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── components/ui/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── routes/
│   │   ├── stores/
│   │   ├── utils/
│   │   └── App.jsx
│
├── server/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── integrations/
│   │   ├── gmail/
│   │   └── brevo/
│   ├── queues/
│   ├── workers/
│   ├── jobs/
│   ├── validators/
│   ├── utils/
│   └── server.js
│
├── worker/
│   └── worker.js
│
├── .env.example
├── README.md
└── package.json
```

---

# 32. Environment Variables

Create a complete `.env.example`.

```env
NODE_ENV=development
PORT=5000

CLIENT_URL=http://localhost:5173
API_URL=http://localhost:5000

MONGODB_URI=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
COOKIE_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_PUBSUB_TOPIC=
GOOGLE_PUBSUB_SUBSCRIPTION=

BREVO_API_KEY=
BREVO_WEBHOOK_SECRET=

EMAIL_CREDENTIAL_ENCRYPTION_KEY=

REDIS_URL=
RUN_WORKERS=false

OPENAI_API_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Do not expose backend secrets in Vite environment variables.

---

# 33. Security Requirements

Implement:

* HTTP-only cookies
* Secure cookies in production
* SameSite protection
* CORS allowlist
* CSRF-safe OAuth state
* Encryption for Gmail tokens
* Encryption for Brevo API keys
* Password hashing
* Rate limiting
* Input validation
* Mongo sanitization
* Secure headers
* API authorization
* Workspace ownership checks
* Audit logs
* Token revocation
* Webhook validation
* File upload validation
* Error log redaction

Never log:

* Access tokens
* Refresh tokens
* API keys
* Passwords
* Full authorization headers

---

# 34. Error Handling

Create centralized error handling.

Return consistent API responses:

```json
{
  "success": false,
  "message": "Unable to send email.",
  "code": "EMAIL_SEND_FAILED",
  "details": {}
}
```

Create clear UI error states for:

* Gmail disconnected
* Brevo API invalid
* Token expired
* Sending limit reached
* Campaign failed
* Sequence failed
* Webhook failed
* Invalid contact
* Email bounced
* Queue unavailable
* Server unavailable

---

# 35. MVP Priority

Build the first production version in this order:

## Phase 1

* Authentication
* Workspace
* Roles
* Contact CRM
* Contact import
* Lists
* Clean dashboard UI

## Phase 2

* Gmail OAuth
* Inbox sync
* Thread view
* Read
* Reply
* Draft
* Send

## Phase 3

* Brevo API integration
* Contact sync
* Transactional emails
* Campaign sending
* Webhooks
* Tracking

## Phase 4

* Templates
* Campaign builder
* Email sequences
* Background workers
* Scheduling
* Stop-on-reply

## Phase 5

* Automations
* AI reply analysis
* Lead-status updates
* Appointment actions
* Calling integration

## Phase 6

* Analytics
* Billing
* Admin panel
* Audit logs
* Monitoring
* Production hardening

---

# 36. Important Development Rules

* Do not create static-only pages.
* Do not use hardcoded dashboard metrics.
* Do not use fake data after backend integration.
* Do not leave buttons without actions.
* Do not create duplicate components unnecessarily.
* Do not place all logic in one file.
* Do not expose credentials to the frontend.
* Do not send all campaign emails inside one request.
* Do not use Gmail for unrestricted bulk sending.
* Do not send emails to suppressed contacts.
* Do not send duplicate sequence steps.
* Do not continue sequences after a reply.
* Do not ignore failed webhook events.
* Do not silently swallow errors.
* Do not redesign one page while leaving other pages inconsistent.
* Maintain the same spacing, card style, typography, forms, tables, buttons, and modal patterns throughout the entire application.

---

# 37. Expected Final Result

The final app must feel like a polished, modern SaaS product.

The core working flow must be:

```text
Connect Gmail and Brevo
→ Import Contacts
→ Create Lists
→ Build Email Template
→ Launch Campaign or Sequence
→ Send Emails Through Workers
→ Track Delivery and Engagement
→ Detect Replies
→ Stop Follow-ups
→ Analyze Lead Intent
→ Update CRM
→ Book Appointment or Schedule Call
→ View Analytics
```

Before considering the application complete:

* Test every page
* Test responsive layouts
* Test empty states
* Test loading states
* Test invalid forms
* Test Gmail token refresh
* Test Gmail reply threading
* Test Brevo webhook duplication
* Test campaign pause and resume
* Test sequence stop-on-reply
* Test suppression enforcement
* Test worker restart behavior
* Test duplicate-send prevention
* Test workspace data isolation
* Test role permissions
* Test mobile navigation

Create a complete README containing:

* Local setup
* Installation commands
* Environment variables
* MongoDB setup
* Redis setup
* Google Cloud Gmail OAuth setup
* Google Pub/Sub setup
* Brevo API setup
* Webhook setup
* Running frontend
* Running backend
* Running workers
* Production deployment instructions

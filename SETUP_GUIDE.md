# Setup Guide: Multi-Role System

## 🎯 Overview

Your dashboard now supports two user types:
- **User**: Can only see their own client's conversations and leads
- **Admin**: Can select and manage any client, with access to configuration tools

## ✅ What's Been Implemented

### Core Infrastructure
- ✅ Database schema for clients, user profiles, configurations, and prompts
- ✅ Row Level Security policies for role-based data access
- ✅ Role management hooks and utilities
- ✅ Client selection context for admins
- ✅ Role-based middleware and route protection
- ✅ UI components (RoleBadge, ClientSelector, ClientBadge)
- ✅ Updated navigation with admin menu items
- ✅ API routes for client CRUD operations
- ✅ Admin client selection landing page

### Build Status
✅ Project builds successfully with no errors

## 🚀 Quick Start (5 Steps)

### Step 1: Apply Database Migration

Open Supabase Dashboard > SQL Editor and run:

```sql
-- Copy the entire contents from:
-- supabase/migrations/20251003160000_add_multi_role_system_and_clients.sql
-- And paste here, then execute
```

This creates all necessary tables and security policies.

### Step 2: Create Your First Admin

After migration, get your user ID from Supabase Dashboard > Authentication, then run:

```sql
UPDATE user_profiles
SET role = 'admin', client_id = NULL
WHERE id = 'YOUR-USER-UUID-HERE';
```

### Step 3: Create a Test Client

```sql
INSERT INTO clients (name, email, company_name)
VALUES ('Acme Corp', 'contact@acme.com', 'Acme Corporation')
RETURNING *;
```

### Step 4: Test Admin Flow

1. Login with your admin account
2. You'll be redirected to `/dashboard/admin/select-client`
3. Select the test client
4. Navigate through Dashboard, Conversations, Leads
5. Notice the client selector in the navbar

### Step 5: Create a Regular User

1. Sign up a new account
2. Get the new user's UUID
3. Assign them to a client:

```sql
UPDATE user_profiles
SET client_id = 'CLIENT-UUID-FROM-STEP-3'
WHERE id = 'NEW-USER-UUID';
```

4. Login as this user
5. They should only see their client's data

## 📋 Complete Feature Checklist

### ✅ Already Working
- [x] Database schema with proper relations
- [x] RLS security policies
- [x] Role-based authentication
- [x] Admin client selector dropdown
- [x] Role badge in navbar
- [x] Protected admin routes
- [x] Client selection persistence
- [x] Admin landing page
- [x] Clients API endpoints

### 🔨 To Complete the System

#### High Priority

1. **Update Dashboard Page with Client Filtering**
   - File: `src/app/dashboard/page.tsx`
   - Add client filtering to statistics queries
   - Show which client's data is being displayed

2. **Update Conversations Page with Client Filtering**
   - File: `src/app/dashboard/conversations/page.tsx`
   - Filter conversations by selected client (admin) or user's client
   - Add client indicator in header

3. **Update Leads Page with Client Filtering**
   - File: `src/app/dashboard/leads/page.tsx`
   - Filter leads by selected client (admin) or user's client
   - Update CSV export to include client name

4. **Admin Clients Management Page**
   - File: `src/app/dashboard/admin/clients/page.tsx`
   - List all clients in a table
   - Create new client form
   - Edit/delete client functionality
   - Show client statistics (lead count, conversation count)

5. **Admin Configuration Page**
   - File: `src/app/dashboard/admin/configuration/page.tsx`
   - Form for technical parameters:
     - locationId, calendarId, credentialId
     - elevenLabKey, agentKey, phoneNumberKey
     - timezone (with dropdown selector)
     - appointmentTitle
   - Markdown editor for LLM prompt
   - Textarea for pipeline classification prompt
   - Auto-save or manual save button

6. **Configuration & Prompts API Routes**
   - File: `src/app/api/configurations/[client_id]/route.ts`
   - GET and PUT endpoints
   - File: `src/app/api/prompts/[client_id]/route.ts`
   - GET and PUT endpoints

#### Medium Priority

7. **Admin Users Management Page**
   - File: `src/app/dashboard/admin/users/page.tsx`
   - List all users with their roles
   - Assign users to clients
   - Change user roles
   - Show users without clients

8. **Data Migration Tool**
   - File: `src/app/dashboard/admin/migration/page.tsx`
   - Show orphaned leads/conversations (client_id is NULL)
   - Bulk assign to selected client
   - Migration history log

## 🔐 Security Features

### Database Level (RLS Policies)
- Users can only query data for their assigned client
- Admins can query data for any client
- Enforced by Supabase Row Level Security

### Application Level
- Middleware blocks unauthorized route access
- API routes verify user role before operations
- Client-side RoleGuard conditionally renders UI

### Best Practices
- Never expose client_id to user role in client code
- Always verify role in API routes
- Use RLS as final security layer

## 🎨 UI Features Implemented

### For All Users
- Role badge showing user type
- Responsive navigation
- Loading states
- Error handling

### For Admin Users
- Client selector dropdown (always visible)
- Selected client persists across pages
- Quick search in client selector
- Admin-only menu items (Clienti, Configurazione)
- Can view all clients' data

### For Regular Users
- See only their own client's data
- Simplified interface without admin options
- Client name shown in navbar (when implemented)

## 📊 Data Model

```
clients
├── id (uuid)
├── name (text)
├── email (text)
└── company_name (text)

user_profiles
├── id (uuid, FK to auth.users)
├── role ('user' | 'admin')
└── client_id (uuid, FK to clients, nullable)

client_configurations (one-to-one with clients)
├── client_id (uuid, FK unique)
├── location_id, calendar_id, credential_id
├── eleven_lab_key, agent_key, phone_number_key
├── timezone, appointment_title

client_prompts (one-to-one with clients)
├── client_id (uuid, FK unique)
├── llm_prompt (text)
└── pipeline_classification_prompt (text)

leads (modified)
├── client_id (uuid, FK, nullable)
└── ... existing fields ...

conversations (modified)
├── client_id (uuid, FK, nullable)
└── ... existing fields ...
```

## 🧪 Testing Scenarios

### Test 1: Admin Can See All Data
1. Login as admin
2. Create 2-3 test clients
3. Add leads/conversations with different client_ids
4. Select different clients from dropdown
5. Verify data changes based on selection

### Test 2: User Sees Only Their Data
1. Create user assigned to Client A
2. Create leads for Client A and Client B
3. Login as user
4. Verify only Client A leads are visible
5. Verify no admin menu items

### Test 3: Role-Based Access
1. Login as user
2. Try accessing `/dashboard/admin/clients`
3. Should redirect to `/dashboard`
4. Try accessing `/dashboard/admin/configuration`
5. Should redirect to `/dashboard`

### Test 4: Client Selection Persistence
1. Login as admin
2. Select a client
3. Navigate to different pages
4. Reload page
5. Selected client should persist

## 🐛 Troubleshooting

### Migration Errors
If migration fails, check:
- Supabase connection is active
- No syntax errors in SQL
- Tables don't already exist
- Foreign key constraints are valid

### RLS Issues
If data isn't filtering correctly:
- Check `user_profiles` table has correct data
- Verify RLS is enabled on all tables
- Check policy conditions in Supabase Dashboard
- Try disabling RLS temporarily to test (re-enable after!)

### Role Not Updating
If user role doesn't reflect:
- Clear browser cache and cookies
- Check `user_profiles` table in database
- Verify trigger is creating profiles for new users
- Re-login after role change

## 📝 Code Examples

### Example: Filtering by Client in Dashboard

```typescript
// In dashboard/page.tsx
const { role, clientId } = useUserRole()
const { selectedClient } = useSelectedClient()

// Determine which client to filter by
const filterClientId = role === 'admin'
  ? selectedClient?.id
  : clientId

// Query with filter
const { data: leads } = await supabase
  .from('leads')
  .select('*')
  .eq('client_id', filterClientId)
```

### Example: Admin-Only Configuration Form

```typescript
// In dashboard/admin/configuration/page.tsx
'use client'

export default function ConfigurationPage() {
  const { isAdmin } = useUserRole()
  const { selectedClient } = useSelectedClient()

  if (!isAdmin || !selectedClient) {
    return <div>Please select a client</div>
  }

  // Fetch and save configuration
  // ...
}
```

## 🎓 Next Steps

1. **Immediate**: Apply database migration
2. **Immediate**: Create first admin user
3. **High Priority**: Implement client filtering in existing pages
4. **High Priority**: Build admin configuration UI
5. **Medium Priority**: Create clients management page
6. **Optional**: Build users management tool
7. **Optional**: Create data migration utility

## 📞 Support

Check these files for reference implementations:
- Middleware: `src/middleware.ts`
- Role Hook: `src/hooks/useUserRole.ts`
- Client Context: `src/contexts/ClientContext.tsx`
- API Example: `src/app/api/clients/route.ts`

For RLS policies, check:
- `supabase/migrations/20251003160000_add_multi_role_system_and_clients.sql`

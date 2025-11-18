# ElevenLabs API Integration - Technical Documentation

## Overview

This document provides comprehensive technical documentation for the ElevenLabs API integration implemented in the SmartService AI dashboard. The integration uses a secure proxy pattern with Next.js API routes to safely manage ElevenLabs API calls.

## Architecture

### Proxy Pattern

The application implements a proxy architecture where:

1. **Frontend** → Sends requests with Supabase JWT token
2. **Next.js API Route** → Authenticates user and retrieves ElevenLabs token
3. **ElevenLabs API** → Processes the actual request
4. **Response Path** → Data flows back through the proxy to frontend

### Key Components

```
├── /src/app/lib/
│   ├── elevenLabsApi.ts          # API client library with error handling
│   ├── conversationsApi.ts        # Conversation data operations
│   └── supabaseClient.ts          # Supabase client configuration
│
├── /src/app/api/elevenlabs/
│   ├── conversations/route.ts     # List conversations endpoint
│   ├── conversation/[id]/route.ts # Single conversation endpoint
│   └── audio/[id]/route.ts        # Audio streaming endpoint
│
└── /supabase/migrations/
    └── add_token_encryption_and_security_enhancements.sql
```

## Security Features

### 1. Token Encryption at Rest

All ElevenLabs API tokens are encrypted in the database using PostgreSQL's `pgcrypto` extension:

- **Encryption Algorithm**: AES-256 via pgp_sym_encrypt
- **Key Derivation**: User-specific keys derived from user_id + secret
- **Storage**: Encrypted tokens stored in `encrypted_token` bytea column

```sql
-- Encrypt token function
encrypt_api_token(token text, user_id uuid) → bytea

-- Decrypt token function (RLS enforced)
decrypt_api_token(user_id uuid) → text
```

### 2. Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:

- Users can only access their own data
- Authentication required for all operations
- Proper ownership checks on all CRUD operations

**Protected Tables:**
- `elevenlabs_tokens` - API token storage
- `user_services` - Service configuration
- `elevenlabs_token_access_log` - Audit trail

### 3. Access Logging

All token access is logged for security auditing:

```typescript
elevenlabs_token_access_log {
  user_id: uuid
  access_type: 'INSERT' | 'UPDATE' | 'SELECT' | 'DELETE'
  access_successful: boolean
  ip_address: inet
  user_agent: text
  error_message: text
  accessed_at: timestamptz
}
```

### 4. Request Authentication

Every API request follows this authentication flow:

1. Verify Authorization header presence
2. Validate Supabase JWT token
3. Extract authenticated user from token
4. Retrieve user's ElevenLabs API token from database
5. Verify token is active
6. Proceed with ElevenLabs API call

## API Client Library

### ElevenLabsAPIClient Class

The `ElevenLabsAPIClient` provides a unified interface for all ElevenLabs API calls:

```typescript
import { ElevenLabsAPIClient } from '@/app/lib/elevenLabsApi'

const client = new ElevenLabsAPIClient(authHeader)

// Authenticate user
const { user, error } = await client.authenticateUser()

// Get active token
const { token, error } = await client.getActiveToken(userId)

// Call ElevenLabs API
const { data, error, metrics } = await client.callElevenLabsAPI(
  endpoint,
  token,
  { timeout: 20000 }
)
```

### Features

- **Automatic timeout handling** - Configurable per request
- **Comprehensive error handling** - Structured error responses
- **Performance metrics tracking** - Duration, success rate monitoring
- **Binary data support** - For audio streaming
- **Retry logic ready** - Foundation for future retry implementation

## Performance Optimizations

### 1. Caching Strategy

```typescript
// Conversations endpoint
Cache-Control: private, max-age=60, stale-while-revalidate=120

// Audio endpoint
Cache-Control: private, max-age=3600
```

### 2. Timeout Configuration

| Endpoint | Timeout | Rationale |
|----------|---------|-----------|
| Conversations List | 20s | Large datasets, pagination |
| Single Conversation | 15s | Smaller payload, faster response |
| Audio Stream | 30s | Binary data transfer |

### 3. Response Time Tracking

All responses include performance headers:

```http
X-Response-Time: 1234ms  # Total request duration
X-API-Duration: 987ms    # ElevenLabs API call duration
```

## Error Handling

### Standardized Error Response

```typescript
{
  error: string           // Human-readable error message
  status: number          // HTTP status code
  code?: string           // Error code (e.g., 'UNAUTHORIZED', 'TIMEOUT')
  details?: string        // Additional error details
  timestamp: string       // ISO timestamp
}
```

### Error Codes

| Code | Description | Status | Resolution |
|------|-------------|--------|------------|
| UNAUTHORIZED | Missing or invalid auth | 401 | Re-authenticate |
| TOKEN_NOT_FOUND | No active ElevenLabs token | 404 | Configure token in settings |
| TOKEN_FETCH_ERROR | Database error | 500 | Contact support |
| TIMEOUT | Request exceeded timeout | 504 | Retry request |
| INTERNAL_ERROR | Unexpected error | 500 | Check logs |
| INVALID_PARAMETER | Invalid request parameter | 400 | Fix request |

## Logging

### Structured Logging Format

All logs follow a consistent structured format:

```typescript
// Success log
console.log('[ElevenLabs API Success]', {
  endpoint: string,
  duration: number,
  totalDuration: number,
  conversationCount?: number,
  conversationId?: string
})

// Error log
console.error('[ElevenLabs API Error]', {
  endpoint: string,
  status: number,
  message: string,
  duration: number,
  stack?: string
})
```

### Log Categories

- `[ElevenLabs API Success]` - Successful API calls
- `[ElevenLabs API Error]` - ElevenLabs API errors
- `[API Route Error]` - Application-level errors
- `[Token Access]` - Token access events (via triggers)

## API Endpoints

### GET /api/elevenlabs/conversations

List conversations with filtering and pagination.

**Query Parameters:**
- `page_size` - Number of results (default: 100)
- `cursor` - Pagination cursor
- `agent_id` - Filter by agent ID
- `call_successful` - Filter by outcome ('success', 'failure')
- `call_start_before_unix` - Filter by date (unix timestamp)
- `call_start_after_unix` - Filter by date (unix timestamp)

**Response:**
```json
{
  "conversations": [...],
  "cursor": "next_page_cursor"
}
```

### GET /api/elevenlabs/conversation/[id]

Get single conversation details.

**Parameters:**
- `id` - Conversation ID

**Response:**
```json
{
  "conversation_id": "...",
  "agent_id": "...",
  "start_time_unix_secs": 1234567890,
  ...
}
```

### GET /api/elevenlabs/audio/[id]

Stream conversation audio.

**Parameters:**
- `id` - Conversation ID

**Response:**
- Binary audio data (audio/mpeg)

## Database Schema

### elevenlabs_tokens

Stores encrypted ElevenLabs API tokens.

```sql
CREATE TABLE elevenlabs_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  api_token text NOT NULL,              -- Legacy plain text
  encrypted_token bytea,                 -- New encrypted format
  encryption_key_id text DEFAULT 'v1',
  is_active boolean DEFAULT true,
  last_verified_at timestamptz,
  token_rotated_at timestamptz,
  previous_token_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
```

### user_services

Tracks enabled services per user.

```sql
CREATE TABLE user_services (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  has_chatbot boolean DEFAULT false,
  has_ai_calls boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)
```

### elevenlabs_token_access_log

Audit trail for token access.

```sql
CREATE TABLE elevenlabs_token_access_log (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  access_type text NOT NULL,
  access_successful boolean DEFAULT true,
  ip_address inet,
  user_agent text,
  error_message text,
  accessed_at timestamptz DEFAULT now()
)
```

## Token Management

### Token Verification Flow

When a user saves a token in settings:

1. Frontend sends token to settings page
2. Token verified against ElevenLabs API
3. If valid, token encrypted and stored
4. User service `has_ai_calls` set to true
5. Success message displayed

```typescript
// settings/page.tsx
const verifyToken = async (token: string) => {
  const response = await fetch(
    'https://api.elevenlabs.io/v1/convai/conversations?page_size=1',
    { headers: { 'xi-api-key': token } }
  )
  return response.ok
}
```

### Token Rotation

Support for token rotation is built-in:

- `token_rotated_at` - Timestamp of last rotation
- `previous_token_hash` - Hash of previous token for detection
- `encryption_key_id` - Tracks encryption version

## Client-Side Filtering

While the API provides basic filtering, advanced filtering happens client-side:

- Search across multiple fields
- Duration range filtering
- Rating filtering
- Direction filtering
- Sort by multiple criteria

This approach provides flexibility while maintaining good performance.

## Performance Metrics

The system tracks key performance indicators:

```typescript
client.getMetrics()        // Get all API call metrics
client.getAverageResponseTime()  // Calculate average
client.getSuccessRate()    // Calculate success percentage
```

Metrics include:
- Request duration
- Success/failure status
- Endpoint called
- Timestamp

## Best Practices

### For Developers

1. **Always use the ElevenLabsAPIClient** - Don't create direct fetch calls
2. **Handle all error cases** - Use structured error responses
3. **Set appropriate timeouts** - Based on expected response size
4. **Log important events** - Use structured logging format
5. **Validate input parameters** - Check IDs and required fields
6. **Add response headers** - Include timing information

### For Security

1. **Never expose tokens** - Always use proxy pattern
2. **Enable RLS on new tables** - Security by default
3. **Log security events** - Track token access
4. **Validate authentication** - Check on every request
5. **Use encrypted storage** - For sensitive data

### For Performance

1. **Implement caching** - Use appropriate Cache-Control headers
2. **Monitor metrics** - Track response times
3. **Set timeouts** - Prevent hanging requests
4. **Use pagination** - Don't load all data at once
5. **Optimize queries** - Use indexes effectively

## Troubleshooting

### Common Issues

**Token Not Found Error**
- User hasn't configured ElevenLabs token
- Token was deleted
- Solution: Navigate to Settings → Configure token

**Request Timeout**
- Network issues
- ElevenLabs API slow
- Solution: Increase timeout or retry

**Unauthorized Error**
- Supabase session expired
- Invalid JWT token
- Solution: Re-authenticate user

### Debug Checklist

1. Check browser console for errors
2. Review server logs for API errors
3. Verify token is active in database
4. Check RLS policies are correct
5. Verify environment variables set
6. Test ElevenLabs API directly

## Future Enhancements

### Planned Features

1. **Retry Logic** - Automatic retry with exponential backoff
2. **Rate Limiting** - Protect against API quota exhaustion
3. **Webhook Support** - Real-time updates from ElevenLabs
4. **Token Rotation** - Automatic token refresh
5. **Analytics Dashboard** - Visualize API metrics
6. **Batch Operations** - Process multiple requests efficiently

### Migration Path

When implementing encrypted tokens fully:

1. Run migration to add encrypted columns
2. Migrate existing tokens using `migrate_plain_tokens_to_encrypted()`
3. Update API routes to use encrypted tokens
4. Remove plain text token column (after verification period)

## Support

For issues or questions:
1. Check application logs
2. Review this documentation
3. Check ElevenLabs API documentation
4. Contact development team

---

**Last Updated**: 2025-11-18
**Version**: 1.0
**Maintained By**: Development Team

# Database Schema & Patterns

> **Last Updated:** January 2026  
> **Database:** Convex (reactive database with built-in RAG)  
> **Auth:** Clerk (integrated via ConvexProviderWithClerk)

## Migration Status

✅ **Migration Complete:** Successfully migrated from Supabase to Convex.

| Feature | Status |
|---------|--------|
| Schema | ✅ Complete |
| Auth | ✅ Clerk integrated |
| Real-time | ✅ Native reactive queries |
| File Storage | ✅ Convex storage |
| Vector search | 📋 Ready (built-in RAG) |

## Current Schema (Convex)

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    users    │       │    chats    │       │  messages   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ _id (PK)    │──┐    │ _id (PK)    │──┐    │ _id (PK)    │
│ clerkId     │  │    │ userId (FK) │──┘    │ chatId (FK) │──┘
│ email       │  │    │ projectId   │       │ userId (FK) │──┐
│ displayName │  │    │ title       │       │ role        │  │
│ profileImage│  │    │ model       │       │ content     │  │
│ premium     │  │    │ public      │       │ parts       │  │
│ anonymous   │  │    │ pinned      │       │ attachments │  │
│ daily*      │  │    │ pinnedAt    │       │ model       │  │
│ systemPrompt│  │    │ updatedAt   │       │ orderId     │  │
└─────────────┘  │    └─────────────┘       └─────────────┘  │
                 │           │                               │
                 │    ┌──────┴──────┐                        │
                 │    │             │                        │
                 │    ▼             ▼                        │
            ┌─────────────┐  ┌─────────────┐                 │
            │  projects   │  │chatAttach-  │                 │
            ├─────────────┤  │   ments     │                 │
            │ _id (PK)    │  ├─────────────┤                 │
            │ userId (FK) │──┤ _id (PK)    │                 │
            │ name        │  │ chatId (FK) │                 │
            └─────────────┘  │ userId (FK) │─────────────────┘
                             │ storageId   │
                             │ fileUrl     │
                             │ fileName    │
                             └─────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│  userKeys   │       │userPrefs    │       │  feedback   │
├─────────────┤       ├─────────────┤       ├─────────────┤
│ userId(FK)  │       │ userId(FK)  │       │ _id (PK)    │
│ provider    │       │ layout      │       │ userId(FK)  │
│ encryptedKey│       │ promptSugg  │       │ message     │
│ iv          │       │ toolInvoc   │       └─────────────┘
└─────────────┘       │ convPrev    │
                      │ multiModel  │
┌─────────────┐       │ hiddenMdls  │
│anonymousUsage│      └─────────────┘
├─────────────┤
│ anonymousId │
│ dailyCount  │
│ dailyReset  │
└─────────────┘
```

### Schema Definition

Location: `convex/schema.ts`

```typescript
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    displayName: v.optional(v.string()),
    profileImage: v.optional(v.string()),
    anonymous: v.optional(v.boolean()),
    premium: v.optional(v.boolean()),
    messageCount: v.optional(v.number()),
    dailyMessageCount: v.optional(v.number()),
    dailyReset: v.optional(v.number()),
    dailyProMessageCount: v.optional(v.number()),
    dailyProReset: v.optional(v.number()),
    lastActiveAt: v.optional(v.number()),
    favoriteModels: v.optional(v.array(v.string())),
    systemPrompt: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  chats: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    model: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    public: v.boolean(),
    pinned: v.boolean(),
    pinnedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_pinned", ["userId", "pinned"])
    .index("by_project", ["projectId"]),

  messages: defineTable({
    chatId: v.id("chats"),
    orderId: v.optional(v.number()),
    userId: v.optional(v.id("users")),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
      v.literal("data")
    ),
    content: v.optional(v.string()),
    parts: v.optional(v.any()),
    attachments: v.optional(v.array(v.any())),
    messageGroupId: v.optional(v.string()),
    model: v.optional(v.string()),
  })
    .index("by_chat", ["chatId"])
    .index("by_chat_role", ["chatId", "role"]),

  // ... additional tables: projects, userPreferences, userKeys, feedback, chatAttachments, anonymousUsage
})
```

## Query Patterns

### Using Convex React Hooks

```typescript
// Real-time query - UI updates automatically when data changes
const chats = useQuery(api.chats.getForCurrentUser, {})

// Mutation
const createChat = useMutation(api.chats.create)
await createChat({ title: "New Chat", model: "claude-4-opus" })
```

### Fetching User's Chats

```typescript
// convex/chats.ts
export const getForCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique()
    
    if (!user) return []
    
    return await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect()
  },
})
```

### Loading Chat Messages

```typescript
// convex/messages.ts
export const getByChatId = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect()
  },
})
```

### Storing Assistant Response

```typescript
// convex/messages.ts
export const create = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.optional(v.string()),
    parts: v.optional(v.any()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      ...args,
      orderId: Date.now(),
    })
  },
})
```

## Rate Limiting

### Check and Increment Usage

```typescript
// convex/usage.ts
export const checkAndIncrement = mutation({
  args: { isProModel: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")
    
    const user = await getUserByClerkId(ctx, identity.subject)
    if (!user) throw new Error("User not found")
    
    const now = Date.now()
    const pacificMidnight = getPacificMidnight()
    
    // Check if reset needed
    const needsReset = !user.dailyReset || user.dailyReset < pacificMidnight
    
    if (needsReset) {
      await ctx.db.patch(user._id, {
        dailyMessageCount: 1,
        dailyReset: now,
      })
      return { allowed: true, count: 1 }
    }
    
    // Check limit and increment
    const count = (user.dailyMessageCount ?? 0) + 1
    const limit = args.isProModel ? DAILY_LIMIT_PRO_MODELS : AUTH_DAILY_MESSAGE_LIMIT
    
    if (count > limit) {
      return { allowed: false, count: user.dailyMessageCount }
    }
    
    await ctx.db.patch(user._id, { dailyMessageCount: count })
    return { allowed: true, count }
  },
})
```

## File Storage

### Upload File to Convex Storage

```typescript
// convex/files.ts
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")
    return await ctx.storage.generateUploadUrl()
  },
})

export const saveFile = mutation({
  args: {
    chatId: v.id("chats"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
  },
  handler: async (ctx, args) => {
    const fileUrl = await ctx.storage.getUrl(args.storageId)
    // Save to chatAttachments table...
  },
})
```

## Security

### Authentication via Clerk

```typescript
// Convex functions automatically have access to auth context
export const secureQuery = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      throw new Error("Not authenticated")
    }
    // identity.subject contains the Clerk user ID
  },
})
```

### Encrypted API Keys

```typescript
// API keys are encrypted before storage in userKeys table
// See lib/encryption.ts for implementation

// Store encrypted key
await ctx.db.insert("userKeys", {
  userId: user._id,
  provider: "openai",
  encryptedKey: encrypted,
  iv: initVector,
})

// Retrieve and decrypt (done in API routes, not Convex)
const { data } = await ctx.db
  .query("userKeys")
  .withIndex("by_user_provider", (q) => 
    q.eq("userId", userId).eq("provider", provider)
  )
  .unique()
```

## Convex Benefits

### Real-time by Default

```typescript
// No manual subscriptions needed - UI updates automatically
const chats = useQuery(api.chats.getForCurrentUser, {})
// When any chat is modified, this query re-runs automatically
```

### TypeScript-First

```typescript
// Full type safety from schema to client
const chat = await ctx.db.get(chatId)
chat.title // TypeScript knows this is string | undefined
```

### Built-in RAG Support (Future)

```typescript
// Vector search for relevant context (planned)
const relevantDocs = await ctx.db
  .query("embeddings")
  .withIndex("by_embedding")
  .filter((q) => q.eq(q.field("userId"), userId))
  .vectorSearch("embedding", queryEmbedding, { limit: 5 })
```

---

*See `convex/schema.ts` for the complete schema and `.agents/context/architecture.md` for data flow patterns.*

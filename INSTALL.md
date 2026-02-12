# Not A Wrapper Installation Guide

Not A Wrapper is an open-source, Next.js-based AI chat application that provides a unified interface for multiple models, including OpenAI, Mistral, Claude, and Gemini. This guide covers how to install and run Not A Wrapper locally for development and deploy to Vercel for production.

Based on [Zola](https://github.com/ibelick/zola), the open-source AI chat interface.

## Prerequisites

- [Bun](https://bun.sh) 1.3.1 or later (recommended) or Node.js 20.x or later
- Git
- Clerk account (for authentication)
- Convex account (for database)
- API keys for supported AI models (OpenAI, Anthropic, etc.)

## Environment Setup

First, you'll need to set up your environment variables. Create a `.env.local` file in the root of the project with the variables from `.env.example`

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
CLERK_JWT_ISSUER_DOMAIN=your_clerk_jwt_issuer_domain

# Convex Database
CONVEX_DEPLOYMENT=your_convex_deployment
NEXT_PUBLIC_CONVEX_URL=your_convex_url

# Security
CSRF_SECRET=your_csrf_secret_key
ENCRYPTION_KEY=your_encryption_key

# AI Providers (at least one required)
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key

# Optional AI Providers
MISTRAL_API_KEY=your_mistral_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_api_key
XAI_API_KEY=your_xai_api_key
EXA_API_KEY=your_exa_api_key

# Optional: Set the URL for production
# NEXT_PUBLIC_VERCEL_URL=your_production_url
```

A `.env.example` file is included in the repository for reference. Copy this file to `.env.local` and update the values with your credentials.

### Generating a CSRF Secret

The `CSRF_SECRET` is used to protect your application against Cross-Site Request Forgery attacks. You need to generate a secure random string for this value. Here are a few ways to generate one:

#### Using Node.js

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Using OpenSSL

```bash
openssl rand -hex 32
```

#### Using Python

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Copy the generated value and add it to your `.env.local` file as the `CSRF_SECRET` value.

### BYOK (Bring Your Own Key) Setup

Not A Wrapper supports BYOK functionality, allowing users to securely store and use their own API keys for AI providers. To enable this feature, you need to configure an encryption key for secure storage of user API keys.

#### Generating an Encryption Key

The `ENCRYPTION_KEY` is used to encrypt user API keys before storing them in the database. Generate a 32-byte base64-encoded key:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Using OpenSSL
openssl rand -base64 32

# Using Python
python -c "import base64, secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

Add the generated key to your `.env.local` file:

```bash
# Required for BYOK functionality
ENCRYPTION_KEY=your_generated_base64_encryption_key
```

**Important**:

- Keep this key secure and backed up - losing it will make existing user API keys unrecoverable
- Use the same key across all your deployment environments
- The key must be exactly 32 bytes when base64 decoded

With BYOK enabled, users can securely add their own API keys through the settings interface, giving them access to AI models using their personal accounts and usage limits.

#### Clerk Authentication Setup

Not A Wrapper uses Clerk for authentication. Follow these steps:

1. Create a Clerk account at [clerk.com](https://clerk.com)
2. Create a new application
3. Configure your sign-in options (Email, Google, GitHub, etc.)
4. Get your API keys from the Clerk dashboard:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
5. Configure the JWT issuer domain for Convex integration

#### Google OAuth via Clerk

1. In your Clerk dashboard, go to User & Authentication > Social Connections
2. Enable Google
3. Configure OAuth in Google Cloud Console:
   - Create OAuth 2.0 credentials
   - Add Clerk's redirect URI from your Clerk dashboard
4. Add your Google Client ID and Secret to Clerk

#### Guest Access

Anonymous/guest access is handled through the application's anonymous usage tracking in Convex. Users can try the product with limited daily messages before signing up.

### Database Setup (Convex)

Not A Wrapper uses Convex for the database. The schema is defined in TypeScript and automatically synced.

1. Create a Convex account at [convex.dev](https://convex.dev)
2. Create a new project
3. Get your deployment URL and add to `.env.local`:
   - `CONVEX_DEPLOYMENT`
   - `NEXT_PUBLIC_CONVEX_URL`

The schema is already defined in `convex/schema.ts`. When you run the app, Convex automatically creates the tables:

- `users` - User profiles linked to Clerk
- `chats` - Chat sessions
- `messages` - Chat messages
- `projects` - Project organization
- `userPreferences` - UI preferences
- `userKeys` - Encrypted API keys (BYOK)
- `feedback` - User feedback
- `chatAttachments` - File attachments
- `anonymousUsage` - Guest rate limiting

### File Storage

Convex includes built-in file storage. No additional setup required - file uploads are handled automatically through the `convex/files.ts` functions.

### Convex + Clerk Integration

To connect Clerk authentication with Convex:

1. In Convex dashboard, go to Settings > Authentication
2. Add Clerk as an auth provider
3. Add your Clerk JWT issuer domain
4. The `convex/auth.config.js` file is already configured

## Local Installation

### macOS / Linux

```bash
# Clone the repository
git clone https://github.com/your-username/not-a-wrapper.git
cd not-a-wrapper

# Install dependencies
bun install

# Run the development server
bun dev
```

### Windows

```bash
# Clone the repository
git clone https://github.com/your-username/not-a-wrapper.git
cd not-a-wrapper

# Install dependencies
bun install

# Run the development server
bun dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### AI Tool Skills Setup (For Developers)

If you're contributing to the project using AI coding tools (Cursor, Claude Code, Codex), run the skill sync script to set up shared development skills:

```bash
./.agents/skills/sync-agent-skills/scripts/sync-skills.sh
```

This creates symlinks in `.cursor/skills/`, `.claude/skills/`, and `.codex/skills/` pointing to the canonical skills in `.agents/skills/`. The skills provide specialized guidance for common tasks like adding AI providers or creating Convex functions.

**Note**: The symlinks are gitignored, so you need to run this script after every fresh clone.

## Convex Setup

Not A Wrapper uses Convex for its database. Follow these steps:

1. Create a new project at [convex.dev](https://convex.dev)
2. Run `npx convex dev` to sync your schema
3. Get your deployment URL and add to `.env.local`
4. Configure Clerk integration in Convex dashboard

See the "Database Setup (Convex)" section above for details.

## Production Deployment

### Deploy to Vercel

The easiest way to deploy Not A Wrapper is using Vercel:

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. Import the project into Vercel
3. Configure your environment variables
4. Deploy

```bash
# Install Vercel CLI
bun add -g vercel

# Deploy
vercel
```

## Configuration Options

You can customize various aspects of Not A Wrapper by modifying the configuration files:

- `app/lib/config.ts`: Configure AI models, daily message limits, etc.
- `.env.local`: Set environment variables and API keys

## Troubleshooting

### Common Issues

1. **Connection to Convex fails**

   - Check your Convex deployment URL
   - Ensure your environment variables are set correctly
   - Run `npx convex dev` to sync your schema

2. **AI models not responding**

   - Verify your API keys for OpenAI/Mistral
   - Check that the models specified in config are available

## Community and Support

- GitHub Issues: Report bugs or request features
- GitHub Discussions: Ask questions and share ideas

## License

Apache License 2.0

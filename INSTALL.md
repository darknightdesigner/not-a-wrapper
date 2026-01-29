# Not A Wrapper Installation Guide

Not A Wrapper is an open-source, Next.js-based AI chat application that provides a unified interface for multiple models, including OpenAI, Mistral, Claude, and Gemini. This guide covers how to install and run Not A Wrapper on different platforms, including Docker deployment options.

Based on [Zola](https://github.com/ibelick/zola), the open-source AI chat interface.

## Prerequisites

- [Bun](https://bun.sh) 1.0 or later (recommended) or Node.js 18.x or later
- Git
- Clerk account (for authentication)
- Convex account (for database)
- API keys for supported AI models (OpenAI, Anthropic, etc.) OR Ollama for local models

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

# Ollama (for local AI models)
OLLAMA_BASE_URL=http://localhost:11434

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

## Ollama Setup (Local AI Models)

Ollama allows you to run AI models locally on your machine. Not A Wrapper has built-in support for Ollama with automatic model detection.

### Installing Ollama

#### macOS and Linux

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

#### Windows

Download and install from [ollama.ai](https://ollama.ai/download)

#### Docker

```bash
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
```

### Setting up Models

After installing Ollama, you can download and run models:

```bash
# Popular models to get started
ollama pull llama3.2          # Meta's Llama 3.2 (3B)
ollama pull llama3.2:1b       # Smaller, faster version
ollama pull gemma2:2b         # Google's Gemma 2 (2B)
ollama pull qwen2.5:3b        # Alibaba's Qwen 2.5 (3B)
ollama pull phi3.5:3.8b       # Microsoft's Phi 3.5 (3.8B)

# Coding-focused models
ollama pull codellama:7b      # Meta's Code Llama
ollama pull deepseek-coder:6.7b # DeepSeek Coder

# List available models
ollama list

# Start the Ollama service (if not running)
ollama serve
```

### Not A Wrapper + Ollama Integration

Not A Wrapper automatically detects all models available in your Ollama installation. No additional configuration is needed!

**Features:**

- **Automatic Model Detection**: Not A Wrapper scans your Ollama instance and makes all models available
- **Intelligent Categorization**: Models are automatically categorized by family (Llama, Gemma, Qwen, etc.)
- **Smart Tagging**: Models get appropriate tags (local, open-source, coding, size-based)
- **No Pro Restrictions**: All Ollama models are free to use
- **Custom Endpoints**: Support for remote Ollama instances

### Configuration Options

#### Default Configuration

By default, Not A Wrapper connects to Ollama at `http://localhost:11434`. This works for local installations.

#### Custom Ollama URL

To use a remote Ollama instance or custom port:

```bash
# In your .env.local file
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

#### Runtime Configuration

You can also set the Ollama URL at runtime:

```bash
OLLAMA_BASE_URL=http://your-ollama-server:11434 bun dev
```

#### Settings UI

Not A Wrapper includes a settings interface where you can:

- Enable/disable Ollama integration
- Configure custom Ollama base URLs
- Add multiple Ollama instances
- Manage other AI providers

Access settings through the gear icon in the interface.

### Docker with Ollama

For a complete Docker setup with both Not A Wrapper and Ollama:

```bash
# Use the provided Docker Compose file
docker-compose -f docker-compose.ollama.yml up

# Or manually with separate containers
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
docker run -p 3000:3000 -e OLLAMA_BASE_URL=http://ollama:11434 not-a-wrapper
```

The `docker-compose.ollama.yml` file includes:

- Ollama service with GPU support (if available)
- Automatic model pulling
- Health checks
- Proper networking between services

### Troubleshooting Ollama

#### Ollama not detected

1. Ensure Ollama is running: `ollama serve`
2. Check the URL: `curl http://localhost:11434/api/tags`
3. Verify firewall settings if using remote Ollama

#### Models not appearing

1. Refresh the models list in Not A Wrapper settings
2. Check Ollama has models: `ollama list`
3. Restart Not A Wrapper if models were added after startup

#### Performance optimization

1. Use smaller models for faster responses (1B-3B parameters)
2. Enable GPU acceleration if available
3. Adjust Ollama's `OLLAMA_NUM_PARALLEL` environment variable

## Disabling Ollama

Ollama is automatically enabled in development and disabled in production. If you want to disable it in development, you can use an environment variable:

### Environment Variable

Add this to your `.env.local` file:

```bash
# Disable Ollama in development
DISABLE_OLLAMA=true
```

### Note

- In **production**, Ollama is disabled by default to avoid connection errors
- In **development**, Ollama is enabled by default for local AI model testing
- Use `DISABLE_OLLAMA=true` to disable it in development

### Recommended Models by Use Case

#### General Chat

- `llama3.2:3b` - Good balance of quality and speed
- `gemma2:2b` - Fast and efficient
- `qwen2.5:3b` - Excellent multilingual support

#### Coding

- `codellama:7b` - Specialized for code generation
- `deepseek-coder:6.7b` - Strong coding capabilities
- `phi3.5:3.8b` - Good for code explanation

#### Creative Writing

- `llama3.2:8b` - Better for creative tasks
- `mistral:7b` - Good instruction following

#### Fast Responses

- `llama3.2:1b` - Ultra-fast, basic capabilities
- `gemma2:2b` - Quick and capable

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

## Convex Setup

Not A Wrapper uses Convex for its database. Follow these steps:

1. Create a new project at [convex.dev](https://convex.dev)
2. Run `npx convex dev` to sync your schema
3. Get your deployment URL and add to `.env.local`
4. Configure Clerk integration in Convex dashboard

See the "Database Setup (Convex)" section above for details.

## Docker Installation

### Option 1: Single Container with Docker

Create a `Dockerfile` in the root of your project if that doesnt exist:

```dockerfile
# Base Bun image
FROM oven/bun:1 AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules

# Copy all project files
COPY . .

# Set Next.js telemetry to disabled
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN bun run build

# Production image, copy all the files and run next
# Use Node.js for runtime as Next.js standalone output is optimized for Node
FROM node:20-alpine AS runner
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files for production
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose application port
EXPOSE 3000

# Set environment variable for port
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Health check to verify container is running properly
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the application
CMD ["node", "server.js"]
```

Build and run the Docker container:

```bash
# Build the Docker image
docker build -t not-a-wrapper .

# Run the container
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key \
  -e CLERK_SECRET_KEY=your_clerk_secret_key \
  -e CLERK_JWT_ISSUER_DOMAIN=your_clerk_jwt_issuer_domain \
  -e CONVEX_DEPLOYMENT=your_convex_deployment \
  -e NEXT_PUBLIC_CONVEX_URL=your_convex_url \
  -e CSRF_SECRET=your_csrf_secret \
  -e ENCRYPTION_KEY=your_encryption_key \
  -e ANTHROPIC_API_KEY=your_anthropic_api_key \
  -e OPENAI_API_KEY=your_openai_api_key \
  not-a-wrapper
```

### Option 2: Docker Compose

Create a `docker-compose.yml` file in the root of your project:

```yaml
version: "3"

services:
  not-a-wrapper:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - CONVEX_DEPLOYMENT=${CONVEX_DEPLOYMENT}
      - NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL}
      - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      - CLERK_SECRET_KEY=${CLERK_SECRET_KEY}
      - CLERK_JWT_ISSUER_DOMAIN=${CLERK_JWT_ISSUER_DOMAIN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    restart: unless-stopped
```

Run with Docker Compose:

```bash
# Start the services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the services
docker-compose down
```

### Option 3: Docker Compose with Ollama (Recommended for Local AI)

For a complete setup with both Not A Wrapper and Ollama running locally, use the provided `docker-compose.ollama.yml`:

```bash
# Start both vid0 and Ollama services
docker-compose -f docker-compose.ollama.yml up -d

# View logs
docker-compose -f docker-compose.ollama.yml logs -f

# Stop the services
docker-compose -f docker-compose.ollama.yml down
```

This setup includes:

- **Ollama service** with GPU support (if available)
- **Automatic model pulling** (llama3.2:3b by default)
- **Health checks** for both services
- **Proper networking** between Not A Wrapper and Ollama
- **Volume persistence** for Ollama models

The Ollama service will be available at `http://localhost:11434` and Not A Wrapper will automatically detect all available models.

To customize which models are pulled, edit the `docker-compose.ollama.yml` file and modify the `OLLAMA_MODELS` environment variable:

```yaml
environment:
  - OLLAMA_MODELS=llama3.2:3b,gemma2:2b,qwen2.5:3b
```

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

### Self-Hosted Production

For a self-hosted production environment, you'll need to build the application and run it:

```bash
# Build the application
bun run build

# Start the production server
bun start
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

3. **Docker container exits immediately**
   - Check logs using `docker logs <container_id>`
   - Ensure all required environment variables are set

## Community and Support

- GitHub Issues: Report bugs or request features
- GitHub Discussions: Ask questions and share ideas

## License

Apache License 2.0

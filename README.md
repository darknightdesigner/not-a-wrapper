# Not A Wrapper

**Not A Wrapper** is an open-source, Next.js-based AI chat application that provides a unified interface for multiple models, including OpenAI, Mistral, Claude, and Gemini. It supports BYOK (Bring Your Own Key) via OpenRouter, offers file uploads, and features a responsive UI with light/dark themes.

Forked from [Zola](https://github.com/ibelick/zola) and updated with state-of-the-art technologies like Convex and Flowglad.

## Features

- 🤖 **Multi-model support** - OpenAI, Claude, Gemini, Mistral, Perplexity, xAI, and 100+ models
- 🔄 **Multi-model comparison** - Send the same prompt to multiple models and compare responses side-by-side
- 🔑 **Bring your own API key (BYOK)** - Use your own keys via OpenRouter or direct provider APIs
- 📎 **File uploads** - Share documents, images, and code for AI analysis
- 🎨 **Clean, responsive UI** - Light/dark themes with modern design
- 🏠 **Self-hostable** - Full control over your data
- ⚙️ **Customizable** - User system prompts, multiple layout options
- 🖥️ **Local AI with Ollama** - Run models locally with automatic detection
- 💳 **Usage-based billing ready** - Flowglad integration for AI usage metering
- 🔌 **MCP support** (work in progress)

## Quick Start

### Option 1: With OpenAI (Cloud)

```bash
git clone https://github.com/your-username/not-a-wrapper.git
cd not-a-wrapper
bun install
echo "OPENAI_API_KEY=your-key" > .env.local
bun dev
```

### Option 2: With Ollama (Local)

```bash
# Install and start Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3.2  # or any model you prefer

# Clone and run
git clone https://github.com/your-username/not-a-wrapper.git
cd not-a-wrapper
bun install
bun dev
```

Not A Wrapper will automatically detect your local Ollama models!

### Option 3: Docker with Ollama

```bash
git clone https://github.com/your-username/not-a-wrapper.git
cd not-a-wrapper
docker-compose -f docker-compose.ollama.yml up
```

To unlock features like auth, file uploads, see [INSTALL.md](./INSTALL.md).

## Supported AI Providers

| Provider | Models | Features |
|----------|--------|----------|
| **OpenAI** | GPT-4.1, GPT-4o, O1, O3-mini | Vision, Tools |
| **Anthropic** | Claude 3.5/3.7 Sonnet, Claude 3 Opus | Extended context, Vision |
| **Google** | Gemini 2.0 Flash, Gemini 1.5/2.5 Pro | Vision, Multimodal |
| **Mistral** | Mistral Large, Pixtral, Mixtral | Vision |
| **xAI** | Grok-3, Grok-2 Vision | Vision |
| **Perplexity** | Sonar Pro, Deep Research | Web search |
| **Ollama** | Any local model | Local, Private |
| **OpenRouter** | 100+ models | Aggregator |

## Built With

- [Next.js 16](https://nextjs.org/) — React framework with App Router
- [Convex](https://convex.dev) — Real-time database with built-in RAG
- [Clerk](https://clerk.com) — Authentication
- [Vercel AI SDK](https://sdk.vercel.ai/) — Model integration
- [Flowglad](https://flowglad.com) — Usage-based payments
- [Shadcn/ui](https://ui.shadcn.com) — UI components
- [Motion Primitives](https://motion-primitives.com) — Animations

## Based On

This project is a fork of [Zola](https://github.com/ibelick/zola), the open-source AI chat interface. Special thanks to the Zola team for creating such an excellent foundation.

## License

Apache License 2.0

## Notes

This is a beta release. The codebase is evolving and may change.

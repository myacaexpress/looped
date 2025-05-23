# Looped V1.0

An AI-powered chatbot solution designed to provide instant, accurate, and human-like internal support to employees within client organizations. Looped features an intelligent, tiered AI-to-human handoff mechanism to optimize agent intervention and reduce workload on internal support teams.

## 🚀 Features

- **Embeddable Chat Widget**: JavaScript snippet for easy integration into client web applications
- **Natural Language Understanding**: AI comprehends and responds to employee queries in natural language
- **Knowledge Base Retrieval (RAG)**: AI sources answers from company-specific knowledge bases
- **Intelligent Handoff System**: Green/Yellow/Red states for optimized AI-to-human transitions
- **Admin Dashboard**: Complete inbox management for support agents
- **Real-time Communication**: Live updates using Supabase Realtime
- **Multi-tenant Architecture**: Secure tenant isolation with Row Level Security

## 🛠 Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, TailwindCSS
- **Backend**: Supabase (Auth, Database, Storage, Edge Functions, Realtime)
- **AI Orchestration**: LangGraph.js for conversational AI agent management
- **Database**: PostgreSQL with pgvector for vector similarity search
- **Authentication**: Supabase Auth (Email/Password, Google OAuth)

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account
- OpenAI API key (for LLM integration)

## 🚀 Getting Started

### 1. Clone and Install

```bash
git clone <repository-url>
cd looped
npm install
```

### 2. Environment Setup

Create a `.env.local` file in the root directory:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Setup

1. Create a new Supabase project
2. Enable the pgvector extension in your Supabase database
3. Run the database migrations (coming soon)

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## 📁 Project Structure

```
looped/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication pages
│   ├── dashboard/         # Admin dashboard
│   ├── api/              # API routes
│   └── globals.css       # Global styles
├── components/           # Reusable React components
│   ├── ui/              # Base UI components
│   ├── chat/            # Chat widget components
│   └── dashboard/       # Dashboard components
├── lib/                 # Utility functions and configurations
│   ├── supabase/        # Supabase client and utilities
│   ├── ai/              # LangGraph and AI logic
│   └── utils/           # General utilities
├── types/               # TypeScript type definitions
├── public/              # Static assets
└── supabase/           # Supabase configuration and migrations
```

## 🎯 Key Components

### Chat Widget
- Embeddable JavaScript snippet
- Real-time messaging
- AI persona "Everly"
- Human handoff capabilities

### Admin Dashboard
- Conversation inbox with color-coded states
- Knowledge base management
- Analytics and reporting
- Agent intervention tools

### AI System
- LangGraph.js orchestration
- Confidence-based routing
- Vector similarity search
- Multi-state conversation management

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

### Code Style

This project uses:
- TypeScript for type safety
- ESLint for code linting
- Prettier for code formatting
- TailwindCSS for styling

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Manual Deployment

```bash
npm run build
npm run start
```

## 📊 Success Metrics

- AI Resolution Rate: Percentage of queries resolved without human intervention
- Agent Effort Reduction: Time saved per interaction
- User Satisfaction Score (CSAT)
- System uptime and API latency
- Knowledge Base processing efficiency

## 🔐 Security

- Row Level Security (RLS) for tenant isolation
- Secure API endpoints with authentication
- Input validation and sanitization
- Data encryption at rest and in transit

## 📚 Documentation

- [API Documentation](./docs/api.md) (coming soon)
- [Deployment Guide](./docs/deployment.md) (coming soon)
- [Architecture Overview](./docs/architecture.md) (coming soon)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in this repository
- Contact the development team
- Check the documentation

---

Built with ❤️ by the Looped Team

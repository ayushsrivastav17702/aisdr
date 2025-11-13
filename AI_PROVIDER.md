# AI Provider Configuration Guide

This document provides comprehensive guidance on configuring and using multiple AI providers in the SDR platform.

## Overview

The platform supports multiple AI providers for natural language processing, email generation, and other AI-powered features. The system implements an automatic fallback mechanism to ensure high availability and resilience.

## Supported AI Providers

### 1. OpenAI (Primary)
- **Models**: GPT-4o (default), GPT-4, GPT-3.5-turbo
- **Use Cases**: Natural language query parsing, email generation, LinkedIn analysis
- **Configuration**:
  - `OPENAI_API_KEY`: Primary OpenAI API key
  - `OPENAI_API_KEY_BACKUP`: Optional backup key for quota failover
- **Features**: Native JSON mode support, high reliability, consistent performance

### 2. OpenRouter (Flexible Multi-Model Gateway)
- **Models**: Configurable via `OPENROUTER_MODEL` (default: `openai/gpt-4o`)
- **Popular Options**:
  - `openai/gpt-4o` - OpenAI GPT-4o via OpenRouter
  - `anthropic/claude-sonnet-4` - Claude Sonnet 4
  - `google/gemini-pro` - Google Gemini Pro
  - `meta-llama/llama-3.1-405b` - Meta Llama 3.1 405B
- **Configuration**:
  - `OPEN_ROUTER`: OpenRouter API key (stored in Replit Secrets)
  - `OPENROUTER_MODEL`: Model identifier (optional, defaults to `openai/gpt-4o`)
- **Features**: Access to multiple models through a single API, cost optimization, model diversity

### 3. Anthropic
- **Models**: Claude Sonnet 4 (default)
- **Use Cases**: Fallback for NLP and email generation
- **Configuration**:
  - `ANTHROPIC_API_KEY`: Anthropic API key
- **Features**: Strong reasoning capabilities, alternative to OpenAI

## AI Provider Selection

### Environment Variable: `AI_PROVIDER`

Controls which AI provider is used as the **primary** provider for natural language processing. If not set, defaults to `openai`.

**Supported Values:**
- `openai` (default) - Use OpenAI as primary provider
- `openrouter` - Use OpenRouter as primary provider
- `anthropic` - Use Anthropic as primary provider

**Example:**
```bash
AI_PROVIDER=openrouter
OPENROUTER_MODEL=anthropic/claude-sonnet-4
```

## Automatic Fallback Behavior

The platform implements intelligent fallback mechanisms to ensure high availability:

### Natural Language Processing (AIService)

**When AI_PROVIDER is NOT set (default):**
1. Primary OpenAI → 
2. OpenRouter (if configured) → 
3. Anthropic (if configured) → 
4. Keyword extraction fallback

**When AI_PROVIDER=openrouter:**
1. OpenRouter → 
2. Primary OpenAI (if quota exceeded) → 
3. Anthropic → 
4. Keyword extraction fallback

**When AI_PROVIDER=anthropic:**
1. Anthropic → 
2. Primary OpenAI → 
3. Keyword extraction fallback

### Email Generation (AIEmailGeneratorService)

**Fallback order (quota-based):**
1. Primary OpenAI → 
2. Backup OpenAI (if `OPENAI_API_KEY_BACKUP` is set) → 
3. OpenRouter (if configured) → 
4. Anthropic → 
5. Fallback email template

## JSON Mode Compatibility

### What is JSON Mode?

JSON mode (`response_format: { type: "json_object" }`) is an OpenAI API feature that ensures the model always returns valid JSON responses. This is critical for structured data extraction in our platform.

### Model Compatibility

**✅ JSON Mode Supported:**
- OpenAI models (GPT-4o, GPT-4, GPT-3.5-turbo)
- Anthropic models (Claude Sonnet 4) via OpenRouter
- Models with `openai/` or `anthropic/` prefix on OpenRouter

**❌ JSON Mode NOT Supported:**
- Google Gemini models
- Meta Llama models
- Most open-source models on OpenRouter

### Implementation Details

The platform automatically detects JSON mode support based on the model name:

```typescript
const supportsJsonMode = model.includes('openai/') || model.includes('anthropic/');
```

**For models that don't support JSON mode:**
- JSON mode is automatically disabled
- The system parses markdown code blocks (```json ... ```)
- May result in less reliable JSON parsing

### Recommendation

For production use, prefer models that support JSON mode to ensure reliable structured data extraction:
- `openai/gpt-4o` (recommended)
- `openai/gpt-4`
- `anthropic/claude-sonnet-4`

## Cost Management and Monitoring

### Understanding Costs

Different providers have different pricing models:

| Provider | Typical Cost (per 1M tokens) | Notes |
|----------|------------------------------|-------|
| OpenAI GPT-4o | $2.50 input / $10 output | Direct pricing |
| OpenRouter | Varies by model | Adds small markup (typically 10-20%) |
| Anthropic | $3 input / $15 output | Direct pricing |

### Cost Optimization Strategies

1. **Use OpenRouter for Cost Efficiency**
   ```bash
   AI_PROVIDER=openrouter
   OPENROUTER_MODEL=openai/gpt-4o
   ```
   Benefits: Unified billing, easy model switching, often competitive pricing

2. **Implement Backup Keys for Quota Management**
   ```bash
   OPENAI_API_KEY=sk-primary...
   OPENAI_API_KEY_BACKUP=sk-backup...
   ```
   Automatically fails over when primary quota is exceeded

3. **Monitor Usage via Logs**
   The platform logs all AI provider transitions:
   ```
   🤖 Using OpenAI for AI search parsing...
   ⚠️ Primary OpenAI API key quota exceeded, switching to backup key...
   🤖 OpenAI failed, falling back to OpenRouter...
   ```

### Monitoring Best Practices

1. **Enable OpenRouter Dashboard Alerts**
   - Set up usage alerts in your OpenRouter dashboard
   - Monitor spend by model
   - Track rate limit events

2. **Review Application Logs**
   ```bash
   grep "🤖" /tmp/logs/Start_application*.log
   grep "⚠️" /tmp/logs/Start_application*.log
   ```

3. **Set Budget Limits**
   - Configure budget limits in OpenAI dashboard
   - Set spending alerts in OpenRouter
   - Monitor Anthropic usage on their console

## Configuration Examples

### Example 1: OpenAI Only (Simplest)
```bash
OPENAI_API_KEY=sk-...
```

### Example 2: OpenAI with Backup
```bash
OPENAI_API_KEY=sk-primary...
OPENAI_API_KEY_BACKUP=sk-backup...
```

### Example 3: OpenRouter as Primary
```bash
AI_PROVIDER=openrouter
OPEN_ROUTER=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4
OPENAI_API_KEY=sk-...  # Fallback
```

### Example 4: Full Redundancy (Recommended for Production)
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-primary...
OPENAI_API_KEY_BACKUP=sk-backup...
OPEN_ROUTER=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-4o
ANTHROPIC_API_KEY=sk-ant-...
```

## Troubleshooting

### Issue: "OpenAI not initialized" Error
**Solution**: Set `OPENAI_API_KEY` in Replit Secrets

### Issue: OpenRouter Returns Non-JSON Response
**Solution**: 
1. Check if your model supports JSON mode
2. Use an OpenAI or Anthropic model via OpenRouter
3. Update `OPENROUTER_MODEL` to a compatible model

### Issue: High Costs with OpenRouter
**Solution**:
1. Review your `OPENROUTER_MODEL` - some models are expensive
2. Consider switching to `openai/gpt-4o` for cost efficiency
3. Enable rate limiting in OpenRouter dashboard

### Issue: All Providers Failing
**Fallback Behavior**:
- For AI search: Falls back to keyword extraction (basic but functional)
- For email generation: Uses template-based fallback emails
- Check logs for specific error messages

## Future Enhancements

### Planned Features
- [ ] Per-request model selection via API
- [ ] Cost tracking and analytics dashboard
- [ ] Automatic model selection based on task complexity
- [ ] A/B testing different models for quality comparison

### Testing Enhancements
- [ ] Failure injection flag (`OPENAI_FORCE_429`) for deterministic testing
- [ ] Integration tests for quota-exceeded scenarios
- [ ] Automated fallback path verification

## Additional Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenRouter Documentation](https://openrouter.ai/docs)
- [Anthropic API Documentation](https://docs.anthropic.com)
- [Platform replit.md](./replit.md) - Project overview and architecture

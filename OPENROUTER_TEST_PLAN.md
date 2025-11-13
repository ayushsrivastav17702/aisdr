# OpenRouter Integration Test Plan

## Overview
This document outlines manual and automated test scenarios for validating the OpenRouter integration and multi-provider AI fallback system.

## Test Environment Setup

### Prerequisites
1. Valid API keys configured in Replit Secrets:
   - `OPENAI_API_KEY` - Primary OpenAI key
   - `OPENAI_API_KEY_BACKUP` - Backup OpenAI key (optional)
   - `OPEN_ROUTER` - OpenRouter API key
   - `ANTHROPIC_API_KEY` - Anthropic key (optional)

2. Environment variables:
   - `AI_PROVIDER` - Set to test different primary providers
   - `OPENROUTER_MODEL` - Set to test different models

## Test Scenarios

### Scenario 1: AI Search with OpenRouter as Primary Provider
**Objective**: Verify OpenRouter works as the primary AI provider for natural language search.

**Setup**:
```bash
AI_PROVIDER=openrouter
OPENROUTER_MODEL=openai/gpt-4o
```

**Test Steps**:
1. Navigate to AI Search page
2. Enter query: "Find CTOs at SaaS companies in San Francisco with 50-200 employees"
3. Submit search

**Expected Results**:
- Log shows: `🤖 Using OpenRouter for AI search parsing (AI_PROVIDER=openrouter)...`
- Search results are returned with appropriate filters
- Structured filters include job titles, locations, company size

**Pass Criteria**: ✅ OpenRouter successfully parses query and returns Apollo filters

---

### Scenario 2: Default Fallback Chain (OpenAI → OpenRouter → Anthropic)
**Objective**: Verify automatic fallback when primary provider fails.

**Setup**:
```bash
# Default AI_PROVIDER (openai)
# All providers configured
```

**Test Steps**:
1. Monitor logs: `grep "🤖" /tmp/logs/Start_application*.log`
2. Execute AI search or email generation
3. Observe fallback behavior if any provider fails

**Expected Log Sequence** (if OpenAI quota exceeded):
```
🤖 Using OpenAI for AI search parsing...
⚠️ Primary OpenAI API key quota exceeded, switching to backup key...
⚠️ Backup OpenAI key also failed...
⚠️ Falling back to OpenRouter...
```

**Pass Criteria**: ✅ System automatically tries OpenRouter after OpenAI failures

---

### Scenario 3: Email Generation with OpenRouter Fallback
**Objective**: Verify OpenRouter works for AI email generation.

**Setup**:
```bash
OPENROUTER_MODEL=anthropic/claude-sonnet-4
```

**Test Steps**:
1. Navigate to Prospects page
2. Select a prospect with complete data
3. Click "Generate Email"
4. Select email type (e.g., Initial Outreach)

**Expected Results**:
- Email subject and body generated successfully
- Log shows which provider was used
- Generated email is personalized and coherent

**Pass Criteria**: ✅ Email generated successfully via OpenRouter (if primary fails)

---

### Scenario 4: JSON Mode Compatibility Test
**Objective**: Verify JSON mode compatibility detection works correctly.

**Test Cases**:

| Model | Supports JSON Mode | Expected Behavior |
|-------|-------------------|-------------------|
| `openai/gpt-4o` | ✅ Yes | response_format applied |
| `anthropic/claude-sonnet-4` | ✅ Yes | response_format applied |
| `google/gemini-pro` | ❌ No | response_format omitted |
| `meta-llama/llama-3.1-405b` | ❌ No | response_format omitted |

**Test Steps** (for each model):
1. Set `OPENROUTER_MODEL=<model>`
2. Set `AI_PROVIDER=openrouter`
3. Execute AI search
4. Check logs for JSON parsing errors

**Expected Results**:
- OpenAI/Anthropic models: Clean JSON parsing
- Other models: May parse markdown code blocks
- No JSON parsing errors in logs

**Pass Criteria**: ✅ All models work without errors, appropriate parsing method used

---

### Scenario 5: Quota Exhaustion Simulation
**Objective**: Verify fallback behavior when quota is exhausted.

⚠️ **Warning**: This test may consume API credits. Use with caution.

**Manual Test Steps**:
1. Temporarily set invalid/exhausted OpenAI key
2. Execute AI search
3. Monitor logs for fallback behavior
4. Restore valid key after test

**Expected Log Sequence**:
```
🤖 Using OpenAI for AI search parsing...
⚠️ OpenAI parsing failed: [error message]
⚠️ Falling back to OpenRouter...
🤖 Using OpenRouter for AI search parsing...
```

**Pass Criteria**: ✅ System automatically fails over to OpenRouter

---

### Scenario 6: All Providers Unavailable
**Objective**: Verify graceful degradation to keyword extraction.

**Setup**:
```bash
# Temporarily remove all AI provider keys from Secrets
```

**Test Steps**:
1. Execute AI search with simple query
2. Check for keyword extraction fallback

**Expected Results**:
- Log shows: `⚠️ No AI providers configured. Using keyword extraction...`
- Basic search still works using keyword matching
- System doesn't crash

**Pass Criteria**: ✅ System falls back to keyword extraction, continues functioning

---

## Automated Test Checklist

### Unit Tests (Future Enhancement)
- [ ] Test `supportsJsonMode` logic for various model names
- [ ] Test fallback chain ordering in `callWithFallback`
- [ ] Test response parsing for OpenAI vs Anthropic formats

### Integration Tests (Future Enhancement)
- [ ] Add `OPENAI_FORCE_429` environment flag for deterministic testing
- [ ] Test quota-exceeded scenarios without consuming real quota
- [ ] Verify all providers are called in correct order
- [ ] Assert response parsing works for each provider

## Monitoring and Validation

### During Testing
Monitor these log patterns:
```bash
# AI provider initialization
grep "✅" /tmp/logs/Start_application*.log | grep -E "(OpenAI|OpenRouter|Anthropic)"

# Fallback events
grep "⚠️" /tmp/logs/Start_application*.log | grep -i "fallback"

# AI usage
grep "🤖" /tmp/logs/Start_application*.log
```

### Post-Testing Validation
1. **Cost Monitoring**: Check OpenRouter dashboard for usage
2. **Error Rate**: Review logs for unexpected errors
3. **Performance**: Verify response times are acceptable

## Test Results Template

```
Test Date: [DATE]
Tester: [NAME]
Environment: [Production/Staging/Development]

| Scenario | Status | Notes |
|----------|--------|-------|
| 1. OpenRouter Primary | ✅/❌ | |
| 2. Fallback Chain | ✅/❌ | |
| 3. Email Generation | ✅/❌ | |
| 4. JSON Compatibility | ✅/❌ | |
| 5. Quota Exhaustion | ✅/❌ | |
| 6. Graceful Degradation | ✅/❌ | |

Issues Found:
- [List any issues]

Recommendations:
- [Any recommendations]
```

## Rollback Plan

If OpenRouter integration causes issues:

1. **Immediate Rollback**: Remove `OPEN_ROUTER` from Secrets
   - System will fall back to OpenAI → Anthropic → Keyword extraction
   - No code changes required

2. **Partial Rollback**: Set `AI_PROVIDER=openai`
   - OpenRouter remains available as fallback
   - Primary provider reverts to OpenAI

3. **Full Revert**: Remove OpenRouter code (requires deployment)
   - Restore previous version from git
   - Remove OpenRouter client initialization

## Success Criteria

The OpenRouter integration is considered successful when:
- ✅ All 6 test scenarios pass
- ✅ No increase in error rates
- ✅ Cost per AI operation is within acceptable limits
- ✅ Response times remain under 5 seconds for AI search
- ✅ Email generation quality is maintained or improved

## Next Steps After Testing

1. Monitor production metrics for 24-48 hours
2. Compare costs between OpenRouter and direct OpenAI usage
3. Gather user feedback on AI quality
4. Consider expanding to additional OpenRouter models
5. Document any model-specific quirks or optimizations

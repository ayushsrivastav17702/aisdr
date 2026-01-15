import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  XCircle,
  CheckCircle,
  Sparkles,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export interface ValidationWarning {
  type: 'error' | 'warning' | 'info';
  message: string;
  code: string;
}

interface PreSendValidationProps {
  subject: string;
  body: string;
  campaignStage?: string;
  onFixWithAI?: () => void;
  onSendAnyway?: () => void;
  canSendAnyway?: boolean;
  className?: string;
}

function countWords(text: string): number {
  const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plainText.split(' ').filter(w => w.length > 0).length;
}

function countQuestionMarks(text: string): number {
  return (text.match(/\?/g) || []).length;
}

function detectPitchLanguage(text: string): boolean {
  const pitchPhrases = [
    'our platform', 'our solution', 'our product', 'our software',
    'we help', 'we enable', 'we provide', 'we offer',
    'schedule a demo', 'book a call', 'book a demo',
    'industry leading', 'best in class', 'cutting edge',
    'save you time', 'save you money', 'increase revenue',
    'roi', 'return on investment'
  ];
  const lowerText = text.toLowerCase();
  return pitchPhrases.some(phrase => lowerText.includes(phrase));
}

function detectCalendarLink(text: string): boolean {
  const calendarPatterns = [
    'calendly.com', 'cal.com', 'hubspot.com/meetings',
    'outlook.office365.com/owa/calendar', 
    'schedule a time', 'book a time', 'pick a time',
    'calendar link', 'calendly', 'cal link'
  ];
  const lowerText = text.toLowerCase();
  return calendarPatterns.some(pattern => lowerText.includes(pattern));
}

function detectUnresolvedTokens(text: string): string[] {
  const tokenPattern = /\{\{([^}]+)\}\}/g;
  const matches = [];
  let match;
  while ((match = tokenPattern.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

export function validateEmailContent(
  subject: string,
  body: string,
  campaignStage?: string
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const fullText = `${subject} ${body}`;
  const wordCount = countWords(body);
  const questionCount = countQuestionMarks(body);
  const isFirstTouch = campaignStage === 'first_touch' || campaignStage === 'First Touch';

  if (wordCount > 130) {
    warnings.push({
      type: 'warning',
      code: 'WORD_COUNT_EXCEEDED',
      message: `Message is ${wordCount} words. Emails under 130 words get 2x more replies.`
    });
  }

  if (questionCount > 1) {
    warnings.push({
      type: 'warning',
      code: 'MULTIPLE_CTAS',
      message: `${questionCount} questions detected. Use ONE clear question to increase response rates.`
    });
  }

  if (isFirstTouch && detectPitchLanguage(fullText)) {
    warnings.push({
      type: 'error',
      code: 'PITCH_IN_FIRST_TOUCH',
      message: 'First touch emails should start conversations, not pitch products.'
    });
  }

  if (isFirstTouch && detectCalendarLink(fullText)) {
    warnings.push({
      type: 'error',
      code: 'CALENDAR_IN_FIRST_TOUCH',
      message: 'Calendar links in first emails reduce reply rates by 50%+.'
    });
  }

  const unresolvedTokens = detectUnresolvedTokens(fullText);
  if (unresolvedTokens.length > 0) {
    warnings.push({
      type: 'error',
      code: 'UNRESOLVED_TOKENS',
      message: `Unresolved tokens: ${unresolvedTokens.join(', ')}. These will appear as-is in the email.`
    });
  }

  return warnings;
}

export function PreSendValidation({
  subject,
  body,
  campaignStage,
  onFixWithAI,
  onSendAnyway,
  canSendAnyway = true,
  className = ''
}: PreSendValidationProps) {
  const [warnings, setWarnings] = useState<ValidationWarning[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const newWarnings = validateEmailContent(subject, body, campaignStage);
    setWarnings(newWarnings);
  }, [subject, body, campaignStage]);

  if (warnings.length === 0) {
    return (
      <Card className={`border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20 ${className}`} data-testid="panel-validation-passed">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Message looks good</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasErrors = warnings.some(w => w.type === 'error');
  const borderColor = hasErrors 
    ? 'border-red-200 dark:border-red-800' 
    : 'border-amber-200 dark:border-amber-800';
  const bgColor = hasErrors 
    ? 'bg-red-50/50 dark:bg-red-950/20' 
    : 'bg-amber-50/50 dark:bg-amber-950/20';

  return (
    <Card className={`${borderColor} ${bgColor} ${className}`} data-testid="panel-validation-warnings">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1">
            <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${hasErrors ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${hasErrors ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                  AI Warning
                </span>
                <Badge variant="secondary" className="text-xs" data-testid="badge-warning-count">
                  {warnings.length} {warnings.length === 1 ? 'issue' : 'issues'}
                </Badge>
              </div>

              {isExpanded && (
                <ul className="mt-2 space-y-1.5">
                  {warnings.map((warning, index) => (
                    <li 
                      key={warning.code} 
                      className="flex items-start gap-2 text-sm"
                      data-testid={`text-warning-${index}`}
                    >
                      {warning.type === 'error' ? (
                        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-500" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                      )}
                      <span className="text-muted-foreground">{warning.message}</span>
                    </li>
                  ))}
                </ul>
              )}

              {isExpanded && (
                <div className="mt-3 flex items-center gap-2">
                  {onFixWithAI && (
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={onFixWithAI}
                      data-testid="button-fix-with-ai"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Fix with AI
                    </Button>
                  )}
                  {onSendAnyway && canSendAnyway && !hasErrors && (
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={onSendAnyway}
                      data-testid="button-send-anyway"
                    >
                      Send Anyway
                    </Button>
                  )}
                  {hasErrors && (
                    <span className="text-xs text-red-600 dark:text-red-400" data-testid="text-errors-must-fix">
                      Fix errors before sending
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="shrink-0 h-6 w-6 p-0"
            data-testid="button-toggle-validation"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

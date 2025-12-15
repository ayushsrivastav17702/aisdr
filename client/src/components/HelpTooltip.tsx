import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getHelpItem, type HelpItem } from "@/lib/help-content";
import { useHelp } from "@/contexts/help-context";

interface HelpTooltipProps {
  moduleId: string;
  itemId: string;
  className?: string;
  iconSize?: number;
}

export function HelpTooltip({ 
  moduleId, 
  itemId, 
  className = "",
  iconSize = 16 
}: HelpTooltipProps) {
  const helpItem = getHelpItem(moduleId, itemId);
  const { openPanel } = useHelp();

  if (!helpItem) {
    return null;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openPanel(moduleId, itemId);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleClick}
            className={`inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-full ${className}`}
            data-testid={`help-tooltip-${moduleId}-${itemId}`}
            aria-label={`Help: ${helpItem.title}`}
          >
            <HelpCircle style={{ width: iconSize, height: iconSize }} />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className="max-w-xs"
          data-testid={`help-tooltip-content-${moduleId}-${itemId}`}
        >
          <div className="space-y-1">
            <p className="font-medium text-sm">{helpItem.title}</p>
            <p className="text-xs text-muted-foreground">{helpItem.shortDescription}</p>
            <p className="text-xs text-primary">Click for more details</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface HelpTitleProps {
  title: string;
  moduleId: string;
  itemId: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'span';
}

export function HelpTitle({ 
  title, 
  moduleId, 
  itemId, 
  className = "",
  as: Component = 'h2'
}: HelpTitleProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Component className="font-semibold">{title}</Component>
      <HelpTooltip moduleId={moduleId} itemId={itemId} iconSize={14} />
    </div>
  );
}

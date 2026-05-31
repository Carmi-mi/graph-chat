import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

interface AgentIndicatorProps {
  exploringCount: number;
  isDone: boolean;
}

const AgentIndicator: React.FC<AgentIndicatorProps> = ({
  exploringCount,
  isDone,
}) => {
  if (exploringCount === 0 && !isDone) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm">
      {isDone ? (
        <>
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-green-600 font-medium">
            Exploration complete
          </span>
        </>
      ) : (
        <>
          <Loader2 className="w-4 h-4 text-[#667eea] animate-spin" />
          <span className="text-[#667eea]">
            Agent exploring {exploringCount} branch{exploringCount !== 1 ? 'es' : ''}...
          </span>
        </>
      )}
    </div>
  );
};

export default AgentIndicator;

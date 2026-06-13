import React from 'react';
import { Sparkles } from 'lucide-react';

export interface BreadcrumbItem {
  id: string;
  label: string;
}

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[];
  annotationEnabled: boolean;
  onToggleAnnotation: () => void;
  onBreadcrumbClick?: (id: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  breadcrumbs,
  annotationEnabled,
  onToggleAnnotation,
  onBreadcrumbClick,
}) => {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-3 min-h-[52px] bg-white/70 backdrop-blur-lg border-b border-gray-200/50">
      {/* Left: Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        {breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-sm text-gray-500 min-w-0">
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={item.id}>
                {index > 0 && <span className="text-gray-300">/</span>}
                <button
                  onClick={() => onBreadcrumbClick?.(item.id)}
                  className={`truncate hover:text-[#667eea] transition-colors ${
                    index === breadcrumbs.length - 1
                      ? 'text-gray-800 font-medium'
                      : ''
                  }`}
                >
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </nav>
        )}
      </div>

      {/* Right: Annotation toggle */}
      <button
        onClick={onToggleAnnotation}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
          annotationEnabled
            ? 'bg-[#667eea]/10 text-[#667eea] border border-[#667eea]/30'
            : 'bg-gray-100 text-gray-500 border border-gray-200'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        <span>Annotations</span>
      </button>
    </header>
  );
};

export default Header;

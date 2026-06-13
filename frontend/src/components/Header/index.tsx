import React from 'react';

export interface BreadcrumbItem {
  id: string;
  label: string;
}

interface HeaderProps {
  breadcrumbs: BreadcrumbItem[];
  onBreadcrumbClick?: (id: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  breadcrumbs,
  onBreadcrumbClick,
}) => {
  return (
    <header className="sticky top-0 z-30 flex items-center px-3 min-h-[52px] bg-white/70 backdrop-blur-lg border-b border-gray-200/50">
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
    </header>
  );
};

export default Header;

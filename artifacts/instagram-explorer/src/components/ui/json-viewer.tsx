import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  initiallyExpanded?: boolean;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, initiallyExpanded = true }) => {
  return (
    <div className="font-mono text-xs overflow-x-auto p-4 bg-[#0a0a0a] rounded-md border border-[#1f2937]">
      <JsonNode label="root" value={data} initiallyExpanded={initiallyExpanded} isRoot />
    </div>
  );
};

const JsonNode: React.FC<{ label: string; value: any; isLast?: boolean; initiallyExpanded?: boolean; isRoot?: boolean }> = ({ 
  label, value, isLast = true, initiallyExpanded = false, isRoot = false 
}) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isExpandable = isObject || isArray;

  const toggleExpand = () => {
    if (isExpandable) {
      setExpanded(!expanded);
    }
  };

  const renderValue = () => {
    if (value === null) return <span className="text-[#569cd6]">null</span>;
    if (typeof value === 'boolean') return <span className="text-[#569cd6]">{value ? 'true' : 'false'}</span>;
    if (typeof value === 'number') return <span className="text-[#b5cea8]">{value}</span>;
    if (typeof value === 'string') return <span className="text-[#ce9178]">"{value}"</span>;
    
    if (isArray) {
      if (!expanded) return <span className="text-[#808080]">Array({value.length})</span>;
      return null;
    }
    
    if (isObject) {
      if (!expanded) return <span className="text-[#808080]">Object({Object.keys(value).length})</span>;
      return null;
    }
    
    return <span>{String(value)}</span>;
  };

  return (
    <div className="flex flex-col ml-4 relative">
      <div 
        className={`flex items-start group ${isExpandable ? 'cursor-pointer hover:bg-[#1a1a1a]' : ''} rounded-sm px-1 -ml-1`} 
        onClick={toggleExpand}
      >
        <div className="flex items-center mt-[1px] w-4 shrink-0">
          {isExpandable && (
            <span className="text-[#808080] hover:text-white transition-colors">
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          )}
        </div>
        
        <div className="flex-1 break-all">
          {!isRoot && (
            <span className="text-[#9cdcfe]">"{label}"</span>
          )}
          {!isRoot && <span className="text-white mr-1">:</span>}
          
          {(isArray && expanded) && <span className="text-white">[</span>}
          {(isObject && expanded) && <span className="text-white">{'{'}</span>}
          
          {(!expanded || (!isArray && !isObject)) && renderValue()}
          
          {(!expanded && isExpandable) && (
            <span className="text-white">{isArray ? ']' : '}'}</span>
          )}
          
          {!isLast && !expanded && <span className="text-white">,</span>}
        </div>
      </div>

      <AnimatePresence>
        {expanded && isExpandable && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {isArray ? (
              <div className="flex flex-col border-l border-[#333] ml-[6px]">
                {value.map((item: any, i: number) => (
                  <JsonNode 
                    key={i} 
                    label={String(i)} 
                    value={item} 
                    isLast={i === value.length - 1} 
                    initiallyExpanded={initiallyExpanded}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col border-l border-[#333] ml-[6px]">
                {Object.entries(value).map(([k, v], i, arr) => (
                  <JsonNode 
                    key={k} 
                    label={k} 
                    value={v} 
                    isLast={i === arr.length - 1} 
                    initiallyExpanded={initiallyExpanded}
                  />
                ))}
              </div>
            )}
            
            <div className="ml-4 -mt-[2px]">
              <span className="text-white">{isArray ? ']' : '}'}</span>
              {!isLast && <span className="text-white">,</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

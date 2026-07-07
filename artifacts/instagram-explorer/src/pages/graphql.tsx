import React, { useState } from 'react';
import { useCustomGraphQL } from '@workspace/api-client-react';
import { Database, Play, AlertTriangle } from 'lucide-react';
import { JsonViewer } from '@/components/ui/json-viewer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const KNOWN_DOC_IDS = [
  { id: '27128499623469141', label: 'PolarisPostRootQuery (Post)' },
  { id: '9310670392322965', label: 'User Feed' },
  { id: '7950326061742207', label: 'Reels / Video Info' },
  { id: '298b92c8d7cad703f7565aa892ede943', label: 'Hashtag Search' },
  { id: '33ba35852cb50da46f5b5e889df7d159', label: 'Comments' },
];

export default function GraphQLBuilder() {
  const [selectedValue, setSelectedValue] = useState(KNOWN_DOC_IDS[0].id);
  const [customDocId, setCustomDocId] = useState('');
  const [variablesText, setVariablesText] = useState('{\n  "shortcode": "C_zW7Q5"\n}');
  const [errorText, setErrorText] = useState<string | null>(null);
  
  const mutation = useCustomGraphQL();

  const isCustom = selectedValue === 'custom';
  const effectiveDocId = isCustom ? customDocId : selectedValue;

  const handleExecute = () => {
    setErrorText(null);
    if (!effectiveDocId.trim()) {
      setErrorText("Please enter a doc_id.");
      return;
    }
    let variables = {};
    try {
      variables = JSON.parse(variablesText);
    } catch (e) {
      setErrorText("Invalid JSON variables. Please correct syntax.");
      return;
    }
    mutation.mutate({ data: { docId: effectiveDocId.trim(), variables } });
  };

  const data = mutation.data;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="text-2xl font-mono font-bold tracking-tight text-white flex items-center gap-3">
          <Database className="w-6 h-6 text-primary" />
          GRAPHQL_BUILDER
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          Execute arbitrary internal GraphQL queries against Polaris endpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Input */}
        <div className="flex flex-col gap-4">
          <Card className="bg-[#0d1117] border-border p-4 shadow-md flex-col flex gap-4 shrink-0">
            <div className="space-y-2">
              <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                Doc ID (Query Hash)
              </label>
              <Select value={selectedValue} onValueChange={setSelectedValue}>
                <SelectTrigger className="w-full bg-black/30 border-border/50 font-mono text-sm h-10">
                  <SelectValue placeholder="Select Doc ID" />
                </SelectTrigger>
                <SelectContent className="bg-[#0a0a0a] border-border font-mono text-sm">
                  {KNOWN_DOC_IDS.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id} className="focus:bg-primary/20 focus:text-primary">
                      {doc.id} - <span className="text-muted-foreground">{doc.label}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="custom" className="focus:bg-primary/20 focus:text-primary">
                    Custom Doc ID...
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {isCustom && (
              <input 
                type="text"
                value={customDocId}
                placeholder="Enter custom doc_id"
                className="w-full bg-black/30 border border-border/50 font-mono text-sm h-10 rounded px-3 text-white focus:outline-none focus:border-primary"
                onChange={(e) => setCustomDocId(e.target.value)}
              />
            )}
            
            <div className="space-y-2 flex-1 flex flex-col">
              <label className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider flex justify-between">
                <span>Variables (JSON)</span>
              </label>
              <Textarea 
                value={variablesText}
                onChange={(e) => setVariablesText(e.target.value)}
                className="w-full bg-[#0a0a0a] border-border/50 font-mono text-xs p-3 text-[#ce9178] focus-visible:ring-1 focus-visible:ring-primary h-64 resize-none"
                spellCheck={false}
              />
            </div>
            
            {errorText && (
              <div className="text-xs text-destructive font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {errorText}
              </div>
            )}
            
            <Button 
              onClick={handleExecute} 
              disabled={mutation.isPending} 
              className="w-full font-mono bg-primary text-black hover:bg-primary/90 mt-2"
            >
              {mutation.isPending ? 'EXECUTING...' : (
                <span className="flex items-center gap-2"><Play className="w-4 h-4 fill-black" /> EXECUTE QUERY</span>
              )}
            </Button>
          </Card>
        </div>

        {/* Right Column: Output */}
        <div className="flex flex-col h-full overflow-hidden border border-border rounded-lg bg-[#0d1117]">
          <div className="bg-black/30 border-b border-border p-3 flex justify-between items-center shrink-0 font-mono text-sm">
            <span className="font-bold text-foreground">RESPONSE_PAYLOAD</span>
            {data && (
              <span className="text-[10px] text-muted-foreground">HTTP {data.statusCode} | {data.durationMs}ms</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {mutation.isPending ? (
              <div className="h-full flex items-center justify-center flex-col gap-4 text-primary">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="font-mono text-sm animate-pulse">Awaiting network...</span>
              </div>
            ) : data ? (
              <JsonViewer data={data} initiallyExpanded={false} />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground font-mono text-sm opacity-50 p-8 text-center border border-dashed border-transparent m-4">
                Execute a query to inspect the raw response payload. The output will be rendered as an interactive syntax-highlighted tree.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

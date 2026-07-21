import React, { useState, useEffect, useMemo } from 'react';

export interface StandardClause {
  id: string;
  standard: 'ISO 55000' | 'ISO 55001' | 'ISO 55002';
  clause: string;
  title: string;
  description: string;
  keyRequirements: string[];
  fcaApplication: string;
  scenario3Logic: string;
}

export const ISO_STANDARDS_DATA: StandardClause[] = [
  {
    id: 'iso-55000-principles',
    standard: 'ISO 55000',
    clause: 'Section 2.4',
    title: 'Core Fundamentals & Principles',
    description: 'Defines the foundational value-driven philosophy of modern asset management. Successful asset management depends on four fundamental pillars.',
    keyRequirements: [
      'Value: Assets exist to provide value to the organization and its stakeholders.',
      'Alignment (Line of Sight): Asset management decisions translate organizational objectives into technical and financial plans.',
      'Leadership: Leadership and workplace culture drive the realization of value.',
      'Assurance: Verification that assets will fulfill their required purpose effectively.'
    ],
    fcaApplication: 'The Facility Condition Assessment (FCA) is the primary vehicle for Assurance, verifying asset conditions and providing data alignment up to corporate SAMP levels.',
    scenario3Logic: 'Provides the ultimate "Why" for any CAPEX or OPEX recommendation, justifying expenses by the value preserved or unlocked.'
  },
  {
    id: 'iso-55001-4.1',
    standard: 'ISO 55001',
    clause: 'Clause 4.1',
    title: 'Understanding Context & Strategic Alignment',
    description: 'Requires organizations to determine external and internal issues that affect its ability to achieve the intended outcomes of its asset management system.',
    keyRequirements: [
      'Analyze the external operating environment (regulatory, economic, climate).',
      'Understand internal constraints (financial limits, operating hours, legacy technology).',
      'Establish a clear Strategic Asset Management Plan (SAMP).'
    ],
    fcaApplication: 'Ensures individual room and asset inspections are evaluated in the context of the entire building’s criticality (e.g., a plant room failure vs. a storage cupboard).',
    scenario3Logic: 'Determines the baseline risk exposure. An asset in a highly critical building context (high strategic importance) has an elevated failure impact, justifying proactive replacement.'
  },
  {
    id: 'iso-55001-4.2',
    standard: 'ISO 55001',
    clause: 'Clause 4.2',
    title: 'Needs & Expectations of Stakeholders',
    description: 'Identifies the stakeholders relevant to asset management, their requirements, and the criteria for asset management decision-making.',
    keyRequirements: [
      'Identify regulatory compliance mandates (fire safety, building codes, electrical safety).',
      'Define occupant comfort, safety, and business-continuity requirements.'
    ],
    fcaApplication: 'Directly influences risk mapping. Safety hazards or compliance gaps (e.g., missing fire extinguishers, outdated electrical boards) are instantly escalated to High/Extreme risk due to stakeholder mandates.',
    scenario3Logic: 'Mandates compliance-driven renewals. If a stakeholder or regulator requires a higher standard, visual defects must be resolved immediately regardless of standard useful life.'
  },
  {
    id: 'iso-55001-5.1',
    standard: 'ISO 55001',
    clause: 'Clause 5.1',
    title: 'Leadership & Commitment',
    description: 'Top management must demonstrate leadership and commitment to the asset management system, ensuring resource availability and strategic alignment.',
    keyRequirements: [
      'Ensure the asset management policy and SAMP are established and aligned.',
      'Promote continual improvement and cross-functional collaboration.',
      'Authorize necessary financial resources for asset renewal.'
    ],
    fcaApplication: 'Integrates field-level inspector findings with senior management reporting systems, ensuring recommendations are funded.',
    scenario3Logic: 'Justifies executive-level spend by showing that deferred maintenance leads to exponentially higher emergency failure costs.'
  },
  {
    id: 'iso-55001-6.1',
    standard: 'ISO 55001',
    clause: 'Clause 6.1',
    title: 'Actions to Address Risks & Opportunities',
    description: 'Requires proactive identification and evaluation of risks and opportunities to prevent undesired effects and achieve asset objectives.',
    keyRequirements: [
      'Assess risks associated with asset lifecycles, performance, and external change.',
      'Establish robust risk-rating criteria (Likelihood x Consequence).',
      'Determine actions to treat risks (e.g., mitigate, transfer, accept).'
    ],
    fcaApplication: 'Forms the backbone of the "Risk Rating" field in our inspector interface (Low, Medium, High, Extreme).',
    scenario3Logic: 'The absolute core of lifecycle decision-making. High and Extreme risk ratings indicate that the consequence of deferred action outweighs replacement costs.'
  },
  {
    id: 'iso-55001-6.2',
    standard: 'ISO 55001',
    clause: 'Clause 6.2',
    title: 'Asset Management Objectives & Planning',
    description: 'Specifies requirements for establishing measurable objectives that align with organizational goals and planning how to achieve them.',
    keyRequirements: [
      'Establish clear, measurable targets for condition indexes and service levels.',
      'Define resource requirements, responsibilities, and timelines.',
      'Determine evaluation methodologies for objective completion.'
    ],
    fcaApplication: 'Provides the baseline metrics (e.g., maintaining average room conditions above "Good", keeping extreme risk exposure at 0%).',
    scenario3Logic: 'If keeping an asset operational is required to meet a specific performance objective, renewals must be planned ahead of estimated RUL expiry.'
  },
  {
    id: 'iso-55001-7.5',
    standard: 'ISO 55001',
    clause: 'Clause 7.5',
    title: 'Information & Data Asset Requirements',
    description: 'Mandates identifying and maintaining the documented information, data quality, and financial-technical records needed for effective asset management.',
    keyRequirements: [
      'Determine the information requirements for assets, including attributes, condition, and costs.',
      'Establish data quality standards and verification methods.',
      'Maintain an up-to-date, structured Asset Register.'
    ],
    fcaApplication: 'The digital Asset Register populated by this app (including Category, Condition, Justification, Cost, and Photos) directly satisfies Clause 7.5.',
    scenario3Logic: 'Allows data-backed asset profiling. Accurate age, condition, and estimated replacement cost (CAPEX) provide the empirical proof required to authorize renewals.'
  },
  {
    id: 'iso-55001-8.1',
    standard: 'ISO 55001',
    clause: 'Clause 8.1',
    title: 'Operational Planning, Control & Scenario 3 Logic',
    description: 'Processes to implement the plans, establish criteria for processes, and manage asset lifecycles through operational controls.',
    keyRequirements: [
      'Implement controls to manage asset operations, maintenance activities, and risk barriers.',
      'Establish clear decision criteria for Maintenance vs. Renewal.',
      'Evaluate total lifecycle cost rather than initial procurement cost.'
    ],
    fcaApplication: 'This clause is the source of "Scenario 3 Logic"! Deciding whether to repair (OPEX) or replace (CAPEX) based on empirical condition and risk metrics.',
    scenario3Logic: 'Provides the decision matrix: If repair cost > 40% of replacement cost AND remaining useful life is < 3 years, full CAPEX renewal is the mandatory recommendation.'
  },
  {
    id: 'iso-55001-8.2',
    standard: 'ISO 55001',
    clause: 'Clause 8.2',
    title: 'Management of Change (MoC)',
    description: 'Requires a structured, risk-assessed process for any temporary or permanent changes that could impact asset management and operational goals.',
    keyRequirements: [
      'Evaluate risks before implementing modifications, expansions, or operational changes.',
      'Record changes in the Asset Register and notify relevant technical teams.',
      'Update compliance documentation and training programs.'
    ],
    fcaApplication: 'Keeps track of when assets are decommissioned, upgraded, or replaced, maintaining a verifiable "Audit Trail" (which we implement for each asset).',
    scenario3Logic: 'Before recommending a modification or a different asset type (e.g. replacing a gas boiler with an electric heat pump), MoC requires analyzing new risk profiles.'
  },
  {
    id: 'iso-55001-9.1',
    standard: 'ISO 55001',
    clause: 'Clause 9.1',
    title: 'Monitoring, Measurement & Evaluation',
    description: 'Specifies requirements for monitoring, measuring, analyzing, and evaluating asset management system performance and asset health.',
    keyRequirements: [
      'Evaluate asset condition deterioration trends over time.',
      'Assess the effectiveness of preventive vs. corrective maintenance.',
      'Measure risk concentration metrics across facilities.'
    ],
    fcaApplication: 'Utilizes the Visual Health Report (Risk Distribution) and CAPEX charts in the Assessment Summary view to evaluate facility-level performance.',
    scenario3Logic: 'Identifies systemic failures. If multiple assets of the same category show rapid decay, it indicates a systemic environmental issue requiring a larger strategic renewal program.'
  },
  {
    id: 'iso-55001-10.1',
    standard: 'ISO 55001',
    clause: 'Clause 10.1',
    title: 'Nonconformity & Corrective Action',
    description: 'Requires reacting to failures, taking immediate steps to control or correct them, and addressing the root causes to prevent recurrence.',
    keyRequirements: [
      'Log asset failures or safety non-conformances immediately.',
      'Perform Root Cause Analysis (RCA) on critical failures.',
      'Establish corrective actions and track completion status.'
    ],
    fcaApplication: 'The "Defects / Hazards" logging and the interactive "AI Chatbot" recommendation engine assist the inspector in outlining immediate corrective actions.',
    scenario3Logic: 'For assets under a current nonconformity, we bypass standard lifecycle RUL and demand immediate corrective work orders to mitigate active liabilities.'
  },
  {
    id: 'iso-55002-guidance',
    standard: 'ISO 55002',
    clause: 'Annex A',
    title: 'Application Guidelines for Asset Management',
    description: 'Provides expanded guidance for the practical application of ISO 55001 requirements, outlining real-world engineering and financial alignment.',
    keyRequirements: [
      'Link technical engineering terms to corporate financial metrics.',
      'Establish clear visual grading scales for building condition surveys.',
      'Integrate risk-based prioritization methods for Capital Planning.'
    ],
    fcaApplication: 'Supports standardizing visual condition grades (Excellent, Good, Average, Fair, Poor) to financial replacement triggers, ensuring high quality data.',
    scenario3Logic: 'Translates physical corrosion, rust, or insulation degradation into concrete RUL metrics, which are then used in financial scheduling models.'
  }
];

interface StandardsNotebookProps {
  activeClauseId: string | null;
  onSelectClause: (clauseId: string | null) => void;
  onClose?: () => void;
}

export const StandardsNotebook: React.FC<StandardsNotebookProps> = ({
  activeClauseId,
  onSelectClause,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStandard, setSelectedStandard] = useState<'ALL' | 'ISO 55000' | 'ISO 55001' | 'ISO 55002'>('ALL');

  // Automatically select the active clause if it's set by parent
  useEffect(() => {
    if (activeClauseId) {
      const element = document.getElementById(`clause-card-${activeClauseId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeClauseId]);

  const filteredClauses = useMemo(() => {
    return ISO_STANDARDS_DATA.filter((item) => {
      const matchesStandard = selectedStandard === 'ALL' || item.standard === selectedStandard;
      const matchesSearch = 
        item.clause.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.keyRequirements.some(req => req.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.fcaApplication.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.scenario3Logic.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStandard && matchesSearch;
    });
  }, [selectedStandard, searchQuery]);

  const selectedClause = useMemo(() => {
    return ISO_STANDARDS_DATA.find(c => c.id === activeClauseId) || filteredClauses[0] || null;
  }, [activeClauseId, filteredClauses]);

  return (
    <div className="flex-1 flex flex-col bg-slate-900 text-slate-100 border-l border-slate-700 h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-icons text-amber-500">menu_book</span>
          <div>
            <h3 className="font-bold text-sm text-white">ISO 55000 Series Notebook</h3>
            <span className="text-[10px] text-slate-400 font-mono">Standards Reference & Decision Logic</span>
          </div>
        </div>
        {onClose && (
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700 transition"
          >
            <span className="material-icons text-lg">close</span>
          </button>
        )}
      </div>

      {/* Search and Filter bar */}
      <div className="p-3 bg-slate-800/50 border-b border-slate-700 space-y-2 shrink-0">
        <div className="relative">
          <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
          <input
            type="text"
            placeholder="Search clauses, keywords, applications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>
        
        {/* Filter Badges */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-[10px] font-mono no-scrollbar">
          {(['ALL', 'ISO 55000', 'ISO 55001', 'ISO 55002'] as const).map((std) => (
            <button
              key={std}
              onClick={() => setSelectedStandard(std)}
              className={`px-2 py-1 rounded transition whitespace-nowrap ${
                selectedStandard === std 
                  ? 'bg-amber-500 text-slate-950 font-bold' 
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {std}
            </button>
          ))}
        </div>
      </div>

      {/* Main split display: left side list, right side details */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Clause List */}
        <div className="w-2/5 border-r border-slate-700 overflow-y-auto divide-y divide-slate-800/60 bg-slate-950/40">
          {filteredClauses.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              No matching standards found.
            </div>
          ) : (
            filteredClauses.map((item) => {
              const isSelected = selectedClause?.id === item.id;
              return (
                <button
                  key={item.id}
                  id={`clause-card-${item.id}`}
                  onClick={() => onSelectClause(item.id)}
                  className={`w-full text-left p-3 transition flex flex-col gap-1 text-xs ${
                    isSelected 
                      ? 'bg-slate-800/80 border-l-4 border-amber-500 pl-2 text-white' 
                      : 'hover:bg-slate-800/30 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-400 font-bold">
                      {item.standard}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono font-bold">{item.clause}</span>
                  </div>
                  <div className="font-semibold truncate text-slate-200 mt-0.5">{item.title}</div>
                  <div className="text-[10px] text-slate-500 line-clamp-1">{item.description}</div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Details View */}
        <div className="w-3/5 p-4 overflow-y-auto space-y-4 bg-slate-900/60">
          {selectedClause ? (
            <div className="space-y-4 animate-fade-in text-xs leading-relaxed">
              <div className="border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                    {selectedClause.standard}
                  </span>
                  <span className="text-slate-400 font-mono font-bold">{selectedClause.clause}</span>
                </div>
                <h4 className="text-sm font-bold text-white tracking-tight">{selectedClause.title}</h4>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-amber-500/80 tracking-wider block mb-1">Standard Definition</span>
                <p className="text-slate-300 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/50">
                  {selectedClause.description}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-amber-500/80 tracking-wider block mb-1.5">Key Requirements & Guidelines</span>
                <ul className="space-y-1.5">
                  {selectedClause.keyRequirements.map((req, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-slate-300">
                      <span className="material-icons text-[12px] text-amber-500 mt-0.5">check_circle</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-slate-800/50 pt-3 grid grid-cols-1 gap-3">
                <div className="bg-slate-950/20 p-2.5 rounded-lg border border-slate-800/50">
                  <div className="flex items-center gap-1 mb-1 font-semibold text-slate-200">
                    <span className="material-icons text-sm text-indigo-400">assessment</span>
                    <span>Facility Assessment Application</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    {selectedClause.fcaApplication}
                  </p>
                </div>

                <div className="bg-slate-950/20 p-2.5 rounded-lg border border-slate-800/50">
                  <div className="flex items-center gap-1 mb-1 font-semibold text-slate-200">
                    <span className="material-icons text-sm text-teal-400">rule</span>
                    <span>Lifecycle Scenario 3 Logic</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    {selectedClause.scenario3Logic}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
              <span className="material-icons text-3xl">menu_book</span>
              <p className="text-xs">Select a clause to view full standard details.</p>
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer info */}
      <div className="p-2.5 bg-slate-950/80 border-t border-slate-800 text-[10px] text-center text-slate-500 font-mono shrink-0">
        Active audit context bound to ISO 55001:2024 compliance.
      </div>
    </div>
  );
};

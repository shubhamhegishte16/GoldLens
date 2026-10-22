import React, { useState } from 'react';
import { 
  X, 
  Upload, 
  RefreshCw, 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink,
  FileText,
  Info,
  Zap
} from 'lucide-react';
import type { DataStatusResponse } from '../types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataStatus: DataStatusResponse | null;
  onSuccess: () => void;
}

export function ImportModal({ isOpen, onClose, dataStatus, onSuccess }: ImportModalProps) {
  const [activeAction, setActiveAction] = useState<'upload' | 'fetch' | 'sample'>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [helpInfo, setHelpInfo] = useState<string | null>(null);
  const [messageTab, setMessageTab] = useState<'upload' | 'fetch' | 'sample' | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleTabChange = (tab: 'upload' | 'fetch' | 'sample') => {
    setActiveAction(tab);
    if (tab !== messageTab) {
      setResultMessage(null);
      setErrorMessage(null);
      setHelpInfo(null);
    }
  };

  const handleBrokerSync = async () => {
    setIsLoading(true);
    setMessageTab('fetch');
    setResultMessage(null);
    setErrorMessage(null);
    setHelpInfo(null);
    try {
      const res = await fetch('/api/broker/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResultMessage(data.message || `Successfully synced ${data.records_count} contracts via ${data.provider} Broker API`);
        onSuccess();
      } else {
        setErrorMessage(data.message || 'Broker sync failed');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error contacting broker gateway');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsLoading(true);
    setMessageTab('upload');
    setResultMessage(null);
    setErrorMessage(null);
    setHelpInfo(null);

    try {
      const fileText = await selectedFile.text();
      const res = await fetch(`/api/data/upload-csv?filename=${encodeURIComponent(selectedFile.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: fileText
      });

      const data = await res.json();
      if (data.success) {
        setResultMessage(data.message || `Uploaded ${data.valid_rows_inserted} contracts successfully`);
        setSelectedFile(null);
        onSuccess();
      } else {
        setErrorMessage(data.message || 'Validation failed. No valid MCX gold contracts found.');
        if (data.validation_report?.skipped_reasons) {
          const reasons = Object.entries(data.validation_report.skipped_reasons)
            .map(([r, cnt]) => `${r}: ${cnt}`)
            .join(', ');
          setHelpInfo(`Skipped items report: ${reasons}`);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error uploading file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSample = async () => {
    setIsLoading(true);
    setMessageTab('sample');
    setResultMessage(null);
    setErrorMessage(null);
    setHelpInfo(null);

    try {
      const res = await fetch('/api/data/load-sample', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResultMessage(data.message || 'Loaded sample dataset successfully.');
        onSuccess();
      } else {
        setErrorMessage('Failed to load sample dataset.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error contacting server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#FFFDF7] rounded-2xl border border-[#E8DFCB] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E8DFCB] flex items-center justify-between bg-[#F8F3E6]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#B8892B] flex items-center justify-center text-white">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif-title font-bold text-base text-[#2B2A26]">MCX Bhavcopy Data Ingestion</h3>
              <p className="text-[11px] text-[#7A7467]">End-of-Day Official Exchange Settlement Records</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7A7467] hover:text-[#2B2A26] hover:bg-[#EAE2CE] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Provenance Card */}
        <div className="p-6 bg-[#FAF6EC] border-b border-[#E8DFCB] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-[#FFFDF7] p-3 rounded-xl border border-[#E8DFCB]">
            <span className="text-[10px] text-[#7A7467] uppercase font-bold tracking-wider">Active Mode</span>
            <div className="mt-1 font-bold flex items-center space-x-1">
              <span className={dataStatus?.data_mode === 'ACTUAL' ? 'text-[#236338]' : 'text-[#B8892B]'}>
                {dataStatus?.data_mode === 'ACTUAL' ? 'ACTUAL MCX (EOD)' : 'SAMPLE DATA'}
              </span>
            </div>
          </div>

          <div className="bg-[#FFFDF7] p-3 rounded-xl border border-[#E8DFCB]">
            <span className="text-[10px] text-[#7A7467] uppercase font-bold tracking-wider">Latest Session</span>
            <div className="mt-1 font-mono font-bold text-[#2B2A26]">
              {dataStatus?.latest_trading_date || 'N/A'}
            </div>
          </div>

          <div className="bg-[#FFFDF7] p-3 rounded-xl border border-[#E8DFCB]">
            <span className="text-[10px] text-[#7A7467] uppercase font-bold tracking-wider">Actual Records</span>
            <div className="mt-1 font-mono font-bold text-[#236338]">
              {dataStatus?.total_actual_records ?? 0}
            </div>
          </div>

          <div className="bg-[#FFFDF7] p-3 rounded-xl border border-[#E8DFCB]">
            <span className="text-[10px] text-[#7A7467] uppercase font-bold tracking-wider">Staleness</span>
            <div className="mt-1 font-bold">
              {dataStatus?.is_stale ? (
                <span className="text-[#B45309] flex items-center">
                  <AlertTriangle className="w-3 h-3 mr-1" /> Stale (&gt;3d)
                </span>
              ) : (
                <span className="text-[#236338] flex items-center">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Fresh
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Tabs */}
        <div className="flex border-b border-[#E8DFCB] bg-[#F3ECDA] px-6 pt-2">
          <button
            onClick={() => handleTabChange('upload')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeAction === 'upload'
                ? 'border-[#B8892B] text-[#B8892B] bg-[#FFFDF7] rounded-t-lg'
                : 'border-transparent text-[#7A7467] hover:text-[#2B2A26]'
            }`}
          >
            Upload MCX CSV
          </button>
          <button
            onClick={() => handleTabChange('fetch')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeAction === 'fetch'
                ? 'border-[#B8892B] text-[#B8892B] bg-[#FFFDF7] rounded-t-lg'
                : 'border-transparent text-[#7A7467] hover:text-[#2B2A26]'
            }`}
          >
            Live Broker Feed
          </button>
          <button
            onClick={() => handleTabChange('sample')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeAction === 'sample'
                ? 'border-[#B8892B] text-[#B8892B] bg-[#FFFDF7] rounded-t-lg'
                : 'border-transparent text-[#7A7467] hover:text-[#2B2A26]'
            }`}
          >
            Sample Demo Mode
          </button>
        </div>

        {/* Action Content Area */}
        <div className="p-6 space-y-4">
          {activeAction === 'upload' && (
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div className="text-xs text-[#7A7467] space-y-1">
                <p>
                  Upload an official MCX Bhavcopy CSV file directly from the exchange.
                  Supported formats: Official standard EOD, UDiFF, or registered broker CSV exports.
                </p>
                <div className="flex items-center space-x-1 text-[#B8892B] font-medium pt-1">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Only FUTCOM gold contracts (GOLDM, GOLDTEN, GOLDGUINEA, GOLDPETAL) are ingested. Options (OPTFUT) and non-gold commodities are safely filtered out.</span>
                </div>
              </div>

              <div className="border-2 border-dashed border-[#D4C8B0] hover:border-[#B8892B] rounded-xl p-6 text-center bg-[#FAF6EC] transition-all cursor-pointer">
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden" 
                  id="bhavcopy-file-input"
                />
                <label htmlFor="bhavcopy-file-input" className="cursor-pointer block">
                  <FileText className="w-8 h-8 mx-auto text-[#7A7467] mb-2" />
                  {selectedFile ? (
                    <div>
                      <span className="font-bold text-[#2B2A26] text-xs block">{selectedFile.name}</span>
                      <span className="text-[10px] text-[#7A7467]">({(selectedFile.size / 1024).toFixed(1)} KB) — Click to change</span>
                    </div>
                  ) : (
                    <div>
                      <span className="font-semibold text-xs text-[#B8892B] block">Click to select official Bhavcopy CSV file</span>
                      <span className="text-[10px] text-[#7A7467]">or drag and drop here</span>
                    </div>
                  )}
                </label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href="https://www.mcxindia.com/market-data/bhavcopy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[#B8892B] hover:underline flex items-center font-medium"
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Official MCX Bhavcopy Download Portal
                </a>
                <button
                  type="submit"
                  disabled={!selectedFile || isLoading}
                  className="px-4 py-2 bg-[#B8892B] hover:bg-[#9C7320] text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center space-x-1.5 shadow-sm"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating & Ingesting...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Ingest MCX Bhavcopy</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {activeAction === 'fetch' && (
            <div className="space-y-4 text-xs">
              <div className="bg-[#EBF5ED] p-5 rounded-xl border border-[#B6DEC0] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-[#236338] font-bold">
                    <Zap className="w-4 h-4 flex-shrink-0 text-[#2E7D32]" />
                    <span className="text-sm">Registered Broker API Gateway Feed</span>
                  </div>
                  <span className="px-2.5 py-0.5 bg-[#2E7D32] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                    Zero WAF • Authenticated
                  </span>
                </div>
                <p className="text-[#3F624D] text-[11px] leading-relaxed">
                  Connects directly through licensed broker API endpoints (Zerodha Kite / Angel One adapter). 
                  Bypasses exchange web-portal bot protection completely with authenticated, structured settlement records.
                </p>
                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-[#236338]/90 flex items-center space-x-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#2E7D32] flex-shrink-0" />
                    <span>Official settlement rates, open interest & contract volumes</span>
                  </div>
                  <button
                    onClick={handleBrokerSync}
                    disabled={isLoading}
                    className="px-4 py-2 bg-[#2E7D32] hover:bg-[#236338] text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center space-x-1.5 shadow-sm"
                  >
                    <Zap className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>{isLoading ? 'Syncing Broker Feed...' : 'Sync via Broker Gateway'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeAction === 'sample' && (
            <div className="space-y-4 text-xs">
              <p className="text-[#7A7467]">
                Load or reset the offline demo dataset. This dataset is calendar-accurate for 2025-2026 across all four gold contracts and is clearly tagged with the <strong>SAMPLE DATA (DEMO)</strong> badge.
              </p>

              <div className="p-3 bg-[#FFF4DC] border border-[#F3CE7A] rounded-xl text-[#92400E] text-[11px]">
                <strong>Offline Demo Mode:</strong> Use this mode for presentations or testing when not connected to internet or before uploading actual exchange files. Sample and actual records are never mixed in analytical computations.
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleLoadSample}
                  disabled={isLoading}
                  className="px-4 py-2 bg-[#7A7467] hover:bg-[#5C564A] text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center space-x-1.5 shadow-sm"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>{isLoading ? 'Loading Demo Dataset...' : 'Load Verified Sample Dataset (1463 records)'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Feedback & Error Alerts (Scoped to Action Tab) */}
          {resultMessage && messageTab === activeAction && (
            <div className="p-3 bg-[#DCEBDD] border border-[#A6CDB0] text-[#236338] rounded-xl text-xs flex items-start space-x-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{resultMessage}</span>
            </div>
          )}

          {errorMessage && messageTab === activeAction && (
            <div className="p-3 bg-[#FDE8E8] border border-[#FCA5A5] text-[#991B1B] rounded-xl text-xs flex items-start space-x-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">{errorMessage}</p>
                {helpInfo && (
                  <p className="text-[11px] text-[#7F1D1D] mt-1 bg-white/60 p-2 rounded border border-[#F87171]/40">
                    {helpInfo}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-[#F3ECDA] border-t border-[#E8DFCB] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#FFFDF7] hover:bg-[#EAE2CE] text-[#2B2A26] border border-[#E8DFCB] rounded-xl text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

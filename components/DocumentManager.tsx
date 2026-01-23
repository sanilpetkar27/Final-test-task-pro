
import React, { useState, useRef } from 'react';
import { DocumentRecord, DocCategory } from '../types';
import { Search, Upload, Trash2, FileText, Eye, ShieldCheck, X } from 'lucide-react';

interface DocumentManagerProps {
  documents: DocumentRecord[];
  onAddDocument: (doc: Omit<DocumentRecord, 'id'>) => void;
  onRemoveDocument: (id: string) => void;
}

const CATEGORIES: DocCategory[] = ['GST', 'PAN', 'Aadhaar', 'ITR', 'Trade License', 'Bank Docs', 'Other'];

const DocumentManager: React.FC<DocumentManagerProps> = ({ documents, onAddDocument, onRemoveDocument }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    category: 'GST' as DocCategory
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && formData.name) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onAddDocument({
          name: formData.name,
          category: formData.category,
          fileData: reader.result as string,
          mimeType: file.type,
          uploadDate: Date.now()
        });
        setFormData({ name: '', category: 'GST' });
        setIsAdding(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    doc.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Vault Header */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <ShieldCheck className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5 rotate-12" />
        <h2 className="text-2xl font-black italic mb-1">Company Vault</h2>
        <p className="text-blue-100 text-xs">Essential dealership ID & Compliance documents.</p>
      </div>

      {/* Search & Add */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input 
            type="text" 
            placeholder="Search documents..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl pl-10 pr-4 py-3.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 text-white p-3.5 rounded-2xl shadow-lg active:scale-95 transition-transform"
        >
          <Upload className="w-6 h-6" />
        </button>
      </div>

      {/* Upload Form Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-800">Add New Document</h3>
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Document Label (e.g. GST Certificate 2024)"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none"
              />
              <select 
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as DocCategory})}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 outline-none"
              >
                {CATEGORIES.map(c => <option key={c} value={c} className="text-slate-900">{c}</option>)}
              </select>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={!formData.name}
                className={`w-full py-4 rounded-xl border-2 border-dashed font-bold transition-all ${formData.name ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-slate-50 text-slate-400 opacity-50'}`}
              >
                Select File & Upload
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            </div>
            <button onClick={() => setIsAdding(false)} className="w-full text-slate-400 text-xs font-bold uppercase py-2">Close</button>
          </div>
        </div>
      )}

      {/* Document List */}
      <div className="grid gap-3">
        {filteredDocs.length > 0 ? (
          filteredDocs.map(doc => (
            <div key={doc.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group active:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="bg-slate-100 p-3 rounded-xl text-slate-500">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black bg-slate-800 text-white px-1.5 py-0.5 rounded-md uppercase">{doc.category}</span>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                      {new Date(doc.uploadDate).toLocaleDateString()}
                    </p>
                  </div>
                  <h4 className="font-bold text-slate-800 truncate pr-2">{doc.name}</h4>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setPreviewDoc(doc)}
                  className="p-3 text-blue-600 bg-blue-50 rounded-xl active:scale-90 transition-transform"
                >
                  <Eye className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => onRemoveDocument(doc.id)}
                  className="p-3 text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20 opacity-30">
            <FileText className="w-16 h-16 mx-auto mb-2" />
            <p className="font-bold">No documents found.</p>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[110] bg-black p-4 flex flex-col items-center justify-center">
          <div className="w-full max-w-2xl flex justify-between items-center mb-4">
            <h3 className="text-white font-bold">{previewDoc.name}</h3>
            <button onClick={() => setPreviewDoc(null)} className="p-2 bg-white/10 rounded-full text-white"><X className="w-6 h-6" /></button>
          </div>
          {previewDoc.mimeType.startsWith('image/') ? (
            <img src={previewDoc.fileData} alt="Preview" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
          ) : (
            <div className="bg-white p-10 rounded-3xl text-center space-y-4">
              <FileText className="w-16 h-16 mx-auto text-blue-500" />
              <p className="font-bold text-slate-800">PDF Document View</p>
              <a href={previewDoc.fileData} download={previewDoc.name} className="inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">Download to View</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentManager;

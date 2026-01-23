
import React, { useState, useRef } from 'react';
import { Camera, X, CheckCircle2 } from 'lucide-react';

interface CompletionModalProps {
  onClose: () => void;
  onConfirm: (photoBase64: string) => void;
}

const CompletionModal: React.FC<CompletionModalProps> = ({ onClose, onConfirm }) => {
  const [photo, setPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = () => {
    if (photo) {
      onConfirm(photo);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <div className="bg-red-100 p-2 rounded-xl">
              <Camera className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">Photo Proof Required</h2>
              <p className="text-xs text-red-600 font-bold">Cannot complete without image</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
            <p className="text-amber-800 text-xs font-bold">
              ⚠️ Upload a photo as proof of completion before marking this task as done.
            </p>
          </div>

          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${photo ? 'border-green-500 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
          >
            {photo ? (
              <div className="relative w-full h-full">
                <img src={photo} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                  ✓ Ready
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-blue-100 rounded-full text-blue-600 animate-pulse">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-700">Tap to Add Photo</p>
                  <p className="text-xs text-slate-400">Camera or Gallery</p>
                </div>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              capture="environment"
              className="hidden"
            />
          </div>

          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-4 px-6 rounded-xl font-bold text-slate-500 bg-slate-100 active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={!photo}
              className={`flex-[2] py-4 px-6 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg ${photo ? 'bg-green-600 shadow-green-200' : 'bg-slate-300 cursor-not-allowed'}`}
            >
              <CheckCircle2 className="w-5 h-5" />
              {photo ? 'Complete Task' : 'Photo Required'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompletionModal;

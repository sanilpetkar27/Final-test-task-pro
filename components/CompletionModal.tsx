
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
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#111b21]/80 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <div className="bg-[#d9fdd3] p-2 rounded-xl">
              <Camera className="w-6 h-6 text-[#008069]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#202c33]">Photo Proof Required</h2>
              <p className="text-xs text-[#008069] font-bold">Cannot complete without image</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-[#f0f2f5] rounded-full text-[#54656f]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-[#f0f2f5] border border-[#d1d7db] p-3 rounded-xl">
            <p className="text-[#202c33] text-xs font-bold">
               Note: Upload a photo as proof of completion before marking this task as done.
            </p>
          </div>

          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${photo ? 'border-[#00a884] bg-[#d9fdd3]' : 'border-[#d1d7db] bg-[#f0f2f5] hover:bg-[#e9edef]'}`}
          >
            {photo ? (
              <div className="relative w-full h-full">
                <img src={photo} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute top-2 right-2 bg-[#00a884] text-white text-xs font-bold px-2 py-1 rounded-full">
                   Ready
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 bg-[#d9fdd3] rounded-full text-[#008069] animate-pulse">
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
              className="flex-1 py-4 px-6 rounded-xl font-bold text-[#54656f] bg-[#f0f2f5] active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={!photo}
              className={`flex-[2] py-4 px-6 rounded-xl font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg ${photo ? 'bg-[#00a884] shadow-[#00a884]/20' : 'bg-slate-300 cursor-not-allowed'}`}
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



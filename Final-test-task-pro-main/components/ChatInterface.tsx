
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { chatWithGemini } from '../services/geminiService';
import { Send, Bot, User, Loader2 } from 'lucide-react';

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'assistant', text: 'Hello! I am your Dealership Operations Assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatWithGemini(userMsg.text, messages.map(m => ({ role: m.role, text: m.text })));
      const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'assistant', text: response || 'Sorry, I couldn\'t process that.' };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: 'I had trouble connecting to my brain. Please try again later.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl p-4 flex gap-3 ${msg.role === 'user' ? 'bg-indigo-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
              <div className="mt-1 shrink-0">
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl p-4 flex gap-3 items-center">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-700" />
              <span className="text-xs font-medium text-slate-500">Gemini is thinking...</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-slate-50">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about VINs, maintenance, etc..."
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-800 focus:border-transparent"
          />
          <button 
            type="submit"
            disabled={isLoading}
            className="bg-indigo-900 hover:bg-indigo-800 text-white p-3 rounded-xl active:scale-95 disabled:opacity-50 transition-all"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;

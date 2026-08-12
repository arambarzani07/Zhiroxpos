// ==============================================
// ZHIROX - Voice Search
// تایبەتمەندی: گەڕان بە دەنگ بۆ کاڵا
// ==============================================

import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Search, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useDataStore } from '../../stores/dataStore';
import type { Product } from '../../types';

interface VoiceSearchProps {
  onProductFound: (product: Product) => void;
}

export function VoiceSearch({ onProductFound }: VoiceSearchProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const recognitionRef = useRef<any>(null);
  const { getProducts } = useDataStore();

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'ar-IQ';

      recognition.onresult = (event: any) => {
        const last = event.results[event.results.length - 1];
        const text = last[0].transcript;
        setTranscript(text);
        if (last.isFinal) {
          searchProducts(text);
        }
      };

      recognition.onerror = () => {
        setError('گەڕانی دەنگی بەردەست نییە');
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const searchProducts = (query: string) => {
    const products = getProducts().filter(p => p.status === 'active');
    const q = query.toLowerCase().trim();
    const found = products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.name_en?.toLowerCase().includes(q) ||
      p.barcode.includes(q)
    );
    setResults(found.slice(0, 5));
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setError('گەڕانی دەنگی لەم وێبگەڕە بەردەست نییە');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setTranscript('');
      setResults([]);
      setError('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={toggleListening}
        className={cn(
          'p-3 rounded-xl transition-all',
          isListening
            ? 'bg-red-100 text-red-600 animate-pulse shadow-lg shadow-red-200'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        )}
        title="گەڕان بە دەنگ"
      >
        {isListening ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>

      {/* Voice Search Popup */}
      {(isListening || transcript || results.length > 0) && (
        <div className="absolute top-full left-0 sm:right-0 sm:left-auto mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 animate-slideUp overflow-hidden">
          {/* Status */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                {isListening ? 'گوێ دەگرم...' : 'گەڕانی دەنگی'}
              </span>
              <button
                onClick={() => {
                  setTranscript('');
                  setResults([]);
                  if (isListening) recognitionRef.current?.stop();
                }}
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {isListening && (
              <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="w-1 bg-red-500 rounded-full"
                      style={{
                        height: `${Math.random() * 20 + 8}px`,
                        animation: `pulse 0.5s ease-in-out ${i * 0.1}s infinite alternate`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm text-red-600">قسە بکە...</span>
              </div>
            )}

            {transcript && (
              <div className="mt-2 p-3 bg-indigo-50 rounded-xl">
                <p className="text-sm text-indigo-700 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  {transcript}
                </p>
              </div>
            )}

            {error && (
              <p className="mt-2 text-sm text-red-500">{error}</p>
            )}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="max-h-60 overflow-y-auto">
              {results.map(product => (
                <button
                  key={product.id}
                  onClick={() => {
                    onProductFound(product);
                    setTranscript('');
                    setResults([]);
                  }}
                  className="w-full p-3 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.barcode}</p>
                  </div>
                  <p className="font-semibold text-indigo-600 text-sm">
                    {product.sale_price.toLocaleString()} د.ع
                  </p>
                </button>
              ))}
            </div>
          )}

          {transcript && results.length === 0 && !isListening && (
            <div className="p-6 text-center text-slate-500">
              <Search className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">هیچ کاڵایەک نەدۆزرایەوە</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

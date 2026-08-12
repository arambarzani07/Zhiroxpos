// ==============================================
// ZHIROX - Barcode Generator
// تایبەتمەندی: دروستکردنی بارکۆد بۆ کاڵاکان
// ==============================================

import { useState, useRef } from 'react';
import { Barcode, Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/Toast';

// Generate random barcode number
function generateRandomBarcode(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 9000 + 1000).toString();
  return `${timestamp}${random}`;
}

interface BarcodeGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (barcode: string) => void;
}

export function BarcodeGenerator({ isOpen, onClose, onSelect }: BarcodeGeneratorProps) {
  const [barcode, setBarcode] = useState('');
  const [copied, setCopied] = useState(false);
  const barcodeRef = useRef<HTMLDivElement>(null);

  const handleGenerate = () => {
    const newBarcode = generateRandomBarcode();
    setBarcode(newBarcode);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!barcode) return;
    
    try {
      await navigator.clipboard.writeText(barcode);
      setCopied(true);
      toast.success('بارکۆد کۆپی کرا');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('کۆپیکردن سەرنەکەوت');
    }
  };

  const handleSelect = () => {
    if (barcode && onSelect) {
      onSelect(barcode);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="دروستکەری بارکۆد" size="md">
      <div className="space-y-6">
        {/* Barcode Input */}
        <div>
          <Input
            label="ژمارەی بارکۆد"
            value={barcode}
            onChange={(e) => {
              setBarcode(e.target.value);
              setCopied(false);
            }}
            placeholder="بارکۆد بنووسە یان دروست بکە"
            dir="ltr"
            className="font-mono text-lg text-center"
          />
        </div>

        {/* Generate Button */}
        <Button
          variant="secondary"
          onClick={handleGenerate}
          leftIcon={<RefreshCw className="w-4 h-4" />}
          className="w-full"
        >
          دروستکردنی بارکۆدی نوێ
        </Button>

        {/* Barcode Preview */}
        {barcode && (
          <div
            ref={barcodeRef}
            className="p-6 bg-white border-2 border-dashed border-slate-200 rounded-xl text-center"
          >
            {/* Visual Barcode Lines */}
            <div className="mb-4">
              <svg viewBox="0 0 200 60" className="w-full h-20 mx-auto">
                {barcode.split('').map((char, i) => {
                  const charCode = char.charCodeAt(0);
                  const width = (charCode % 3) + 1;
                  const x = i * 15 + 10;
                  return (
                    <g key={i}>
                      <rect x={x} y="5" width={width} height="40" fill="#000" />
                      <rect x={x + width + 1} y="5" width={1} height="40" fill="#000" />
                      <rect x={x + width + 3} y="5" width={width - 1 || 1} height="40" fill="#000" />
                    </g>
                  );
                })}
              </svg>
            </div>
            
            {/* Barcode Number */}
            <p className="font-mono text-2xl font-bold tracking-wider text-slate-900" dir="ltr">
              {barcode}
            </p>
          </div>
        )}

        {/* Actions */}
        {barcode && (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleCopy}
              leftIcon={copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              className="flex-1"
            >
              {copied ? 'کۆپی کرا!' : 'کۆپیکردن'}
            </Button>
            {onSelect && (
              <Button onClick={handleSelect} className="flex-1">
                بەکارهێنان
              </Button>
            )}
          </div>
        )}

        {/* Tips */}
        <div className="p-3 bg-amber-50 rounded-xl">
          <p className="text-sm text-amber-700">
            <strong>تێبینی:</strong> ئەم بارکۆدانە بۆ کاڵاکانی بێ بارکۆد بەکاردێن. 
            دڵنیابە کە بارکۆدەکە دووبارە نەبێت.
          </p>
        </div>
      </div>
    </Modal>
  );
}

// Quick barcode generator button
export function BarcodeGeneratorButton({ onSelect }: { onSelect?: (barcode: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        leftIcon={<Barcode className="w-4 h-4" />}
      >
        دروستکردنی بارکۆد
      </Button>
      
      <BarcodeGenerator
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={onSelect}
      />
    </>
  );
}

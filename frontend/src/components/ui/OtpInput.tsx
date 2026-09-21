import React, { useRef, useEffect, useState } from 'react';

export interface OtpInputProps {
  value: string;
  onChange: (otp: string) => void;
  length?: number;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  value,
  onChange,
  length = 6,
  disabled = false,
  hasError = false,
  autoFocus = true,
  className = '',
}) => {
  const [activeBox, setActiveBox] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Split string into array of characters
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  // Auto-focus first empty slot on initial mount if autoFocus is true
  useEffect(() => {
    if (autoFocus && !disabled) {
      const firstEmptyIndex = digits.findIndex((d) => !d);
      const targetIndex = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;
      inputRefs.current[targetIndex]?.focus();
    }
  }, []);

  const handleFocus = (index: number, e: React.FocusEvent<HTMLInputElement>) => {
    setActiveBox(index);
    e.target.select();
  };

  const handleBlur = (index: number) => {
    if (activeBox === index) {
      setActiveBox(null);
    }
  };

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const cleanDigits = rawVal.replace(/\D/g, '');

    if (!cleanDigits) {
      // Cleared or non-digit typed
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join(''));
      return;
    }

    if (cleanDigits.length === 1) {
      const newDigits = [...digits];
      newDigits[index] = cleanDigits;
      const combined = newDigits.join('');
      onChange(combined);

      // Automatically move cursor to next box
      if (index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    } else {
      // User entered or pasted multiple digits directly into this box
      const newDigits = [...digits];
      for (let j = 0; j < cleanDigits.length && index + j < length; j++) {
        newDigits[index + j] = cleanDigits[j];
      }
      const combined = newDigits.join('');
      onChange(combined);

      const nextFocus = Math.min(index + cleanDigits.length, length - 1);
      inputRefs.current[nextFocus]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        // Clear current digit
        const newDigits = [...digits];
        newDigits[index] = '';
        onChange(newDigits.join(''));
      } else if (index > 0) {
        // Move backward to previous box and clear it
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
        inputRefs.current[index - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Delete') {
      const newDigits = [...digits];
      newDigits[index] = '';
      onChange(newDigits.join(''));
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    const cleanPasted = pasted.replace(/\D/g, '').slice(0, length);
    if (!cleanPasted) return;

    const newDigits = Array.from({ length }, (_, i) => cleanPasted[i] || '');
    onChange(newDigits.join(''));

    // Focus the first empty slot, or the last slot if full
    const nextEmptyIndex = newDigits.findIndex((d) => !d);
    const focusTarget = nextEmptyIndex !== -1 ? nextEmptyIndex : length - 1;
    inputRefs.current[focusTarget]?.focus();
  };

  return (
    <div
      role="group"
      aria-label="6-digit verification code input"
      className={`flex items-center justify-center gap-2 sm:gap-3 w-full ${className}`}
    >
      {digits.map((digit, index) => {
        const isFocused = activeBox === index;
        const isFilled = Boolean(digit);

        return (
          <div key={index} className="relative flex flex-col items-center">
            <input
              ref={(el) => {
                inputRefs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={index === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              value={digit}
              disabled={disabled}
              aria-label={`Digit ${index + 1} of ${length}`}
              onFocus={(e) => handleFocus(index, e)}
              onBlur={() => handleBlur(index)}
              onChange={(e) => handleChange(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              className={`
                w-10 h-13 sm:w-12 sm:h-14
                text-center text-xl sm:text-2xl font-bold font-mono
                rounded-xl border outline-none
                transition-all duration-150 select-none
                ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200' : ''}
                ${
                  hasError
                    ? 'border-red-400 bg-red-50/40 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-400/30'
                    : isFocused
                    ? 'border-blue-600 ring-2 ring-blue-500/25 bg-blue-50/30 text-blue-900 scale-105 shadow-sm'
                    : isFilled
                    ? 'border-blue-900/40 bg-blue-50/15 text-blue-950 font-bold shadow-xs'
                    : 'border-gray-200 bg-gray-50/80 text-gray-800 hover:border-gray-300 hover:bg-white'
                }
              `}
            />
            {/* Visual active bottom bar indicator */}
            <div
              className={`
                w-5 h-1 mt-1.5 rounded-full transition-all duration-150
                ${
                  hasError
                    ? 'bg-red-400'
                    : isFocused
                    ? 'bg-blue-600 scale-x-125'
                    : isFilled
                    ? 'bg-blue-900/40'
                    : 'bg-transparent'
                }
              `}
            />
          </div>
        );
      })}
    </div>
  );
};

export default OtpInput;

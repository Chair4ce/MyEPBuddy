"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onChange: (value: string) => void;
  /** Country code prefix - defaults to "+1" for US */
  countryCode?: string;
}

/**
 * Formats a raw digit string to US phone format: (XXX) XXX-XXXX
 */
function formatPhoneDisplay(digits: string): string {
  const cleaned = digits.replace(/\D/g, "").slice(0, 10);
  
  if (cleaned.length === 0) return "";
  if (cleaned.length <= 3) return `(${cleaned}`;
  if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
}

/**
 * Extracts just the digits from a formatted phone string
 */
function extractDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

/**
 * PhoneInput - Auto-formatting phone number input
 * 
 * Stores the raw 10-digit number in value, displays formatted as (XXX) XXX-XXXX
 * The country code is displayed as a prefix but not editable
 */
const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, countryCode = "+1", disabled, ...props }, ref) => {
    // Track cursor position for better UX
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [cursorPosition, setCursorPosition] = React.useState<number | null>(null);

    // Merge refs
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // Get the display value from the raw digits
    const displayValue = formatPhoneDisplay(value);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      const digits = extractDigits(input);
      
      // Store cursor position before update
      const cursorPos = e.target.selectionStart || 0;
      
      // Calculate new cursor position based on formatting
      const oldDigitsBefore = extractDigits(displayValue.slice(0, cursorPosition || 0)).length;
      const newDigits = digits;
      
      onChange(newDigits);
      
      // Calculate where cursor should be after formatting
      if (inputRef.current) {
        const formatted = formatPhoneDisplay(newDigits);
        let newCursorPos = 0;
        let digitCount = 0;
        const targetDigits = Math.min(oldDigitsBefore + (newDigits.length > value.length ? 1 : -1), newDigits.length);
        
        for (let i = 0; i < formatted.length && digitCount < targetDigits; i++) {
          newCursorPos = i + 1;
          if (/\d/.test(formatted[i])) {
            digitCount++;
          }
        }
        
        setCursorPosition(newCursorPos);
      }
    };

    // Handle backspace and delete key behavior
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && inputRef.current) {
        const start = inputRef.current.selectionStart || 0;
        const end = inputRef.current.selectionEnd || 0;
        
        // If cursor is right after a formatting character, move it back one more
        if (start === end && start > 0) {
          const charBefore = displayValue[start - 1];
          if (!/\d/.test(charBefore)) {
            // Find the previous digit and remove it
            let newPos = start - 1;
            while (newPos > 0 && !/\d/.test(displayValue[newPos - 1])) {
              newPos--;
            }
            if (newPos > 0) {
              e.preventDefault();
              const digitsBefore = extractDigits(displayValue.slice(0, newPos));
              const digitsAfter = extractDigits(displayValue.slice(start));
              const newDigits = digitsBefore.slice(0, -1) + digitsAfter;
              onChange(newDigits);
            }
          }
        }
      }
    };

    // Restore cursor position after render
    React.useEffect(() => {
      if (cursorPosition !== null && inputRef.current) {
        inputRef.current.setSelectionRange(cursorPosition, cursorPosition);
        setCursorPosition(null);
      }
    }, [cursorPosition, displayValue]);

    const isComplete = value.length === 10;

    return (
      <div className="flex">
        <div 
          className={cn(
            "flex items-center justify-center px-3 border border-r-0 rounded-l-md bg-muted text-muted-foreground text-sm font-medium min-w-[52px]",
            disabled && "opacity-50"
          )}
          aria-label="Country code"
        >
          {countryCode}
        </div>
        <Input
          {...props}
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={cn(
            "rounded-l-none",
            isComplete && "border-green-500 focus-visible:ring-green-500/20",
            className
          )}
          placeholder="(555) 123-4567"
          maxLength={14} // (XXX) XXX-XXXX = 14 chars
          autoComplete="tel-national"
          aria-label="Phone number"
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput, formatPhoneDisplay, extractDigits };

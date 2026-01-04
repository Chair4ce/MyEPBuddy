"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ComboboxInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

export function ComboboxInput({
  value,
  onChange,
  options,
  placeholder = "Select or type a verb...",
  className,
  "aria-label": ariaLabel,
}: ComboboxInputProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // Check if current search matches an option exactly
  const hasExactMatch = options.some(
    (opt) => opt.toLowerCase() === search.toLowerCase()
  );

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setSearch("");
    setOpen(false);
  };

  const handleUseCustom = () => {
    if (search.trim()) {
      onChange(search.trim());
      setSearch("");
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          {value || placeholder}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Type to filter or add custom..."
            value={search}
            onValueChange={setSearch}
            onKeyDown={(e) => {
              if (e.key === "Enter" && search.trim() && !hasExactMatch) {
                e.preventDefault();
                handleUseCustom();
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  type="button"
                  onClick={handleUseCustom}
                  className="w-full px-2 py-1.5 text-sm text-primary hover:bg-accent rounded-sm"
                >
                  Use &quot;{search.trim()}&quot;
                </button>
              ) : (
                "No options available."
              )}
            </CommandEmpty>
            <CommandGroup>
              {/* Custom option when typing something new */}
              {search.trim() && !hasExactMatch && (
                <CommandItem
                  value={`__custom__${search}`}
                  onSelect={handleUseCustom}
                  className="text-primary"
                >
                  Use &quot;{search.trim()}&quot;
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => handleSelect(option)}
                >
                  {option}
                  <Check
                    className={cn(
                      "ml-auto",
                      value === option ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

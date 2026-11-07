'use client';

import { useState, useEffect } from 'react';

type ModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: (inputValue?: string) => void;
  onCancel: () => void;
  requireInput?: boolean;
  inputPlaceholder?: string;
  confirmText?: string;
  isDanger?: boolean;
  isLoading?: boolean;
};

export default function Modal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  requireInput = false,
  inputPlaceholder = 'Type here...',
  confirmText = 'Confirm',
  isDanger = false,
  isLoading = false,
}: ModalProps) {
  const [inputValue, setInputValue] = useState('');

  // Reset input when opened/closed
  useEffect(() => {
    if (isOpen) setInputValue('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden transition-colors">
        
        <div className="p-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{message}</p>
          
          {requireInput && (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-3 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(inputValue)}
            disabled={isLoading || (requireInput && !inputValue.trim())}
            className={`px-4 py-2 text-sm font-medium text-white rounded transition-colors disabled:opacity-50 ${
              isDanger 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>

      </div>
    </div>
  );
}

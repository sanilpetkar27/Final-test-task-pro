import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading: boolean;
  loadingText?: string;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  className?: string;
}

/**
 * LoadingButton - Button with built-in loading state
 *
 * @example
 * const [isLoading, setIsLoading] = useState(false);
 *
 * const handleClick = async () => {
 *   setIsLoading(true);
 *   try {
 *     await someAsyncOperation();
 *   } finally {
 *     setIsLoading(false);
 *   }
 * };
 *
 * <LoadingButton
 *   isLoading={isLoading}
 *   loadingText="Processing..."
 *   variant="primary"
 *   onClick={handleClick}
 * >
 *   Submit
 * </LoadingButton>
 */
const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading,
  loadingText = 'Processing...',
  children,
  variant = 'primary',
  className = '',
  disabled,
  ...rest
}) => {
  const baseStyles =
    'px-4 py-2 rounded-lg font-medium transition-all duration-150 flex items-center justify-center';

  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
  };

  const disabledStyles = 'opacity-50 cursor-not-allowed';
  const isDisabled = isLoading || disabled;

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${
        isDisabled ? disabledStyles : ''
      } ${className}`}
      disabled={isDisabled}
      {...rest}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default LoadingButton;

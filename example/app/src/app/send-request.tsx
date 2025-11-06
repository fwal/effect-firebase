import { useState } from 'react';
import { Schema } from 'effect';

export interface SendRequestProps<A, I> {
  title: string;
  description: string;
  onSendRequest: (input?: unknown) => Promise<unknown>;
  showInput?: boolean;
  inputPlaceholder?: string;
  inputSchema?: Schema.Schema<A, I, never>;
}

export default function SendRequest<A, I>({
  title,
  description,
  onSendRequest,
  showInput = false,
  inputPlaceholder = '{\n  "key": "value"\n}',
  inputSchema,
}: SendRequestProps<A, I>) {
  const [loading, setLoading] = useState(false);
  const [validateInput, setValidateInput] = useState(true);
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputJson, setInputJson] = useState(inputPlaceholder);
  const [inputError, setInputError] = useState<string | null>(null);

  const validateAndParseJson = (): unknown | null => {
    if (!showInput) return null;

    try {
      const parsed = JSON.parse(inputJson);
      const validated =
        inputSchema && validateInput
          ? Schema.decodeUnknownSync(inputSchema)(parsed)
          : parsed;
      setInputError(null);
      return validated;
    } catch (err) {
      setInputError(err instanceof Error ? err.message : 'Invalid JSON');
      return null;
    }
  };

  const handleInputChange = (value: string) => {
    setInputJson(value);
    // Clear input error when user starts typing
    if (inputError) {
      setInputError(null);
    }
  };

  const handleSendRequest = async () => {
    setLoading(true);
    setError(null);

    try {
      let parsedInput: unknown = undefined;

      if (showInput) {
        parsedInput = validateAndParseJson();
        if (inputError || parsedInput === null) {
          setLoading(false);
          return;
        }
      }

      const data = await onSendRequest(parsedInput);
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Description Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-xl font-semibold text-blue-900 mb-2">{title}</h2>
        <p className="text-blue-700">{description}</p>
      </div>

      {/* Input JSON Section */}
      {showInput && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Request Input (JSON)
            </label>
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium text-gray-700">
                Validate Input
              </label>

              <input
                type="checkbox"
                checked={validateInput}
                onChange={(e) => setValidateInput(e.target.checked)}
              />
            </div>
          </div>
          <div className="relative">
            <textarea
              value={inputJson}
              onChange={(e) => handleInputChange(e.target.value)}
              className={`w-full h-40 p-3 font-mono text-sm bg-gray-50 border rounded-lg 
                         focus:outline-none focus:ring-2 focus:ring-blue-500 
                         ${
                           inputError
                             ? 'border-red-500 focus:ring-red-500'
                             : 'border-gray-300'
                         }`}
              placeholder={inputPlaceholder}
            />
            {inputError && (
              <div
                className="absolute bottom-2 right-2 bg-red-100 border border-red-300 
                            rounded px-2 py-1 text-xs text-red-700"
              >
                {inputError}
              </div>
            )}
          </div>
          {inputError && (
            <p className="text-sm text-red-600">
              Please fix the error before sending the request.
            </p>
          )}
        </div>
      )}

      {/* Action Button */}
      <div className="flex justify-center">
        <button
          onClick={handleSendRequest}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg 
                     hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-400 
                     disabled:cursor-not-allowed transition-colors duration-200
                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </span>
          ) : (
            'Send Request'
          )}
        </button>
      </div>

      {/* Response/Error Display */}
      {(response || error) && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-mono text-gray-300">
              {error ? 'Error' : 'Response'}
            </span>
            {(response || error) && (
              <button
                onClick={() => {
                  setResponse(null);
                  // If you also want to clear errors, uncomment the next line
                  // setError?.(null);
                }}
                className="text-gray-400 hover:text-white text-sm"
              >
                Clear
              </button>
            )}
          </div>
          <div className="bg-gray-900 p-4 max-h-96 overflow-auto">
            <pre
              className={`text-sm font-mono ${
                error ? 'text-red-400' : 'text-green-400'
              }`}
            >
              {error
                ? typeof error === 'string'
                  ? error
                  : JSON.stringify(error, null, 2)
                : response
                ? JSON.stringify(response, null, 2)
                : null}
            </pre>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!response && !error && !loading && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
          <svg
            className="mx-auto h-12 w-12 mb-3 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p>No data yet. Click the button above to send a request.</p>
        </div>
      )}
    </div>
  );
}

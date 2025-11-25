import { useState } from 'react';
import { Schema } from 'effect';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  TextArea,
  EmptyState,
  CodeBlock,
  Checkbox,
} from './core';

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
      <Card variant="info">
        <CardHeader variant="info">{title}</CardHeader>
        <CardContent variant="info">{description}</CardContent>
      </Card>

      {/* Input JSON Section */}
      {showInput && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Request Input (JSON)
            </label>
            <Checkbox
              label="Validate Input"
              checked={validateInput}
              onChange={(e) => setValidateInput(e.target.checked)}
            />
          </div>
          <TextArea
            value={inputJson}
            onChange={(e) => handleInputChange(e.target.value)}
            error={inputError || undefined}
            placeholder={inputPlaceholder}
            className="h-40"
          />
          {inputError && (
            <p className="text-sm text-red-600">
              Please fix the error before sending the request.
            </p>
          )}
        </div>
      )}

      {/* Action Button */}
      <div className="flex justify-center">
        <Button
          onClick={handleSendRequest}
          isLoading={loading}
          disabled={loading}
          size="lg"
        >
          Send Request
        </Button>
      </div>

      {/* Response/Error Display */}
      {(response || error) && (
        <CodeBlock
          code={error || response}
          title={error ? 'Error' : 'Response'}
          variant={error ? 'error' : 'success'}
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setResponse(null);
                setError(null);
              }}
            >
              Clear
            </Button>
          }
        />
      )}

      {/* Empty State */}
      {!response && !error && !loading && (
        <EmptyState message="No data yet. Click the button above to send a request." />
      )}
    </div>
  );
}

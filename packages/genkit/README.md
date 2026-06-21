# @effect-firebase/genkit

Bridge [Effect](https://effect.website) into [Genkit](https://genkit.dev) and Firebase Cloud Functions' `onCallGenkit`.

> [!WARNING]
> Under heavy development. APIs may change.

## Install

```bash
npm install @effect-firebase/genkit effect effect-firebase genkit firebase-functions
```

## What this gives you

- **`GenkitLanguageModel`** — an Effect [`LanguageModel`](https://effect.website/docs/ai/introduction/) (`effect/unstable/ai`) provider backed by a Genkit instance. Author agents with Effect's AI API (`LanguageModel`, `Chat`, `Toolkit`) while every model call runs through `ai.generate` — so it is traced by Genkit and observable in the Genkit Developer UI and Firebase monitoring.
- **`makeTool`** — convert an Effect `Tool` (with `Schema` parameters / success / failure) into a Genkit `ToolAction`. Effect schemas are converted to JSON Schema for the model.
- **`onCallGenkitEffect`** — schema-driven callable backed by a Genkit flow, mirroring `onCallEffect` from `@effect-firebase/admin`. Typed Effect handlers, optional input/output decoding via `Schema`, tools wired in via Genkit.

## Writing Effect AI code that runs on Genkit

`GenkitLanguageModel.layer(ai, { model })` provides an Effect `LanguageModel`
whose `generateText` / `streamText` delegate to `ai.generate` /
`ai.generateStream`. You write to Effect's AI API; Genkit supplies the model,
tracing, and telemetry.

```ts
import { Effect } from 'effect';
import { LanguageModel } from 'effect/unstable/ai';
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { GenkitLanguageModel } from '@effect-firebase/genkit';

const ai = genkit({ plugins: [googleAI()] });

const program = LanguageModel.generateText({
  prompt: 'Why is the sky blue?',
}).pipe(
  Effect.provide(
    GenkitLanguageModel.layer(ai, { model: 'googleai/gemini-2.0-flash' })
  )
);
```

Tool calling works through Effect's `Toolkit` — tools are forwarded to the
model and tool requests are returned for Effect to execute
(`returnToolRequests`), so the agentic loop stays on the Effect side.

### Observability

`ai.generate` calls are traced as Genkit model actions, so they appear in the
Genkit Developer UI (`genkit start`) and in Firebase monitoring once the
consumer enables the `firebase()` plugin / `enableFirebaseTelemetry()`. For
full end-to-end flow traces, run the Effect program inside a Genkit flow — for
example via `onCallGenkitEffect` below — and the model spans nest under the
flow span.

Per-call generation settings (`temperature`, `maxOutputTokens`, …) are passed
via the layer's `config` option, since Effect's provider interface does not
carry them per request:

```ts
GenkitLanguageModel.layer(ai, {
  model: 'googleai/gemini-2.0-flash',
  config: { temperature: 0.2 },
});
```

## Quickstart

```ts
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { Schema, Effect, Tool } from 'effect';
import { FunctionsRuntime } from '@effect-firebase/admin';
import { makeTool, onCallGenkitEffect } from '@effect-firebase/genkit';

const ai = genkit({ plugins: [googleAI()] });
const runtime = FunctionsRuntime.Default();

const GetWeather = Tool.make('getWeather', {
  description: 'Get current weather for a city',
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.Struct({ tempC: Schema.Number }),
  failure: Schema.Struct({ reason: Schema.Literal('city_not_found') }),
});

const getWeather = makeTool(ai, GetWeather,
  ({ city }) => Effect.succeed({ tempC: 21 }),
  { runtime }
);

export const summarize = onCallGenkitEffect(ai, {
  name: 'summarize',
  region: 'europe-north1',
  runtime,
  tools: [getWeather],
  inputSchema: Schema.Struct({ text: Schema.String }),
  outputSchema: Schema.Struct({ summary: Schema.String }),
}, ({ text }) => Effect.gen(function* () {
  const { text: summary } = yield* Effect.promise(() =>
    ai.generate({ prompt: `Summarize: ${text}`, tools: [getWeather] })
  );
  return { summary };
}));
```

## Failure handling

If your Effect `Tool` declares a `failureSchema`, typed failures from the
handler are encoded through that schema and thrown as a `GenkitError` with
`status: 'FAILED_PRECONDITION'` and the encoded payload on `detail`. Defects
(unexpected errors) surface as `GenkitError` with `status: 'INTERNAL'`.

## Notes

- Genkit's `FlowConfig` does not accept JSON Schema (only Zod). Input and
  output validation for `onCallGenkitEffect` runs through Effect's `Schema`
  inside the handler — the flow itself is registered without a Zod schema.
- `firebase-functions` is an optional peer dependency. Skip installing it if
  you only need `makeTool` and not the callable wrapper.
- `GenkitLanguageModel` currently supports text generation, streaming, and
  tool calling. Structured output (`LanguageModel.generateObject`) is not yet
  mapped — `responseFormat: "json"` requests are treated as text.

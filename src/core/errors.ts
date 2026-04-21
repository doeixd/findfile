import { Schema } from "effect"

export class BackendInitError extends Schema.TaggedError<BackendInitError>()(
  "BackendInitError",
  {
    backend: Schema.String,
    cwd: Schema.String,
    message: Schema.String,
  },
) {}

export class SearchExecutionError extends Schema.TaggedError<SearchExecutionError>()(
  "SearchExecutionError",
  {
    backend: Schema.String,
    query: Schema.String,
    message: Schema.String,
  },
) {}

export class ConfigLoadError extends Schema.TaggedError<ConfigLoadError>()(
  "ConfigLoadError",
  {
    path: Schema.String,
    message: Schema.String,
  },
) {}

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  "ConfigValidationError",
  {
    path: Schema.String,
    issues: Schema.String,
  },
) {}

export class QmdUnavailableError extends Schema.TaggedError<QmdUnavailableError>()(
  "QmdUnavailableError",
  {
    reason: Schema.String,
  },
) {}

export class PreviewReadError extends Schema.TaggedError<PreviewReadError>()(
  "PreviewReadError",
  {
    path: Schema.String,
    message: Schema.String,
  },
) {}

export type SearchError =
  | BackendInitError
  | SearchExecutionError
  | QmdUnavailableError

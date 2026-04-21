import { Schema } from "effect"

export const Mode = Schema.Literal("files", "dirs", "content", "semantic")
export type Mode = typeof Mode.Type

export const GrepMode = Schema.Literal("plain", "regex", "fuzzy")
export type GrepMode = typeof GrepMode.Type

export const SearchPath = Schema.String.pipe(Schema.brand("@findfile/SearchPath"))
export type SearchPath = typeof SearchPath.Type

export const Source = Schema.String.pipe(Schema.brand("@findfile/Source"))
export type Source = typeof Source.Type

export const GitStatus = Schema.String
export type GitStatus = typeof GitStatus.Type

export const Match = Schema.Struct({
  line: Schema.Int,
  col: Schema.Int,
  preview: Schema.String,
  ranges: Schema.optional(Schema.Array(Schema.Tuple(Schema.Int, Schema.Int))),
  contextBefore: Schema.optional(Schema.Array(Schema.String)),
  contextAfter: Schema.optional(Schema.Array(Schema.String)),
})
export type Match = typeof Match.Type

export const SearchFilters = Schema.Struct({
  globs: Schema.optional(Schema.Array(Schema.String)),
  types: Schema.optional(Schema.Array(Schema.String)),
  maxDepth: Schema.optional(Schema.Int.pipe(Schema.positive())),
  modifiedSinceSec: Schema.optional(Schema.Int.pipe(Schema.positive())),
  caseInsensitive: Schema.optional(Schema.Boolean),
  wordBoundary: Schema.optional(Schema.Boolean),
  beforeContext: Schema.optional(Schema.Int.pipe(Schema.nonNegative())),
  afterContext: Schema.optional(Schema.Int.pipe(Schema.nonNegative())),
  pathAllowlist: Schema.optional(Schema.Array(Schema.String)),
  hidden: Schema.optional(Schema.Boolean),
})
export type SearchFilters = typeof SearchFilters.Type

export const ModeDefaults = Schema.Struct({
  grepMode: Schema.optional(GrepMode),
  globs: Schema.optional(Schema.Array(Schema.String)),
  types: Schema.optional(Schema.Array(Schema.String)),
  maxDepth: Schema.optional(Schema.Int.pipe(Schema.positive())),
  modifiedSince: Schema.optional(Schema.String),
  caseInsensitive: Schema.optional(Schema.Boolean),
  wordBoundary: Schema.optional(Schema.Boolean),
  beforeContext: Schema.optional(Schema.Int.pipe(Schema.nonNegative())),
  afterContext: Schema.optional(Schema.Int.pipe(Schema.nonNegative())),
  hidden: Schema.optional(Schema.Boolean),
})
export type ModeDefaults = typeof ModeDefaults.Type

export const SearchQuery = Schema.Struct({
  text: Schema.String,
  mode: Mode,
  cwd: SearchPath,
  limit: Schema.optional(Schema.Int.pipe(Schema.positive())),
  grepMode: Schema.optional(GrepMode),
  filters: Schema.optional(SearchFilters),
})
export interface SearchQuery extends Schema.Schema.Type<typeof SearchQuery> {
  readonly findfileIgnore?: (relPath: string) => boolean
}

export const SearchResult = Schema.Struct({
  path: SearchPath,
  relativePath: Schema.String,
  kind: Schema.Literal("file", "dir"),
  score: Schema.optional(Schema.Number),
  match: Schema.optional(Match),
  gitStatus: Schema.optional(GitStatus),
  source: Source,
  modifiedSec: Schema.optional(Schema.Number),
})
export type SearchResult = typeof SearchResult.Type

import type { Stream } from "effect"
import type { Mode, SearchQuery, SearchResult } from "../schema.ts"
import type { SearchError } from "../errors.ts"

export interface BackendSearch {
  readonly search: (
    query: SearchQuery,
  ) => Stream.Stream<SearchResult, SearchError>
  readonly supports: (mode: Mode) => boolean
}
